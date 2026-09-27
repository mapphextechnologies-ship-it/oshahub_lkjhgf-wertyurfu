import { readJson, sendJson } from '../../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../../_lib/security.js';
import { getSupabase, requirePortalUser } from '../../_lib/supabase.js';

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function requiredMoney(body, camelKey, snakeKey, label) {
  const raw = hasOwn(body, camelKey) ? body[camelKey] : body[snakeKey];
  const value = Number(String(raw ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(value) || value < 0) {
    const error = new Error(`${label} must be zero or a positive number.`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function normalizedStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'success') return 'paid';
  if (['pending', 'failed'].includes(status)) return 'unpaid';
  if (!['paid', 'completed', 'unpaid'].includes(status)) {
    const error = new Error('Choose a valid payment status.');
    error.statusCode = 400;
    throw error;
  }
  return status;
}

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'finance-payment-financials', limit: 40, windowMs: 60_000 });
    const user = await requirePortalUser(req, ['admin', 'finance']);
    const body = await readJson(req);
    const paymentId = String(req.query?.id || req.url.split('/').slice(-2)[0] || '').trim();
    const depositCredit = requiredMoney(body, 'depositCredit', 'deposit_credit', 'Deposit / credit');
    const paygoPayment = requiredMoney(body, 'paygoPayment', 'paygo_payment', 'PAYGO payment');
    const totalPayable = requiredMoney(body, 'totalPayable', 'total_payable', 'Total payable');
    const balance = requiredMoney(body, 'balance', 'balance', 'Current balance');
    const dailyInstallment = requiredMoney(body, 'dailyInstallment', 'daily_installment', 'Daily payment');
    const status = normalizedStatus(body.status);
    const reason = String(body.correctionReason || body.correction_reason || 'Finance portal payment correction').trim();

    if (!paymentId) {
      sendJson(res, 400, { message: 'Payment ID is required.' });
      return;
    }
    if (totalPayable <= 0 || dailyInstallment <= 0) {
      sendJson(res, 400, { message: 'Total payable and daily payment must be greater than zero.' });
      return;
    }
    if (balance > totalPayable) {
      sendJson(res, 400, { message: 'Balance cannot be greater than total payable.' });
      return;
    }
    const result = await getSupabase().rpc('correct_payment_financials_v2', {
      p_payment_id: paymentId,
      p_deposit_credit: depositCredit,
      p_paygo_payment: paygoPayment,
      p_total_payable: totalPayable,
      p_balance: balance,
      p_daily_installment: dailyInstallment,
      p_status: status,
      p_paid_at: null,
      p_reason: reason,
      p_actor_user_id: user.id,
      p_actor_email: user.email || ''
    });

    if (result.error) {
      const error = new Error(
        String(result.error.message || '').includes('correct_payment_financials_v2')
          ? 'The latest payment correction migration is not installed. Run supabase_payment_corrections.sql again.'
          : result.error.message
      );
      error.statusCode = result.error.code === 'PGRST202' ? 503 : 409;
      throw error;
    }

    sendJson(res, 200, result.data || {});
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message || 'Payment correction could not be recorded.' });
  }
}
