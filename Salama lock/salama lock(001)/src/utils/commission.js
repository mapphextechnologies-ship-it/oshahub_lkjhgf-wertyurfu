function getCustomerPaymentPercentage(record) {
  const expectedAmount = Number(
    record.monthlyExpectedPaygo ??
    record.monthly_expected_paygo ??
    record.expectedPaygo ??
    record.expected_paygo ??
    record.dailyTarget ??
    record.daily_target ??
    0
  );
  const paidAmount = Number(
    record.monthlyPaygoCollected ??
    record.monthly_paygo_collected ??
    record.paygoPayment ??
    record.paygo_payment ??
    0
  );

  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    return 0;
  }

  return Math.min((Number.isFinite(paidAmount) ? paidAmount : 0) / expectedAmount * 100, 100);
}

function isSaleActivated(record) {
  if (record.saleActivated !== undefined) return Boolean(record.saleActivated);
  if (record.sale_activated !== undefined) return Boolean(record.sale_activated);
  if (record.activated !== undefined) return Boolean(record.activated);

  return record.registrationStatus !== 'not_activated';
}

function getCommissionRate(paymentPercentage, saleActivated = true) {
  if (!saleActivated || paymentPercentage < 65) return 0;
  if (paymentPercentage <= 85) return 0.02;
  return 0.03;
}

function calculateAgentCommission(record) {
  const monthlyPaygoCollected = Number(
    record.monthlyPaygoCollected ??
    record.monthly_paygo_collected ??
    record.paygoPayment ??
    record.paygo_payment ??
    0
  );
  const paymentPercentage = getCustomerPaymentPercentage(record);
  const saleActivated = isSaleActivated(record);
  const commissionRate = getCommissionRate(paymentPercentage, saleActivated);
  const commissionAmount = Number.isFinite(monthlyPaygoCollected) ? monthlyPaygoCollected * commissionRate : 0;
  const notificationMessage = getCommissionNotification(paymentPercentage, saleActivated);

  return {
    paymentPercentage,
    commissionRate,
    commissionAmount,
    notificationMessage,
    note: 'earned monthly from Paygo collections',
    saleActivated
  };
}

export function inferCommissionProductType(record = {}) {
  const explicitType = String(
    record.productType ??
    record.product_type ??
    record.assetType ??
    record.asset_type ??
    record.category ??
    ''
  ).trim().toLowerCase();

  if (['phone', 'phones', 'mobile', 'mobile phone'].includes(explicitType)) return 'phone';
  if (['bike', 'bikes', 'motorbike', 'motorcycle'].includes(explicitType)) return 'bike';

  const description = [
    explicitType,
    record.productModel,
    record.product_model,
    record.bikeModel,
    record.bike_model,
    record.itemName,
    record.item_name
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean).join(' ');

  if (/\b(phone|mobile|smartphone|tecno|samsung|infinix|itel|oppo|vivo|redmi|xiaomi|nokia|iphone|honor|motorola)\b/.test(description)) {
    return 'phone';
  }
  if (/\b(bike|motorbike|motorcycle|boxer|tvs|bajaj|honda|yamaha|hero)\b/.test(description)) {
    return 'bike';
  }

  const serial = String(record.serialNumber ?? record.serial_number ?? '').replace(/\D/g, '');
  if (serial.length === 15) return 'phone';
  return 'product';
}

export function matchesCommissionProductScope(record = {}, scope = '') {
  const normalizedScope = String(scope || '').trim().toLowerCase();
  if (!normalizedScope || normalizedScope === 'all') return true;
  if (!['phone', 'bike'].includes(normalizedScope)) return false;
  return inferCommissionProductType(record) === normalizedScope;
}

export function summarizeUnpaidCommissions(commissions = []) {
  return (Array.isArray(commissions) ? commissions : []).reduce((summary, commission) => {
    if (String(commission.status || '').trim().toLowerCase() === 'paid') return summary;

    const amount = Number(commission.amount || 0);
    if (!Number.isFinite(amount)) return summary;

    summary.unpaidCommissions += amount;
    const productType = inferCommissionProductType(commission);
    if (productType === 'bike') summary.bikeUnpaidCommissions += amount;
    if (productType === 'phone') summary.phoneUnpaidCommissions += amount;
    return summary;
  }, {
    unpaidCommissions: 0,
    bikeUnpaidCommissions: 0,
    phoneUnpaidCommissions: 0
  });
}

function getProductModel(record) {
  return (
    record.productModel ??
    record.product_model ??
    record.bikeModel ??
    record.bike_model ??
    record.itemName ??
    record.item_name ??
    'Product'
  );
}

function getProductSerial(record) {
  return (
    record.serialNumber ??
    record.serial_number ??
    record.chassisNumber ??
    record.chassis_number ??
    ''
  );
}

