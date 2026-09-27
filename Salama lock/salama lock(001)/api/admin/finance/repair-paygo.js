import { readJson, sendJson } from '../../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../../_lib/security.js';
import { getSupabase, requirePortalUser } from '../../_lib/supabase.js';
import { reconcileCustomerPaygoAndLocker } from '../../_lib/database.js';

const SUCCESS_STATUSES = new Set(['paid', 'completed', 'success']);

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeProductType(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (['phone', 'phones'].includes(normalized)) return 'phone';
  if (['bike', 'bikes', 'product', 'products'].includes(normalized)) return 'bike';
  if (['all', ''].includes(normalized)) return '';
  return normalized;
}

function recordMatchesProductType(record = {}, productType = '') {
  if (!productType) return true;
  const recordType = normalizeProductType(record.product_type || record.productType);
  if (productType === 'bike') return recordType === 'bike' || recordType === '';
  return recordType === productType;
}

function successfulPayment(payment = {}) {
  return SUCCESS_STATUSES.has(normalizeText(payment.status || payment.payment_status || payment.paymentStatus).toLowerCase());
}

function splitTotal(payment = {}) {
  return numberValue(payment.deposit_credit || payment.depositCredit) +
    numberValue(payment.paygo_payment || payment.paygoPayment);
}

async function audit(user, action, targetTable, targetId, details = {}) {
  await getSupabase().from('admin_audit_logs').insert({
    actor_user_id: user.id,
    actor_email: user.email,
    action,
    target_table: targetTable,
    target_id: targetId,
    details
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'admin-finance-repair-paygo', limit: 6, windowMs: 60_000 });
    const user = await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const dryRun = body.dryRun === true || body.dry_run === true;
    const productType = normalizeProductType(body.productType || body.product_type || 'bike');
    const maxCustomers = boundedInteger(body.maxCustomers || body.max_customers, 6, 1, 25);
    const requestedCustomerIds = new Set(
      (Array.isArray(body.customerIds) ? body.customerIds : Array.isArray(body.customer_ids) ? body.customer_ids : [])
        .map((value) => normalizeText(value))
        .filter(Boolean)
    );

    const [paymentsResult, customersResult] = await Promise.all([
      getSupabase()
        .from('payments')
        .select('id,customer_id,receipt,status,payment_status,product_type,deposit_credit,paygo_payment,paid_amount,date,ledger_state,revision_of,revision_number')
        .order('date', { ascending: true })
        .limit(5000),
      getSupabase()
        .from('customers')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(5000)
    ]);

    if (paymentsResult.error) throw paymentsResult.error;
    if (customersResult.error) throw customersResult.error;

    const payments = (paymentsResult.data || [])
      .filter((payment) => String(payment.ledger_state || 'active').toLowerCase() !== 'superseded')
      .filter((payment) => recordMatchesProductType(payment, productType))
      .filter((payment) => requestedCustomerIds.size === 0 || requestedCustomerIds.has(normalizeText(payment.customer_id)));
    const customers = (customersResult.data || [])
      .filter((customer) => recordMatchesProductType(customer, productType))
      .filter((customer) => requestedCustomerIds.size === 0 || requestedCustomerIds.has(normalizeText(customer.id)));

    const paymentCustomerIds = new Set(payments.map((payment) => normalizeText(payment.customer_id)).filter(Boolean));
    const paymentRepairs = payments
      .filter(successfulPayment)
      .map((payment) => {
        const splitAmount = splitTotal(payment);
        const paidAmount = numberValue(payment.paid_amount || payment.paidAmount);
        return {
          payment,
          splitAmount,
          paidAmount,
          shouldRepair: splitAmount > 0 && splitAmount - paidAmount > 0.5
        };
      })
      .filter((item) => item.shouldRepair);

    const repairedPayments = [];
    for (const item of paymentRepairs) {
      if (dryRun) {
        repairedPayments.push({
          id: item.payment.id,
          receipt: item.payment.receipt,
          previousPaidAmount: item.paidAmount,
          repairedPaidAmount: item.splitAmount,
          dryRun: true
        });
        continue;
      }

      const updated = await getSupabase()
        .from('payments')
        .update({
          paid_amount: item.splitAmount,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.payment.id)
        .select('id,receipt,customer_id,paid_amount,deposit_credit,paygo_payment')
        .single();

      if (updated.error) throw updated.error;
      repairedPayments.push(updated.data);
    }

    const reconciledCustomers = [];
    const reconcileErrors = [];
    const reconcileCandidates = customers
      .filter((customer) => paymentCustomerIds.has(normalizeText(customer.id)));
    const reconcileTargets = requestedCustomerIds.size > 0
      ? reconcileCandidates
      : reconcileCandidates.slice(0, maxCustomers);
    if (!dryRun) {
      for (const customer of reconcileTargets) {
        try {
          const result = await reconcileCustomerPaygoAndLocker(customer, {
            now: new Date(),
            sourcePortal: 'admin_finance_repair_paygo',
            reason: 'Admin PAYGO accounting repair.'
          });
          reconciledCustomers.push({
            id: customer.id,
            customerName: customer.customer_name || '',
            paidAmount: result.patch?.paid_amount ?? null,
            balance: result.patch?.balance ?? null,
            overdueDays: result.patch?.overdue_days ?? null,
            scheduleStatus: result.patch?.paygo_schedule_status ?? null,
            nextDueAt: result.patch?.paygo_next_due_at ?? null
          });
        } catch (error) {
          reconcileErrors.push({
            id: customer.id,
            customerName: customer.customer_name || '',
            message: error.message
          });
        }
      }
    }
    const skippedReconcileCount = dryRun
      ? reconcileCandidates.length
      : Math.max(reconcileCandidates.length - reconcileTargets.length, 0);

    await audit(user, dryRun ? 'paygo_repair_dry_run' : 'paygo_repair_applied', 'customers', productType || 'all', {
      productType: productType || 'all',
      requestedCustomerIds: [...requestedCustomerIds],
      paymentRepairs: paymentRepairs.length,
      reconciledCustomers: reconciledCustomers.length,
      skippedReconcileCount,
      maxCustomers,
      reconcileErrors: reconcileErrors.length
    });

    sendJson(res, 200, {
      ok: reconcileErrors.length === 0,
      dryRun,
      productType: productType || 'all',
      paymentRepairCount: paymentRepairs.length,
      repairedPayments,
      reconciledCustomerCount: reconciledCustomers.length,
      reconciledCustomers,
      skippedReconcileCount,
      nextCustomerIds: skippedReconcileCount > 0
        ? reconcileCandidates.slice(reconcileTargets.length, reconcileTargets.length + maxCustomers).map((customer) => customer.id)
        : [],
      reconcileErrors
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
