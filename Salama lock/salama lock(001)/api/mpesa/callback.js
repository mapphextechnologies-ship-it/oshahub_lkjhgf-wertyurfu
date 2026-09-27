import { isCallbackAuthorized } from '../_lib/callbackAuth.js';
import { completePaymentRequest, failPaymentRequest, logPaymentEvent } from '../_lib/database.js';
import { parseDarajaStkCallback } from '../_lib/daraja.js';
import { readJson, sendJson } from '../_lib/http.js';
import { getSupabase } from '../_lib/supabase.js';

function mpesaDateToIso(value) {
  const text = String(value || '');
  if (!/^\d{14}$/.test(text)) return new Date().toISOString();
  const year = text.slice(0, 4);
  const month = text.slice(4, 6);
  const day = text.slice(6, 8);
  const hour = text.slice(8, 10);
  const minute = text.slice(10, 12);
  const second = text.slice(12, 14);
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+03:00`).toISOString();
}

async function findPaymentRequest(callback) {
  const references = [
    callback.checkoutRequestId,
    callback.merchantRequestId,
    callback.transactionId,
    callback.receipt
  ].filter(Boolean);

  for (const reference of references) {
    const result = await getSupabase()
      .from('payment_requests')
      .select('*, customers(*)')
      .or(`provider_reference.eq.${reference},backend_reference.eq.${reference}`)
      .maybeSingle();

    if (result.error) throw result.error;
    if (result.data) return result.data;
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    if (!isCallbackAuthorized(req)) {
      sendJson(res, 401, { message: 'M-PESA callback is not authorized.' });
      return;
    }

    const body = await readJson(req);
    const callback = parseDarajaStkCallback(body);

    if (!callback?.checkoutRequestId && !callback?.merchantRequestId) {
      await logPaymentEvent('mpesa_stk_missing_reference', { rawBody: body });
      sendJson(res, 400, { message: 'Missing Daraja STK callback reference.' });
      return;
    }

    await logPaymentEvent('mpesa_stk_callback_received', {
      checkoutRequestId: callback.checkoutRequestId || '',
      merchantRequestId: callback.merchantRequestId || '',
      transactionId: callback.transactionId || '',
      receipt: callback.receipt || '',
      amount: Number(callback.amount || 0),
      phone: callback.phone || ''
    });

    const paymentRequest = await findPaymentRequest(callback);
    if (!paymentRequest) {
      await logPaymentEvent('mpesa_stk_payment_request_not_found', {
        checkoutRequestId: callback.checkoutRequestId || '',
        merchantRequestId: callback.merchantRequestId || '',
        transactionId: callback.transactionId || '',
        receipt: callback.receipt || ''
      });
      sendJson(res, 404, { message: 'Payment request not found.' });
      return;
    }

    if (callback.success) {
      let result;
      try {
        result = await completePaymentRequest(paymentRequest, {
          amount: callback.amount || paymentRequest.amount,
          phone: callback.phone || paymentRequest.phone,
          receipt: callback.receipt || callback.transactionId,
          providerReference: callback.checkoutRequestId || callback.merchantRequestId,
          providerTransactionId: callback.receipt || callback.transactionId,
          providerResponse: body,
          paidAt: mpesaDateToIso(callback.raw?.Body?.stkCallback?.CallbackMetadata?.Item?.find((item) => item.Name === 'TransactionDate')?.Value),
          method: 'mpesa_stk_push'
        });
      } catch (error) {
        await logPaymentEvent('mpesa_stk_callback_failed', {
          checkoutRequestId: callback.checkoutRequestId || '',
          merchantRequestId: callback.merchantRequestId || '',
          transactionId: callback.transactionId || '',
          receipt: callback.receipt || '',
          paymentRequestId: paymentRequest.id,
          error: error.message
        });
        throw error;
      }

      if (!result.duplicate && result.customer && result.payment?.id) {
        await logPaymentEvent('mpesa_stk_payment_created', {
          checkoutRequestId: callback.checkoutRequestId || '',
          merchantRequestId: callback.merchantRequestId || '',
          transactionId: callback.transactionId || '',
          receipt: callback.receipt || '',
          paymentId: result.payment?.id || '',
          customerId: result.customer?.id || '',
          customerName: result.customer?.customer_name || '',
          amount: result.paidAmount,
          balance: result.nextBalance
        });
      } else if (result.duplicate) {
        await logPaymentEvent('mpesa_stk_payment_duplicate', {
          checkoutRequestId: callback.checkoutRequestId || '',
          merchantRequestId: callback.merchantRequestId || '',
          transactionId: callback.transactionId || '',
          receipt: callback.receipt || '',
          paymentRequestId: paymentRequest.id,
          paymentId: result.payment?.id || ''
        });
      } else if (result.pendingMatch) {
        await logPaymentEvent('mpesa_stk_payment_pending_match', {
          checkoutRequestId: callback.checkoutRequestId || '',
          merchantRequestId: callback.merchantRequestId || '',
          transactionId: callback.transactionId || '',
          receipt: callback.receipt || '',
          paymentRequestId: paymentRequest.id,
          paymentId: result.payment?.id || ''
        });
      }
    } else {
      await failPaymentRequest(paymentRequest.id, {
        reason: callback.resultDescription || 'M-PESA payment failed.',
        providerResponse: body
      });
      await logPaymentEvent('mpesa_stk_payment_failed', {
        checkoutRequestId: callback.checkoutRequestId || '',
        merchantRequestId: callback.merchantRequestId || '',
        transactionId: callback.transactionId || '',
        receipt: callback.receipt || '',
        paymentRequestId: paymentRequest.id,
        reason: callback.resultDescription || 'M-PESA payment failed.'
      });
    }

    sendJson(res, 200, { ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
