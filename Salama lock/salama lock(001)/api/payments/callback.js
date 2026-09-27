import { completePaymentRequest, failPaymentRequest } from '../_lib/database.js';
import { isCallbackAuthorized } from '../_lib/callbackAuth.js';
import { parseDarajaStkCallback } from '../_lib/daraja.js';
import { readJson, sendJson } from '../_lib/http.js';
import { getSupabase } from '../_lib/supabase.js';

function parseAmount(value) {
  const match = String(value || '').replace(/,/g, '').match(/[\d.]+/);
  return match ? Number(match[0]) : 0;
}

async function safeFailPaymentRequest(paymentRequestId, payload) {
  await failPaymentRequest(paymentRequestId, payload).catch((error) => {
    console.error('[payments-callback-fail-failed]', paymentRequestId, error?.message || error);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 200, { ok: true });
    return;
  }

  try {
    if (!isCallbackAuthorized(req)) {
      sendJson(res, 200, { ok: true });
      return;
    }

    const body = await readJson(req);
    const darajaCallback = parseDarajaStkCallback(body);
    const transactionId = darajaCallback?.checkoutRequestId ||
      darajaCallback?.merchantRequestId ||
      body.transactionId ||
      body.provider_reference ||
      body.id;
    const paid = darajaCallback ? darajaCallback.success : String(body.status || '').toLowerCase() === 'success';
    const amount = parseAmount(body.value || body.amount);
    const phone = darajaCallback?.phone || body.phoneNumber || body.phone;

    if (!transactionId) {
      sendJson(res, 200, { ok: true });
      return;
    }

    const requestResult = await getSupabase()
      .from('payment_requests')
      .select('*, customers(*)')
      .or(`provider_reference.eq.${transactionId},backend_reference.eq.${transactionId}`)
      .maybeSingle();

    if (requestResult.error) throw requestResult.error;
    if (!requestResult.data) {
      sendJson(res, 200, { ok: true });
      return;
    }

    const paymentRequest = requestResult.data;

    if (paid) {
      try {
        await completePaymentRequest(paymentRequest, {
          amount: darajaCallback?.amount || amount || paymentRequest.amount,
          phone,
          receipt: darajaCallback?.receipt || transactionId,
          providerReference: transactionId,
          providerTransactionId: darajaCallback?.receipt || transactionId,
          providerResponse: body,
          paidAt: new Date().toISOString(),
          method: darajaCallback ? 'mpesa_stk_push' : 'provider_mobile_checkout'
        });

      } catch (error) {
        console.error('[payments-callback-processing-failed]', error?.message || error);
      }
    } else {
      await safeFailPaymentRequest(paymentRequest.id, {
        reason: darajaCallback?.resultDescription || body.description || body.message || 'Payment failed.',
        providerResponse: body
      });
    }

    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('[payments-callback-failed]', error?.message || error);
    sendJson(res, 200, { ok: true });
  }
}
