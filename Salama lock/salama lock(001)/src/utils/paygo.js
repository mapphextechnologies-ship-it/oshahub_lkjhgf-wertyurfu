const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SUCCESS_PAYMENT_STATUSES = new Set(['paid', 'completed', 'success']);

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(value) {
  const date = toDate(value);
  return date ? date.toISOString() : '';
}

function addHours(date, hours) {
  const source = toDate(date);
  if (!source || !Number.isFinite(Number(hours))) return null;
  return new Date(source.getTime() + Number(hours) * HOUR_MS);
}

function pickLatestDate(...values) {
  const dates = values
    .map((value) => toDate(value))
    .filter(Boolean)
    .sort((left, right) => left.getTime() - right.getTime());

  return dates[dates.length - 1] || null;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizePaybillReference(value) {
  return normalizeText(value).replace(/[\s-]+/g, '');
}

function paymentStatus(payment = {}) {
  return normalizeText(
    payment.status ||
    payment.payment_status ||
    payment.paymentStatus
  ).toLowerCase();
}

function paymentTimestamp(payment = {}) {
  return payment.date
    || payment.paidAt
    || payment.paid_at
    || payment.providerPaidAt
    || payment.provider_paid_at
    || payment.createdAt
    || payment.created_at
    || payment.updated_at
    || null;
}

function paymentLedgerKey(payment = {}) {
  return normalizePaybillReference(
    payment.receipt
    || payment.providerTransactionId
    || payment.provider_transaction_id
    || payment.providerReference
    || payment.provider_reference
    || payment.id
    || `${paymentTimestamp(payment)}:${getPaymentAmount(payment)}`
  );
}

function normalizeLedgerPayments(payments = []) {
  const deduped = new Map();

  for (const payment of Array.isArray(payments) ? payments : []) {
    if (
      !payment ||
      normalizeText(payment.ledgerState || payment.ledger_state || 'active').toLowerCase() === 'superseded' ||
      !SUCCESS_PAYMENT_STATUSES.has(paymentStatus(payment))
    ) continue;
    const key = paymentLedgerKey(payment);
    if (!key) continue;
    if (!deduped.has(key)) deduped.set(key, payment);
  }

  return [...deduped.values()].sort((left, right) => {
    const leftTime = toDate(paymentTimestamp(left))?.getTime() || 0;
    const rightTime = toDate(paymentTimestamp(right))?.getTime() || 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return paymentLedgerKey(left).localeCompare(paymentLedgerKey(right));
  });
}

function getPaymentDailyInstallment(record = {}) {
  const value = Number(
    record.dailyTarget ??
    record.daily_target ??
    record.dailyInstallment ??
    record.daily_installment ??
    record.expectedDailyPayment ??
    record.expected_daily_payment ??
    record.customerDailyInstallment ??
    record.customer_daily_installment ??
    record.customer?.dailyTarget ??
    record.customer?.daily_target ??
    record.customer?.dailyInstallment ??
    record.customer?.daily_installment
  );

  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getCustomerTotalPayable(record = {}) {
  return Number(record.totalPayable ?? record.total_payable ?? 0);
}

function getCustomerPaidAmount(record = {}) {
  return Number(record.paidAmount ?? record.paid_amount ?? 0);
}

function getCustomerBalance(record = {}) {
  const balance = Number(record.balance);
  if (Number.isFinite(balance) && balance >= 0) return balance;
  const totalPayable = getCustomerTotalPayable(record);
  if (totalPayable > 0) {
    return Math.max(totalPayable - getCustomerPaidAmount(record), 0);
  }
  return 0;
}

function calculateUnlockExtension({ paymentAt, currentUnlockUntil, amount, dailyInstallment } = {}) {
  const paidDays = dailyInstallment > 0 ? amount / dailyInstallment : 0;
  const unlockDurationHours = paidDays * 24;
  const baseTime = currentUnlockUntil && paymentAt.getTime() < currentUnlockUntil.getTime()
    ? currentUnlockUntil
    : paymentAt;
  const newUnlockUntil = addHours(baseTime, unlockDurationHours);

  return {
    paidDays,
    unlockDurationHours,
    baseTime,
    newUnlockUntil
  };
}

function calculateActivationExtension({ paymentAt } = {}) {
  const baseTime = toDate(paymentAt);
  if (!baseTime) {
    return {
      paidDays: 0,
      unlockDurationHours: 0,
      baseTime: null,
      newUnlockUntil: null
    };
  }

  return {
    paidDays: 1,
    unlockDurationHours: 24,
    baseTime,
    newUnlockUntil: addHours(baseTime, 24)
  };
}

function resolveStoredUnlockUntil(customer = {}) {
  return toDate(
    customer.unlock_until ||
    customer.unlockUntilAt ||
    customer.paygo_usage_ends_at ||
    customer.paygoUsageEndsAt ||
    ''
  );
}

function getPaymentTotalAmount(payment = {}) {
  const splitAmount = getPaymentAmount(payment);
  if (splitAmount > 0) return splitAmount;
  return Number(payment.paid_amount || payment.amount || 0);
}

function getPaymentPaygoAmount(payment = {}, fallbackAmount = 0, hasPriorPayment = false) {
  const explicitPaygoAmount = Number(payment.paygoPayment || payment.paygo_payment || 0);
  if (explicitPaygoAmount > 0) {
    return explicitPaygoAmount;
  }

  // Legacy rows without split columns follow current business logic.
  return hasPriorPayment ? Number(fallbackAmount || 0) : 0;
}

function paymentArrearsCredit(payment = {}) {
  const explicitPaygoAmount = Number(payment.paygoPayment || payment.paygo_payment || 0);
  if (explicitPaygoAmount > 0) return explicitPaygoAmount;

  const explicitDepositAmount = Number(payment.depositCredit || payment.deposit_credit || 0);
  if (explicitDepositAmount > 0) return 0;

  return Math.max(getPaymentTotalAmount(payment), 0);
}

function utcDay(value) {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : '';
}

function calendarDaysBetween(dateValue, now = new Date()) {
  const dueDay = String(dateValue || '').slice(0, 10);
  const nowDay = utcDay(now);
  if (!dueDay || !nowDay) return 0;

  const dueDate = new Date(`${dueDay}T12:00:00.000Z`);
  const currentDate = new Date(`${nowDay}T12:00:00.000Z`);
  if (Number.isNaN(dueDate.getTime()) || Number.isNaN(currentDate.getTime())) return 0;
  return Math.max(Math.floor((currentDate.getTime() - dueDate.getTime()) / DAY_MS), 0);
}

export function computeCustomerArrears({ customer = {}, payments = [], now = new Date() } = {}) {
  const dailyInstallment = getPaymentDailyInstallment(customer);
  const balance = getCustomerBalance(customer);
  const storedOverdueDays = Math.max(Number(customer.overdueDays ?? customer.overdue_days ?? 0), 0);
  const dueAt = customer.arrearsDueAt
    || customer.arrears_due_at
    || customer.dueDate
    || customer.due_date
    || customer.paygoNextDueAt
    || customer.paygo_next_due_at
    || '';
  const dueDay = String(dueAt || '').slice(0, 10);
  const currentDay = utcDay(now);
  const calendarOverdueDays = calendarDaysBetween(dueAt, now);
  const hasDueTodayOrPast = Boolean(dueDay && currentDay && dueDay <= currentDay);

  if (!(dailyInstallment > 0) || !(balance > 0)) {
    return {
      dueAt,
      dueDay,
      dailyInstallment,
      scheduledDays: 0,
      scheduledAmount: 0,
      paymentCredits: 0,
      overdueAmount: 0,
      overdueDays: 0,
      hasArrears: false
    };
  }

  const hasUsableDueDate = Boolean(dueDay && currentDay && dueDay <= currentDay);
  const scheduledDays = hasUsableDueDate
    ? Math.max(1, calendarOverdueDays)
    : Math.max(storedOverdueDays, hasDueTodayOrPast ? 1 : 0);
  const scheduledAmount = Math.max(scheduledDays * dailyInstallment, 0);
  const paymentCredits = hasUsableDueDate
    ? normalizeLedgerPayments(payments).reduce((total, payment) => {
        const paidDay = utcDay(paymentTimestamp(payment));
        if (!paidDay || paidDay < dueDay || paidDay > currentDay) return total;
        return total + paymentArrearsCredit(payment);
      }, 0)
    : 0;
  const overdueAmount = Math.min(Math.max(scheduledAmount - paymentCredits, 0), balance);
  const overdueDays = overdueAmount > 0
    ? (dueDay && currentDay && dueDay === currentDay
      ? 1
      : Math.floor(overdueAmount / dailyInstallment))
    : 0;

  return {
    dueAt,
    dueDay,
    dailyInstallment,
    scheduledDays,
    scheduledAmount,
    paymentCredits,
    overdueAmount,
    overdueDays,
    hasArrears: overdueAmount > 0
  };
}

export function computePaygoSchedule({ customer = {}, payments = [], now = new Date() } = {}) {
  const dailyInstallment = getPaymentDailyInstallment(customer);
  const totalPayable = getCustomerTotalPayable(customer);
  const nowDate = toDate(now) || new Date();
  const nowIso = nowDate.toISOString();
  const storedUnlockUntilAt = resolveStoredUnlockUntil(customer);

  const normalisedPayments = normalizeLedgerPayments(payments);
  const paymentEvents = normalisedPayments;

  let totalPaid = 0;
  let paygoPaid = 0;
  let paidDays = 0;
  let installmentsPaid = 0;
  let unlockUntilAt = null;
  let firstPaymentAt = null;
  let firstPaygoPaymentAt = null;
  let lastPaymentAt = null;
  const paymentTimeline = [];

  if (paymentEvents.length > 0) {
    paymentEvents.forEach((payment) => {
      const totalAmount = getPaymentTotalAmount(payment);
      const isBalanceAdjustment = normalizeText(payment.sourcePortal || payment.source_portal).toLowerCase() === 'finance_balance_adjustment';
      if (isBalanceAdjustment) {
        totalPaid += totalAmount;
        return;
      }
      if (!(totalAmount > 0)) return;

      const paymentAt = toDate(paymentTimestamp(payment)) || nowDate;
      const hasPriorPayment = totalPaid > 0;
      const isFirstSuccessfulPayment = !firstPaymentAt;
      // The initial deposit activates the device for 24 hours before daily PAYGO installments take over.
      const activationExtension = isFirstSuccessfulPayment ? calculateActivationExtension({ paymentAt }) : null;
      const paygoAmount = getPaymentPaygoAmount(payment, totalAmount, hasPriorPayment);
      totalPaid += totalAmount;
      if (!firstPaymentAt) firstPaymentAt = paymentAt;
      lastPaymentAt = paymentAt;

      const previousUnlockUntil = unlockUntilAt;
      let nextUnlockUntil = unlockUntilAt;
      let timelinePaidDays = 0;
      let timelineUnlockDurationHours = 0;

      if (activationExtension) {
        paidDays += activationExtension.paidDays;
        nextUnlockUntil = activationExtension.newUnlockUntil || nextUnlockUntil;
        timelinePaidDays += activationExtension.paidDays;
        timelineUnlockDurationHours += activationExtension.unlockDurationHours;
      }

      if (!(paygoAmount > 0)) {
        paymentTimeline.push({
          paymentId: payment.id || payment.receipt || payment.providerReference || payment.provider_reference || '',
          receipt: payment.receipt || '',
          paidAt: paymentAt.toISOString(),
          amount: totalAmount,
          paygoAmount: 0,
          dailyInstallment,
          paidDays: timelinePaidDays,
          unlockDurationHours: timelineUnlockDurationHours,
          previousUnlockUntil: previousUnlockUntil ? previousUnlockUntil.toISOString() : '',
          newUnlockUntil: nextUnlockUntil ? nextUnlockUntil.toISOString() : ''
        });
        unlockUntilAt = nextUnlockUntil || unlockUntilAt;
        return;
      }

      const extension = calculateUnlockExtension({
        paymentAt,
        currentUnlockUntil: nextUnlockUntil,
        amount: paygoAmount,
        dailyInstallment
      });

      paygoPaid += paygoAmount;
      paidDays += extension.paidDays;
      if (!firstPaygoPaymentAt) firstPaygoPaymentAt = paymentAt;

      nextUnlockUntil = extension.newUnlockUntil || nextUnlockUntil;
      unlockUntilAt = nextUnlockUntil || unlockUntilAt;
      installmentsPaid = dailyInstallment > 0 ? Math.floor(paygoPaid / dailyInstallment) : installmentsPaid;
      timelinePaidDays += extension.paidDays;
      timelineUnlockDurationHours += extension.unlockDurationHours;
      paymentTimeline.push({
        paymentId: payment.id || payment.receipt || payment.providerReference || payment.provider_reference || '',
        receipt: payment.receipt || '',
        paidAt: paymentAt.toISOString(),
        amount: totalAmount,
        paygoAmount,
        dailyInstallment,
        paidDays: timelinePaidDays,
        unlockDurationHours: timelineUnlockDurationHours,
        previousUnlockUntil: previousUnlockUntil ? previousUnlockUntil.toISOString() : '',
        newUnlockUntil: nextUnlockUntil ? nextUnlockUntil.toISOString() : ''
      });
    });
  }

  const firstDailyDueAt = firstPaymentAt && dailyInstallment > 0 ? addHours(firstPaymentAt, 24) : null;
  const effectiveUnlockUntilAt = pickLatestDate(unlockUntilAt, storedUnlockUntilAt);

  const remainingBalance = totalPayable > 0
    ? Math.max(totalPayable - totalPaid, 0)
    : getCustomerBalance(customer);
  const totalInstallments = Number(customer.paygoTotalInstallments ?? customer.paygo_total_installments ?? 0) > 0
    ? Number(customer.paygoTotalInstallments ?? customer.paygo_total_installments ?? 0)
    : totalPayable > 0 && dailyInstallment > 0
      ? Math.max(1, Math.ceil(totalPayable / dailyInstallment))
      : installmentsPaid;
  const remainingInstallments = totalInstallments > 0
    ? Math.max(totalInstallments - installmentsPaid, 0)
    : 0;
  const isComplete = remainingBalance <= 0 && totalPaid > 0;
  const dueAt = isComplete
    ? pickLatestDate(effectiveUnlockUntilAt, nowDate)
    : effectiveUnlockUntilAt || firstDailyDueAt;
  const nextDueAt = dueAt ? dueAt.toISOString() : '';
  const graceUntilAt = '';

  const isActive = Boolean(dueAt && nowDate.getTime() < dueAt.getTime() && (totalPaid > 0 || storedUnlockUntilAt));
  const diffMs = dueAt ? nowDate.getTime() - dueAt.getTime() : 0;
  const daysOverdue = !isComplete && totalPaid > 0 && dueAt && diffMs >= 0
    ? Math.max(Math.ceil(diffMs / DAY_MS), 1)
    : 0;
  const gracePeriodRemainingHours = 0;

  let scheduleStatus = 'inactive';
  if (totalPaid <= 0) {
    scheduleStatus = 'inactive';
  } else if (isComplete) {
    scheduleStatus = 'paid';
  } else if (isActive) {
    scheduleStatus = 'active';
  } else {
    scheduleStatus = 'locked';
  }

  const deviceState = isComplete || isActive ? 'unlocked' : 'locked';
  const recommendedDeviceAction = deviceState === 'locked' ? 'lock' : 'unlock';
  const nextInstallmentAmount = remainingBalance > 0
    ? Math.min(dailyInstallment > 0 ? dailyInstallment : remainingBalance, remainingBalance)
    : 0;

  return {
    totalPaid,
    totalPayable,
    dailyInstallment,
    storedUnlockUntilAt: storedUnlockUntilAt ? storedUnlockUntilAt.toISOString() : '',
    totalInstallments,
    installmentsPaid,
    paidDays,
    remainingBalance,
    remainingInstallments,
    nextDueAt,
    usageEndsAt: nextDueAt,
    unlockUntilAt: nextDueAt,
    graceUntilAt,
    gracePeriodRemainingHours,
    daysOverdue,
    scheduleStatus,
    deviceState,
    recommendedDeviceAction,
    nextInstallmentAmount,
    paymentTimeline,
    lastPaymentTimelineEntry: paymentTimeline[paymentTimeline.length - 1] || null,
    firstPaymentAt: firstPaymentAt ? firstPaymentAt.toISOString() : '',
    firstPaygoPaymentAt: firstPaygoPaymentAt ? firstPaygoPaymentAt.toISOString() : '',
    lastPaymentAt: lastPaymentAt ? lastPaymentAt.toISOString() : '',
    startedAt: firstPaymentAt ? firstPaymentAt.toISOString() : '',
    frequencyHours: 24,
    gracePeriodHours: 0,
    isComplete,
    isActive,
    isLocked: !(isComplete || isActive),
    computedAt: nowIso
  };
}

export function getPaymentAmount(payment) {
  const splitAmount = Number(payment.depositCredit || payment.deposit_credit || 0)
    + Number(payment.paygoPayment || payment.paygo_payment || 0);
  if (splitAmount > 0) return splitAmount;
  return Number(
    payment.paidAmount
    ?? payment.paid_amount
    ?? payment.amount
    ?? payment.totalAmount
    ?? payment.total_amount
    ?? 0
  );
}

export function getDailyTarget(payment) {
  return getPaymentDailyInstallment(payment);
}

export function getPaymentBalance(payment) {
  const balance = Number(payment.balance);

  if (Number.isFinite(balance) && balance >= 0) {
    return balance;
  }

  return Math.max(Number(payment.totalPayable || payment.total_payable || 0) - getPaymentAmount(payment), 0);
}

export function getOverdueDays(payment, now = new Date()) {
  const safeNow = toDate(now) || new Date();
  const schedule = computePaygoSchedule({ customer: payment, now: safeNow });
  if (schedule.daysOverdue > 0) return schedule.daysOverdue;

  const directOverdueDays = Number(
    payment.overdueDays ??
    payment.overdue_days ??
    payment.customerOverdueDays ??
    payment.customer_overdue_days ??
    payment.customer?.overdueDays ??
    payment.customer?.overdue_days ??
    0
  );
  if (Number.isFinite(directOverdueDays) && directOverdueDays > 0) return directOverdueDays;

  const dueDate =
    payment.paygoNextDueAt ||
    payment.paygo_next_due_at ||
    payment.dueDate ||
    payment.due_date ||
    payment.nextDueAt ||
    payment.next_due_at ||
    payment.unlockUntilAt ||
    payment.unlock_until ||
    payment.paygoUsageEndsAt ||
    payment.paygo_usage_ends_at ||
    payment.customer?.dueDate ||
    payment.customer?.due_date ||
    payment.customer?.paygoNextDueAt ||
    payment.customer?.paygo_next_due_at;
  const dueDateOnly = dueDate?.slice?.(0, 10);

  if (!dueDateOnly) return 0;

  return Math.max(
    Math.floor((new Date(`${safeNow.toISOString().slice(0, 10)}T12:00:00`) - new Date(`${dueDateOnly}T12:00:00`)) / DAY_MS),
    0
  );
}

export function getPaygoAccountState(payment, now = new Date()) {
  const schedule = computePaygoSchedule({ customer: payment, now });

  if (schedule.isComplete) {
    return 'complete';
  }

  if (schedule.isLocked) {
    return 'locked';
  }

  if (schedule.scheduleStatus === 'due') {
    return 'follow_up';
  }

  if (schedule.totalPaid > 0) {
    return 'active';
  }

  return 'locked';
}

export function getPaygoFollowUp(payment, now = new Date()) {
  const schedule = computePaygoSchedule({ customer: payment, now });

  if (schedule.isComplete) return 'Account complete';
  if (schedule.scheduleStatus === 'inactive') return 'Activate the device with the first deposit';
  if (schedule.scheduleStatus === 'active') return 'Keep daily Paygo collection active';
  if (schedule.scheduleStatus === 'due') return 'Collect the overdue installment before grace expires';
  if (schedule.scheduleStatus === 'locked') return 'Escalate account and recover overdue payment';
  return 'Follow up customer before account is locked';
}
