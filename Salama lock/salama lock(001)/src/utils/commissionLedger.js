const SUCCESSFUL_PAYMENT_STATUSES = new Set(['paid', 'completed', 'success', 'successful']);
const NON_COMMISSIONABLE_PAYMENT_STATUSES = new Set([
  'unpaid',
  'pending',
  'failed',
  'cancelled',
  'canceled',
  'rejected'
]);

function text(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function commissionPaymentBase(payment = {}) {
  const deposit = Number(payment.deposit_credit ?? payment.depositCredit ?? 0);
  if (Number.isFinite(deposit) && deposit > 0) return deposit;

  const paidAmount = Number(payment.paid_amount ?? payment.paidAmount ?? 0);
  if (Number.isFinite(paidAmount) && paidAmount > 0) return paidAmount;

  const paygoPayment = Number(payment.paygo_payment ?? payment.paygoPayment ?? 0);
  return Number.isFinite(paygoPayment) && paygoPayment > 0 ? paygoPayment : 0;
}

export function isCommissionablePayment(payment = {}) {
  if (!(commissionPaymentBase(payment) > 0)) return false;

  const status = text(payment.status || payment.payment_status || payment.paymentStatus);
  if (SUCCESSFUL_PAYMENT_STATUSES.has(status)) return true;
  if (NON_COMMISSIONABLE_PAYMENT_STATUSES.has(status)) return false;

  // Some imported legacy payments predate the status columns. Only accept those
  // when they still carry a provider or receipt reference proving the payment.
  const hasPaymentReference = Boolean(
    payment.receipt ||
    payment.receipt_number ||
    payment.provider_reference ||
    payment.provider_transaction_id
  );
  const reconciliationStatus = text(payment.reconciliation_status || payment.reconciliationStatus);
  return !status && hasPaymentReference && (!reconciliationStatus || reconciliationStatus === 'matched');
}

export function inferCommissionProductType(record = {}) {
  const explicitType = text(record.product_type || record.productType || record.asset_type || record.assetType);
  if (['phone', 'phones', 'mobile', 'mobile phone'].includes(explicitType)) return 'phone';
  if (['bike', 'bikes', 'motorbike', 'motorcycle'].includes(explicitType)) return 'bike';

  const description = [
    explicitType,
    record.product_model,
    record.productModel,
    record.bike_model,
    record.bikeModel,
    record.item_name,
    record.itemName
  ].map(text).filter(Boolean).join(' ');

  if (/\b(phone|mobile|smartphone|tecno|samsung|infinix|itel|oppo|vivo|redmi|xiaomi|nokia|iphone|honor|motorola)\b/.test(description)) {
    return 'phone';
  }
  if (/\b(bike|motorbike|motorcycle|boxer|tvs|bajaj|honda|yamaha|hero)\b/.test(description)) {
    return 'bike';
  }

  const serial = String(record.serial_number || record.serialNumber || '').replace(/\D/g, '');
  if (serial.length === 15) return 'phone';
  return explicitType || 'product';
}
