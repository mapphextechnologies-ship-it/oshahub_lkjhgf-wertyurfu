import { isCallbackAuthorized } from '../_lib/callbackAuth.js';
import { completeProviderC2BPayment, logPaymentEvent } from '../_lib/database.js';
import { parseDarajaC2BConfirmation } from '../_lib/daraja.js';
import { readJson, sendJson } from '../_lib/http.js';

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

async function safeLog(action, details) {
  await logPaymentEvent(action, details).catch((error) => {
    console.error('[mpesa-confirmation-log-failed]', action, error?.message || error);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 200, { ok: true });
    return;
  }

  try {
    if (!isCallbackAuthorized(req, ['PAYMENT_CALLBACK_SECRET', 'WEBHOOK_SECRET'], { allowPublicPaymentCallbacks: true })) {
      await safeLog('mpesa_c2b_confirmation_unauthorized', {
        path: '/api/mpesa/confirmation'
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    const body = await readJson(req);
    const confirmation = parseDarajaC2BConfirmation(body);
    if (!confirmation?.transactionId) {
      await safeLog('mpesa_c2b_missing_transaction_reference', {
        rawBody: body
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    await safeLog('mpesa_c2b_confirmation_received', {
      transactionId: confirmation.transactionId,
      accountReference: confirmation.accountReference || '',
      amount: Number(confirmation.amount || 0),
      phone: confirmation.phone || '',
      paidAt: confirmation.paidAt || '',
      rawBody: body
    });

    let result;
    try {
      result = await completeProviderC2BPayment({
        amount: confirmation.amount,
        phone: confirmation.phone,
        receipt: confirmation.transactionId,
        providerReference: confirmation.transactionId,
        providerTransactionId: confirmation.transactionId,
        providerResponse: body,
        paidAt: mpesaDateToIso(confirmation.paidAt),
        accountReference: confirmation.accountReference,
        method: 'mpesa_c2b'
      });
    } catch (error) {
      await safeLog('mpesa_c2b_confirmation_failed', {
        transactionId: confirmation.transactionId,
        accountReference: confirmation.accountReference || '',
        amount: Number(confirmation.amount || 0),
        phone: confirmation.phone || '',
        error: error.message
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (!result.duplicate && result.customer && result.payment?.id) {
      await safeLog('mpesa_c2b_payment_created', {
        transactionId: confirmation.transactionId,
        paymentId: result.payment?.id || '',
        customerId: result.customer?.id || '',
        customerName: result.customer?.customer_name || '',
        accountReference: confirmation.accountReference || '',
        amount: result.paidAmount,
        balance: result.nextBalance
      });
    } else if (result.duplicate) {
      await safeLog('mpesa_c2b_payment_duplicate', {
        transactionId: confirmation.transactionId,
        paymentId: result.payment?.id || '',
        accountReference: confirmation.accountReference || '',
        amount: Number(confirmation.amount || 0)
      });
    } else if (result.pendingMatch) {
      await safeLog('mpesa_c2b_payment_pending_match', {
        transactionId: confirmation.transactionId,
        paymentId: result.payment?.id || '',
        accountReference: confirmation.accountReference || '',
        amount: Number(confirmation.amount || 0)
      });
    }

    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('[mpesa-confirmation-failed]', error?.message || error);
    sendJson(res, 200, { ok: true });
  }
}