function buildSaleActivationCommissions(payments) {
  return payments
    .filter((payment) => Number(payment.depositCredit ?? payment.deposit_credit ?? 0) > 0)
    .map((payment) => {
      const deposit = Number(payment.depositCredit ?? payment.deposit_credit ?? 0);
      const productType = inferCommissionProductType(payment);
      const productModel = getProductModel(payment);
      const serialNumber = getProductSerial(payment);
      const chassisNumber = payment.chassisNumber ?? payment.chassis_number ?? '';
      const receipt = payment.receipt || payment.receipt_number || payment.id || Date.now();
      const commissionRate = productType === 'phone' ? 0.03 : 0.04;

      return {
        id: `COM-SALE-${receipt}`,
        agentName: payment.agentName ?? payment.agent_name,
        agentCode: payment.agentId ?? payment.agent_id ?? payment.agentCode ?? payment.agent_code,
        agentPhone: payment.agentPhone ?? payment.agent_phone ?? payment.phone ?? 'No phone yet',
        customerName: payment.customerName ?? payment.customer_name,
        productType,
        productModel,
        serialNumber,
        chassisNumber,
        earnedMonth: String(payment.date || payment.createdAt || payment.created_at || new Date().toISOString()).slice(0, 7),
        earnedAt: payment.date ?? payment.createdAt ?? payment.created_at,
        type: 'sale_activation_commission',
        amount: Math.round(deposit * commissionRate),
        status: isSaleActivated(payment) ? 'earned' : 'follow_up',
        paymentPercentage: 100,
        commissionRate,
        notificationMessage: isSaleActivated(payment) ? '' : 'Sale is not activated yet. Commission is held until activation.',
        payoutNote: `earned after ${productType} sale and activation`,
        customerPaymentStatus: 'paid'
      };
    });
}

function getRecordDailyTarget(record) {
  const value = Number(
    record.dailyTarget ??
    record.daily_target ??
    record.dailyPaygoAmount ??
    record.daily_paygo_amount ??
    record.expectedDailyPayment ??
    record.expected_daily_payment ??
    record.paygoPayment ??
    record.paygo_payment ??
    0
  );

  return Number.isFinite(value) && value > 0 ? value : 3000;
}

function getCommissionMonthDays(month, now = new Date()) {
  const [year, monthIndex] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthIndex, 0).getDate();
  const currentMonth = now.toISOString().slice(0, 7);

  if (month === currentMonth) {
    return Math.min(now.getDate(), daysInMonth);
  }

  return daysInMonth;
}

function commissionGroupKey(payment) {
  const earnedMonth = String(payment.date || payment.createdAt || payment.created_at || new Date().toISOString()).slice(0, 7);
  return [
    payment.agentId || payment.agent_id || payment.agentCode || payment.agent_code || payment.agentName || payment.agent_name || 'no-agent',
    payment.customerPhone || payment.customer_phone || payment.customerName || payment.customer_name || 'no-customer',
    earnedMonth
  ].join('|');
}

export function buildMonthlyPaygoCommissions(payments, now = new Date()) {
  const groups = payments.reduce((items, payment) => {
    const earnedMonth = String(payment.date || payment.createdAt || payment.created_at || now.toISOString()).slice(0, 7);
    const key = commissionGroupKey(payment);
    const current = items.get(key) ?? {
      id: `COM-${key.replaceAll('|', '-')}`,
      agentName: payment.agentName ?? payment.agent_name,
      agentCode: payment.agentId ?? payment.agent_id ?? payment.agentCode ?? payment.agent_code,
      agentPhone: payment.agentPhone ?? payment.agent_phone ?? payment.phone ?? 'No phone yet',
      customerName: payment.customerName ?? payment.customer_name,
      productType: inferCommissionProductType(payment),
      productModel: getProductModel(payment),
      serialNumber: getProductSerial(payment),
      chassisNumber: payment.chassisNumber ?? payment.chassis_number ?? '',
      earnedMonth,
      earnedAt: payment.date ?? payment.createdAt ?? payment.created_at,
      monthlyPaygoCollected: 0,
      dailyTarget: getRecordDailyTarget(payment),
      saleActivated: true
    };

    current.monthlyPaygoCollected += Number(payment.paygoPayment ?? payment.paygo_payment ?? 0);
    current.dailyTarget = Math.max(current.dailyTarget, getRecordDailyTarget(payment));
    current.saleActivated = current.saleActivated && isSaleActivated(payment);
    if (String(payment.date || payment.createdAt || payment.created_at || '').localeCompare(String(current.earnedAt || '')) > 0) {
      current.earnedAt = payment.date ?? payment.createdAt ?? payment.created_at;
    }
    items.set(key, current);
    return items;
  }, new Map());

  const monthlyCommissions = [...groups.values()].map((group) => {
    const monthlyExpectedPaygo = group.dailyTarget * getCommissionMonthDays(group.earnedMonth, now);
    const commission = calculateAgentCommission({
      ...group,
      monthlyExpectedPaygo
    });

    return {
      ...group,
      type: 'monthly_paygo_commission',
      amount: Math.round(commission.commissionAmount),
      status: commission.commissionAmount > 0 && commission.saleActivated ? 'earned' : 'follow_up',
      paymentPercentage: commission.paymentPercentage,
      commissionRate: commission.commissionRate,
      notificationMessage: commission.notificationMessage,
      payoutNote: commission.note,
      monthlyExpectedPaygo,
      customerPaymentStatus: commission.paymentPercentage >= 65 ? 'paid' : 'unpaid'
    };
  });

  return [...buildSaleActivationCommissions(payments), ...monthlyCommissions];
}

function getCommissionNotification(paymentPercentage, saleActivated) {
  if (!saleActivated) {
    return 'Sale is not activated yet. Commission is 0 until activation.';
  }

  if (paymentPercentage < 65) {
    return 'Monthly Paygo payment is below 65%. Follow up customer before commission is earned.';
  }

  return '';
}

export function formatPercent(value) {
  return `${Number(value || 0).toFixed(1).replace(/\.0$/, '')}%`;
}
