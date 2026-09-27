import { isCallbackAuthorized } from '../_lib/callbackAuth.js';
import { findCustomerForC2BPaybillReference, logPaymentEvent } from '../_lib/database.js';
import { readJson, sendJson } from '../_lib/http.js';

async function safeLog(action, details) {
  await logPaymentEvent(action, details).catch((error) => {
    console.error('[mpesa-validation-log-failed]', action, error?.message || error);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 200, { ResultCode: 1, ResultDesc: 'Method not allowed.' });
    return;
  }

  try {
    if (!isCallbackAuthorized(req, ['PAYMENT_CALLBACK_SECRET', 'WEBHOOK_SECRET'], { allowPublicPaymentCallbacks: true })) {
      await safeLog('mpesa_c2b_validation_unauthorized', {});
      sendJson(res, 200, { ResultCode: 1, ResultDesc: 'Unauthorized callback.' });
      return;
    }

    const body = await readJson(req);
    const billRefNumber = String(body.BillRefNumber || body.AccountReference || body.accountReference || '').trim();
    const payerPhone = String(body.MSISDN || body.phone || '').trim();
    const amount = Number(body.TransAmount || body.amount || 0);
    const transactionId = String(body.TransID || body.TransId || body.transactionId || '').trim();

    await safeLog('mpesa_c2b_validation_received', {
      billRefNumber,
      phone: payerPhone,
      amount,
      transactionId,
      rawBody: body
    });

    if (!billRefNumber) {
      await safeLog('mpesa_c2b_validation_missing_reference', {
        billRefNumber,
        phone: payerPhone
      });
      sendJson(res, 200, { ResultCode: 1, ResultDesc: 'Missing BillRefNumber.' });
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      await safeLog('mpesa_c2b_validation_invalid_amount', {
        billRefNumber,
        phone: payerPhone,
        amount
      });
      sendJson(res, 200, { ResultCode: 1, ResultDesc: 'Invalid amount.' });
      return;
    }

    const customer = await findCustomerForC2BPaybillReference(billRefNumber);

    if (!customer) {
      await safeLog('mpesa_c2b_validation_customer_not_found', {
        billRefNumber,
        phone: payerPhone
      });
      sendJson(res, 200, { ResultCode: 1, ResultDesc: 'Customer not found.' });
      return;
    }

    await safeLog('mpesa_c2b_validation_customer_matched', {
      billRefNumber,
      phone: payerPhone,
      customerId: customer.id,
      customerName: customer.customer_name || ''
    });

    sendJson(res, 200, { ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    await safeLog('mpesa_c2b_validation_failed', {
      error: error.message
    }).catch(() => null);
    sendJson(res, 200, { ResultCode: 1, ResultDesc: 'Validation failed.' });
  }
}
