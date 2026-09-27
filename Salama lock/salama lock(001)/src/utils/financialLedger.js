const SUCCESS_STATUSES = new Set(['paid', 'completed', 'success']);
const AUTO_MANUAL_RECEIPT_PREFIXES = ['SALAMA LOCK-CM-', 'MAN-'];
const DEFAULT_MANUAL_DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

function text(value) {
  return String(value ?? '').trim();
}

function normalizedText(value) {
  return text(value).toLowerCase();
}

function finiteMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizedReference(value) {
  return normalizedText(value).replace(/[\s-]+/g, '');
}

function paymentTimestamp(payment = {}) {
  return payment.providerPaidAt ||
    payment.provider_paid_at ||
    payment.paidAt ||
    payment.paid_at ||
    payment.date ||
    payment.createdAt ||
    payment.created_at ||
    '';
}

function createdTimestamp(payment = {}) {
  const value = payment.createdAt || payment.created_at || paymentTimestamp(payment);
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function financialPaymentStatus(payment = {}) {
  return normalizedText(payment.status || payment.paymentStatus || payment.payment_status);
}

export function financialCustomerCollectedAmount(customer = {}) {
  const totalPayable = finiteMoney(customer.totalPayable ?? customer.total_payable);
  const balance = Number(customer.balance);
  const paidAmount = finiteMoney(customer.paidAmount ?? customer.paid_amount);
  if (totalPayable > 0 && Number.isFinite(balance) && balance >= 0) {
    return Math.max(totalPayable - balance, 0);
  }
  if (totalPayable > 0) return Math.min(paidAmount, totalPayable);

  return paidAmount;
}

export function sumFinancialCustomerCollections(customers = []) {
  return (Array.isArray(customers) ? customers : [])
    .filter((customer) => {
      const status = normalizedText(customer.status || customer.repaymentStatus || customer.repayment_status);
      const applicationStatus = normalizedText(customer.applicationStatus || customer.application_status);
      return status !== 'rejected' && applicationStatus !== 'rejected';
    })
    .reduce((total, customer) => total + financialCustomerCollectedAmount(customer), 0);
}

export function normalizeDashboardSummary(summary = {}) {
  const expectedAmount = summary.expectedAmount ?? summary.expected_amount ?? 0;
  const pendingCommissions = summary.pendingCommissions ?? summary.pending_commissions ?? 0;
  const totalCollected = summary.totalCollected ?? summary.total_collected ?? 0;
  const unpaidCommissions = summary.unpaidCommissions ?? summary.unpaid_commissions ?? summary.unpaidCommissionAmount ?? summary.unpaid_commission_amount ?? 0;
  const bikeUnpaidCommissions = summary.bikeUnpaidCommissions ?? summary.bike_unpaid_commissions ?? 0;
  const phoneUnpaidCommissions = summary.phoneUnpaidCommissions ?? summary.phone_unpaid_commissions ?? 0;

  return {
    totalCollected: Number(totalCollected || 0),
    expectedAmount,
    expectedCollection: summary.expectedCollection ?? summary.expected_collection ?? expectedAmount,
    pendingPayments: summary.pendingPayments ?? summary.pending_payments ?? summary.pendingPaymentAmount ?? summary.pending_payment_amount ?? 0,
    overdueAmount: summary.overdueAmount ?? summary.overdue_amount ?? 0,
    reconciliationFlags: summary.reconciliationFlags ?? summary.reconciliation_flags ?? summary.reconciliationFlagCount ?? summary.reconciliation_flag_count ?? 0,
    unpaidCommissions: Number(unpaidCommissions || 0),
    bikeUnpaidCommissions: Number(bikeUnpaidCommissions || 0),
    phoneUnpaidCommissions: Number(phoneUnpaidCommissions || 0),
    activeAccounts: summary.activeAccounts ?? summary.active_accounts ?? 0,
    todayCollections: summary.todayCollections ?? summary.today_collections ?? 0,
    unpaidPayments: summary.unpaidPayments ?? summary.unpaid_payments ?? 0,
    pendingCommissions
  };
}

export function isSuccessfulFinancialPayment(payment = {}) {
  return SUCCESS_STATUSES.has(financialPaymentStatus(payment));
}

export function financialPaymentAmount(payment = {}) {
  const depositCredit = finiteMoney(payment.depositCredit ?? payment.deposit_credit);
  const paygoPayment = finiteMoney(payment.paygoPayment ?? payment.paygo_payment);
  const splitAmount = depositCredit + paygoPayment;
  if (splitAmount > 0) return splitAmount;

  return finiteMoney(
    payment.paidAmount ??
    payment.paid_amount ??
    payment.amount ??
    payment.totalAmount ??
    payment.total_amount
  );
}

export function financialPaymentIdentity(payment = {}) {
  return financialPaymentIdentities(payment)[0] || '';
}

function financialPaymentIdentities(payment = {}) {
  const providerTransaction = normalizedReference(payment.providerTransactionId || payment.provider_transaction_id);
  const providerReference = normalizedReference(payment.providerReference || payment.provider_reference);
  const receipt = normalizedReference(payment.receipt || payment.receiptNumber || payment.receipt_number);
  const id = normalizedReference(payment.id || payment.paymentId || payment.payment_id);

  return [
    providerTransaction ? `provider-transaction:${providerTransaction}` : '',
    providerReference ? `provider-reference:${providerReference}` : '',
    receipt ? `receipt:${receipt}` : '',
    id ? `id:${id}` : ''
  ].filter(Boolean);
}

function isAutoGeneratedManualPayment(payment = {}) {
  const method = normalizedText(payment.method);
  const sourcePortal = normalizedText(payment.sourcePortal || payment.source_portal);
  const receipt = text(payment.receipt || payment.receiptNumber || payment.receipt_number).toUpperCase();
  const id = text(payment.id || payment.paymentId || payment.payment_id).toUpperCase();
  const hasAutoReference = AUTO_MANUAL_RECEIPT_PREFIXES.some((prefix) => receipt.startsWith(prefix) || id.startsWith(prefix));
  return hasAutoReference && (method === 'manual' || sourcePortal.includes('manual'));
}

function manualPaymentFingerprint(payment = {}) {
  if (!isAutoGeneratedManualPayment(payment)) return '';

  const customer = normalizedReference(
    payment.customerId ||
    payment.customer_id ||
    payment.customerPhone ||
    payment.customer_phone ||
    payment.customerName ||
    payment.customer_name
  );
  const product = normalizedReference(
    payment.serialNumber ||
    payment.serial_number ||
    payment.chassisNumber ||
    payment.chassis_number ||
    payment.productModel ||
    payment.product_model ||
    payment.bikeModel ||
    payment.bike_model
  );
  const timestamp = text(paymentTimestamp(payment));
  const deposit = finiteMoney(payment.depositCredit ?? payment.deposit_credit).toFixed(2);
  const paygo = finiteMoney(payment.paygoPayment ?? payment.paygo_payment).toFixed(2);
  const amount = financialPaymentAmount(payment).toFixed(2);
  const status = financialPaymentStatus(payment);

  if (!customer || !timestamp || financialPaymentAmount(payment) <= 0) return '';
  return [customer, product, deposit, paygo, amount, status].join('|');
}

export function dedupeFinancialPayments(payments = [], {
  manualDuplicateWindowMs = DEFAULT_MANUAL_DUPLICATE_WINDOW_MS
} = {}) {
  const records = Array.isArray(payments)
    ? payments.filter((payment) => payment && normalizedText(payment.ledgerState || payment.ledger_state || 'active') !== 'superseded')
    : [];
  const ordered = records
    .map((payment, index) => ({ payment, index, createdAt: createdTimestamp(payment) }))
    .sort((left, right) => {
      if (left.createdAt !== null && right.createdAt !== null && left.createdAt !== right.createdAt) {
        return left.createdAt - right.createdAt;
      }
      return left.index - right.index;
    });
  const kept = new Set();
  const identities = new Set();
  const recentManual = new Map();

  for (const item of ordered) {
    const paymentIdentities = financialPaymentIdentities(item.payment);
    if (paymentIdentities.some((identity) => identities.has(identity))) continue;

    const manualFingerprint = manualPaymentFingerprint(item.payment);
    const previousManual = manualFingerprint ? recentManual.get(manualFingerprint) : null;
    const withinDuplicateWindow = Boolean(
      previousManual &&
      item.createdAt !== null &&
      previousManual.createdAt !== null &&
      item.createdAt - previousManual.createdAt >= 0 &&
      item.createdAt - previousManual.createdAt <= manualDuplicateWindowMs
    );
    if (withinDuplicateWindow) continue;

    kept.add(item.payment);
    paymentIdentities.forEach((identity) => identities.add(identity));
    if (manualFingerprint) recentManual.set(manualFingerprint, item);
  }

  return records.filter((payment) => kept.has(payment));
}

export function successfulFinancialPayments(payments = []) {
  return dedupeFinancialPayments(payments).filter(isSuccessfulFinancialPayment);
}

export function sumFinancialPayments(payments = []) {
  return successfulFinancialPayments(payments)
    .reduce((total, payment) => total + financialPaymentAmount(payment), 0);
}

export function financialCustomerPaymentSummary(customer = {}, payments = []) {
  const totalPayable = finiteMoney(customer.totalPayable ?? customer.total_payable);
  const totalPaid = sumFinancialPayments(payments);
  const balance = totalPayable > 0
    ? Math.max(totalPayable - totalPaid, 0)
    : finiteMoney(customer.balance);

  return {
    totalPayable,
    totalPaid,
    balance,
    progress: totalPayable > 0 ? Math.min(100, Math.round((totalPaid / totalPayable) * 100)) : 0
  };
}

export function financialAccountKey(record = {}) {
  const customerId = normalizedReference(record.customerId || record.customer_id);
  if (customerId) return `customer:${customerId}`;

  return [
    record.customerPhone || record.customer_phone || record.phone,
    record.customerName || record.customer_name || record.name,
    record.serialNumber || record.serial_number || record.chassisNumber || record.chassis_number,
    record.productType || record.product_type
  ].map(normalizedReference).join('|');
}

export function uniqueFinancialAccounts(records = []) {
  const accounts = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const key = financialAccountKey(record);
    if (!key || accounts.has(key)) continue;
    accounts.set(key, record);
  }
  return [...accounts.values()];
}
