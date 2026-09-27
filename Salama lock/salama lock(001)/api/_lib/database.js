import crypto from 'node:crypto';
import {
  hasAfricasTalkingSmsConfig,
  normalizePhone,
  publicAppBaseUrl,
  sendAgentFollowUpSms,
  sendCommissionPaidSms,
  sendNextOfKinAcceptanceSms,
  sendOtpSms,
  sendPaymentReminderSms,
  sendPaymentConfirmedSms,
  sendScreeningSms,
  sendSms,
  normalizeKenyanPhone,
  normalizeSmsProviderErrorMessage
} from './africastalking.js';
import { logError, logInfo, logWarn } from './logging.js';
import {
  buildPhoneLockerPayload,
  buildLockPolicy,
  buildUnlockPolicy,
  deliverLock,
  getPhoneLockerProvider,
  importDevice,
  lockDevice as lockPhoneLockerDevice,
  mapProviderState as mapPhoneLockerProviderState,
  queryDevice,
  queryTask,
  unlockDevice,
  unlockOrExtendDevice as unlockOrExtendPhoneLockerDevice,
  phoneLockerAppId,
  phoneLockerBaseUrl,
  phoneLockerDiagnostics,
  resolvePhoneLockerProvider,
  sendPhoneLockerNotification,
  validateProviderCommandResponse as validatePhoneLockerCommandResponse
} from './phone-locker.js';
import { buildPaygoCustomerState, resolveHonorSyncDecision, resolveLockerCommandDecision } from './paygo-flow.js';
import { claimReminderSend, resolveReminderIntervalDays, resolveRepaymentDueAt } from './reminders.js';
import { claimSchedulerLock, releaseSchedulerLock } from './scheduler-locks.js';
import { getSupabase } from './supabase.js';
import { initiateB2CPayout, initiateStkPush } from './daraja.js';
import { validateStrongPassword } from './security.js';
import {
  mapProviderState as mapLocalPhoneLockerProviderState,
  normalizePhoneLockerCommandStatus,
  normalizePhoneLockerLockStatus,
  normalizePhoneLockerSyncStatus
} from './phone-locker.state.js';
import {
  dedupeFinancialPayments,
  financialCustomerPaymentSummary,
  financialPaymentAmount,
  isSuccessfulFinancialPayment,
  sumFinancialCustomerCollections
} from '../../src/utils/financialLedger.js';
import { computeCustomerArrears } from '../../src/utils/paygo.js';
import {
  commissionPaymentBase,
  inferCommissionProductType,
  isCommissionablePayment
} from '../../src/utils/commissionLedger.js';

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function mapSupabaseError(error) {
  if (!error) return null;
  const mapped = new Error(error.message || 'Database request failed.');
  mapped.statusCode = 500;
  return mapped;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizePhoneForStorage(value) {
  return normalizePhone(value);
}

function maskPhone(value) {
  const phone = String(value || '').trim();
  if (!phone) return '';
  if (phone.length <= 6) return `${phone.slice(0, 2)}...`;
  return `${phone.slice(0, 4)}...${phone.slice(-4)}`;
}

function nonEmpty(value) {
  return String(value || '').trim();
}

function isForceUnlockEnabled() {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.FORCE_UNLOCK || '').trim().toLowerCase());
}

function isTrustonicLockerProviderValue(value) {
  return ['trustonic', 'trust', 'ttp', 'telecoms-platform', 'trustonic-v2'].includes(
    String(value || '').trim().toLowerCase()
  );
}

function embeddedPhoneProfile(product = {}) {
  const profile = product?.inventory_phone_profiles;
  if (Array.isArray(profile)) return profile[0] || null;
  return profile && typeof profile === 'object' ? profile : null;
}

function resolveProductLockerProvider(product = {}, profile = null) {
  const productProvider = nonEmpty(product?.locker_provider || product?.lockerProvider);
  const profileProvider = nonEmpty(profile?.locker_provider || profile?.lockerProvider);
  const providerHint = [productProvider, profileProvider].some(isTrustonicLockerProviderValue)
    ? 'trustonic'
    : productProvider || profileProvider;

  return resolvePhoneLockerProvider({
    product,
    profile,
    lockerProvider: providerHint
  });
}

function parseMoneyValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }

  const match = String(value ?? '')
    .replace(/,/g, '')
    .match(/-?\d+(?:\.\d+)?/);

  return match ? Number(match[0]) : NaN;
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function mapDisplayStatus(value, fallback = 'Pending') {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).replaceAll('_', ' ');
}

function paymentAccountReference(customer) {
  return normalizeReferenceValue(customer?.national_id);
}

function formatKes(value) {
  return Number(value || 0).toLocaleString('en-KE');
}

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function isoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function resolveDateTime(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function resolvePaygoTimelineEntry(schedule = {}) {
  return schedule.lastPaymentTimelineEntry || schedule.paymentTimeline?.[schedule.paymentTimeline.length - 1] || null;
}

function buildPaygoRuntimeLog({
  customer = {},
  payment = null,
  schedule = {},
  previousUnlockUntil = null,
  newUnlockUntil = null,
  action = '',
  deviceState = '',
  honorResult = null,
  source = '',
  now = new Date()
} = {}) {
  const timelineEntry = resolvePaygoTimelineEntry(schedule) || {};
  const paymentAmount = Number(
    payment?.paid_amount ??
    payment?.paygo_payment ??
    payment?.deposit_credit ??
    payment?.amount ??
    timelineEntry.amount ??
    0
  );

  return {
    customerId: customer?.id || null,
    customerName: customer?.customer_name || null,
    paymentId: payment?.id || payment?.receipt || timelineEntry.paymentId || null,
    paymentAmount,
    dailyInstallment: Number(schedule?.dailyInstallment || customer?.daily_installment || 0),
    totalPaid: Number(schedule?.totalPaid || customer?.paid_amount || 0),
    paidDays: Number(timelineEntry.paidDays || schedule?.paidDays || 0),
    unlockDurationHours: Number(timelineEntry.unlockDurationHours || 0),
    remainingBalance: Number(schedule?.remainingBalance ?? customer?.balance ?? 0),
    totalInstallments: Number(schedule?.totalInstallments || customer?.paygo_total_installments || 0),
    scheduleStatus: schedule?.scheduleStatus || customer?.paygo_schedule_status || '',
    previousUnlockUntil: isoOrNull(previousUnlockUntil || timelineEntry.previousUnlockUntil),
    newUnlockUntil: isoOrNull(newUnlockUntil || timelineEntry.newUnlockUntil),
    storedUnlockUntilAt: isoOrNull(schedule?.storedUnlockUntilAt || customer?.unlock_until || customer?.paygo_usage_ends_at || null),
    currentServerTime: isoOrNull(now) || new Date().toISOString(),
    action,
    deviceState,
    honorRequestId: honorResult?.requestId || null,
    providerRequestId: honorResult?.providerRequestId || honorResult?.requestId || null,
    providerTaskId: honorResult?.providerTaskId || honorResult?.honorTaskId || honorResult?.taskId || null,
    providerRequestUrl: honorResult?.providerRequestUrl || honorResult?.requestUrl || honorResult?.response?.url || null,
    honorTaskId: honorResult?.honorTaskId || honorResult?.taskId || null,
    honorStatus: honorResult?.status || null,
    honorLockStatus: honorResult?.honorLockStatus || null,
    providerState: honorResult?.providerState || null,
    providerLockStatus: honorResult?.providerLockStatus || honorResult?.honorLockStatus || null,
    commandStatus: honorResult?.commandStatus || null,
    commandSent: Boolean(honorResult?.commandSent),
    lockerSkipped: Boolean(honorResult?.skipped),
    skipReason: honorResult?.skipReason || null,
    confirmedCommand: Boolean(honorResult?.confirmedCommand),
    lastCommandAt: honorResult?.lastCommandAt || null,
    lastVerifiedAt: honorResult?.lastVerifiedAt || null,
    honorResponse: safeJson(honorResult?.honorLastResponse || honorResult?.response || honorResult?.unlockResult || honorResult?.lockResult || null),
    finalDeviceState: deviceState,
    source
  };
}

function derivedCustomerBalance(customer) {
  const storedBalance = Number(customer?.balance);
  if (Number.isFinite(storedBalance) && storedBalance >= 0) {
    return storedBalance;
  }

  const totalPayable = Number(customer?.total_payable || 0);
  const paidAmount = Number(customer?.paid_amount || 0);
  if (Number.isFinite(totalPayable) && totalPayable > 0) {
    return Math.max(totalPayable - paidAmount, 0);
  }
  return Number(customer?.balance || 0);
}

function derivedCustomerExpectedAmount(customer) {
  const totalPayable = Number(customer?.total_payable || 0);
  if (Number.isFinite(totalPayable) && totalPayable > 0) {
    return totalPayable;
  }

  return Number(customer?.paid_amount || 0) + derivedCustomerBalance(customer);
}

function derivedCustomerCollectedAmount(customer) {
  return Math.max(derivedCustomerExpectedAmount(customer) - derivedCustomerBalance(customer), 0);
}

function normalizeReferenceValue(value) {
  return nonEmpty(value).replace(/[\s-]+/g, '');
}

function isKnownPhoneLockerLockStatus(value) {
  return ['pending', 'synced', 'failed', 'locked', 'unlocked', 'registered'].includes(
    String(value || '').trim().toLowerCase()
  );
}

function normalizeKnownPhoneLockerLockStatus(value, fallback = '') {
  const normalized = normalizePhoneLockerLockStatus(value);
  if (isKnownPhoneLockerLockStatus(normalized)) return normalized;
  const normalizedFallback = normalizePhoneLockerLockStatus(fallback);
  if (isKnownPhoneLockerLockStatus(normalizedFallback)) return normalizedFallback;
  return '';
}

function normalizeStoredPhoneLockerLockStatus(value, action = '', fallback = 'pending') {
  const normalized = normalizeKnownPhoneLockerLockStatus(value, fallback);
  if (isKnownPhoneLockerLockStatus(normalized)) return normalized;

  const actionFallback = action === 'unlock'
    ? 'unlocked'
    : action === 'lock'
      ? 'locked'
      : action === 'register'
        ? 'registered'
        : action === 'sync'
          ? 'synced'
          : '';

  if (isKnownPhoneLockerLockStatus(actionFallback)) return actionFallback;
  if (isKnownPhoneLockerLockStatus(fallback)) return fallback;
  return 'pending';
}

function inferPhoneLockerStateFromResponse(response = {}, action = '') {
  const mapping = mapLocalPhoneLockerProviderState('trustonic', response, { action });
  return {
    providerState: nonEmpty(mapping.providerState || mapping.finalDeviceState || ''),
    providerLockStatus: normalizeKnownPhoneLockerLockStatus(
      mapping.providerLockStatus || mapping.finalDeviceState || mapping.providerState || '',
      action === 'unlock' ? 'unlocked' : action === 'lock' ? 'locked' : action === 'register' ? 'registered' : ''
    ) || null,
    finalDeviceState: normalizeKnownPhoneLockerLockStatus(
      mapping.finalDeviceState || mapping.providerLockStatus || mapping.providerState || '',
      action === 'unlock' ? 'unlocked' : action === 'lock' ? 'locked' : action === 'register' ? 'registered' : ''
    ) || null
  };
}

function normalizeInventoryProductType(value) {
  const type = String(value || '').trim().toLowerCase();
  if (['phone', 'bike', 'product'].includes(type)) return type;
  return 'product';
}

function isPhoneInventoryProduct(product = {}) {
  return normalizeInventoryProductType(product.product_type || product.productType) === 'phone';
}

function inventoryProductRegisteredId(product = {}) {
  return nonEmpty(
    product.imei_1 ||
    product.imei1 ||
    product.serial_number ||
    product.serialNumber ||
    product.chassis_number ||
    product.chassisNumber ||
    product.locker_id ||
    product.lockerId ||
    product.id
  );
}

function inventoryPhoneProfileLookupCandidates(product = {}, payload = {}) {
  return [
    nonEmpty(product?.id || payload?.productId || payload?.product_id),
    nonEmpty(product?.locker_id || product?.lockerId || payload?.lockerId || payload?.locker_id),
    nonEmpty(product?.imei_1 || product?.imei1 || payload?.imei1 || payload?.imei_1 || inventoryProductRegisteredId(product) || payload?.registeredId || payload?.registered_id)
  ].filter(Boolean);
}

function inventoryPhoneDeviceIds(product = {}) {
  return [...new Set([
    product.imei_1,
    product.imei1,
    product.imei_2,
    product.imei2
  ]
    .map(nonEmpty)
    .filter(Boolean))];
}

function buildPhoneLockerAccountCandidates(customer = {}, accountReference = '') {
  return [...new Set([
    accountReference,
    customer?.customer_account,
    customer?.account_number,
    customer?.accountNumber,
    customer?.provider_account_reference,
    customer?.payment_account_reference,
    customer?.customer_phone,
    customer?.phone,
    customer?.national_id,
    customer?.id
  ]
    .map(nonEmpty)
    .filter(Boolean))];
}

function resolveCanonicalPhoneAccountReference(customer = {}, accountReference = '') {
  return nonEmpty(
    accountReference ||
    paymentAccountReference(customer) ||
    customer?.customer_account ||
    customer?.account_number ||
    customer?.accountNumber ||
    customer?.provider_account_reference ||
    customer?.payment_account_reference ||
    customer?.national_id ||
    customer?.id
  );
}

async function upsertPhoneDeviceMappings({
  customer = null,
  product = null,
  registeredId = '',
  accountReference = '',
  sourcePortal = 'backend'
} = {}) {
  const deviceId = nonEmpty(registeredId);
  const customerAccount = resolveCanonicalPhoneAccountReference(customer, accountReference);
  if (!deviceId || !customerAccount) return null;

  const now = new Date().toISOString();
  const payload = {
    customer_account: customerAccount,
    customer_id: nonEmpty(customer?.id || null) || null,
    product_id: nonEmpty(product?.id || null) || null,
    registered_id: deviceId,
    source_portal: sourcePortal,
    updated_at: now
  };

  try {
    const [byAccountResult, byDeviceResult] = await Promise.all([
      getSupabase()
        .from('customer_device_mappings')
        .select('id,customer_account,registered_id')
        .eq('customer_account', customerAccount)
        .maybeSingle(),
      getSupabase()
        .from('customer_device_mappings')
        .select('id,customer_account,registered_id')
        .eq('registered_id', deviceId)
        .maybeSingle()
    ]);

    if (byAccountResult.error) throw byAccountResult.error;
    if (byDeviceResult.error) throw byDeviceResult.error;

    if (byDeviceResult.data) {
      if (byAccountResult.data && byAccountResult.data.id !== byDeviceResult.data.id) {
        const deleteResult = await getSupabase()
          .from('customer_device_mappings')
          .delete()
          .eq('id', byAccountResult.data.id);
        if (deleteResult.error) throw deleteResult.error;
      }

      const updateResult = await getSupabase()
        .from('customer_device_mappings')
        .update(payload)
        .eq('id', byDeviceResult.data.id);
      if (updateResult.error) throw updateResult.error;
    } else if (byAccountResult.data) {
      const updateResult = await getSupabase()
        .from('customer_device_mappings')
        .update(payload)
        .eq('id', byAccountResult.data.id);
      if (updateResult.error) throw updateResult.error;
    } else {
      const insertResult = await getSupabase()
        .from('customer_device_mappings')
        .insert(payload);
      if (insertResult.error) throw insertResult.error;
    }
  } catch (error) {
    console.warn('[phone-locker-mapping-upsert-failed]', {
      deviceId,
      customerAccount,
      error: error?.message || error
    });
  }

  return {
    customerAccount,
    registeredId: deviceId
  };
}

async function resolveMappedPhoneRegisteredId({ customer = null, accountReference = '' } = {}) {
  const customerAccounts = buildPhoneLockerAccountCandidates(customer, accountReference);
  if (customerAccounts.length === 0) return '';

  try {
    const result = await getSupabase()
      .from('customer_device_mappings')
      .select('registered_id,customer_account,updated_at')
      .in('customer_account', customerAccounts)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error) throw result.error;
    return nonEmpty(result.data?.registered_id);
  } catch (error) {
    console.warn('[phone-locker-mapping-read-failed]', {
      customerAccounts,
      error: error?.message || error
    });
    return '';
  }
}

function digitCount(value) {
  return String(value || '').replace(/\D/g, '').length;
}

function customerPaymentState(customer = {}, balanceOverride = null) {
  const balance = Number.isFinite(Number(balanceOverride))
    ? Number(balanceOverride)
    : derivedCustomerBalance(customer);
  const paymentRows = Array.isArray(customer.payments)
    ? customer.payments
    : Array.isArray(customer.paymentRows)
      ? customer.paymentRows
      : [];
  const snapshot = buildPaygoCustomerState({ ...customer, balance }, paymentRows);

  return snapshot.deviceState;
}

async function loadCustomerPaymentRows(customerId) {
  if (!customerId) return [];

  const result = await getSupabase()
    .from('payments')
    .select('id,customer_id,receipt,status,payment_status,due_date,deposit_credit,paygo_payment,paid_amount,date,provider_paid_at,provider_transaction_id,provider_reference,created_at,updated_at,total_payable,balance,ledger_state,revision_of,revision_number,correction_reason')
    .eq('customer_id', customerId)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(5000);

  if (result.error) throw mapSupabaseError(result.error);
  return result.data || [];
}

function buildCustomerPaygoPatch(customer = {}, paygoState = {}, now = new Date()) {
  const safeNow = resolveDateTime(now);
  const schedule = paygoState.schedule || {};
  const arrears = paygoState.arrears || {};
  const hasPaymentHistory = Number(schedule.totalPaid || 0) > 0;
  const currentStatus = normalizeText(customer.status).toLowerCase();
  const nextStatus = hasPaymentHistory
    ? (schedule.isComplete ? 'paid' : Number(arrears.overdueDays || 0) >= 3 ? 'defaulted' : schedule.isLocked && !arrears.hasArrears ? 'defaulted' : 'active')
    : currentStatus || 'active';
  const resetReminderState = Number(schedule.remainingBalance || 0) <= 0 || nextStatus === 'paid';

  return {
    paid_amount: schedule.totalPaid || Number(customer.paid_amount || 0),
    balance: schedule.remainingBalance ?? Number(customer.balance || 0),
    overdue_days: arrears.overdueDays ?? schedule.daysOverdue ?? Number(customer.overdue_days || 0),
    status: nextStatus,
    due_date: arrears.hasArrears && customer.due_date
      ? String(customer.due_date).slice(0, 10)
      : schedule.nextDueAt
        ? schedule.nextDueAt.slice(0, 10)
        : null,
    last_payment_date: schedule.lastPaymentAt ? schedule.lastPaymentAt.slice(0, 10) : null,
    paygo_started_at: schedule.startedAt || null,
    paygo_first_payment_at: schedule.firstPaymentAt || null,
    paygo_last_payment_at: schedule.lastPaymentAt || null,
    paygo_next_due_at: schedule.nextDueAt || null,
    paygo_usage_ends_at: schedule.usageEndsAt || null,
    unlock_until: schedule.unlockUntilAt || null,
    paygo_grace_until_at: schedule.graceUntilAt || null,
    paygo_installments_paid: schedule.installmentsPaid ?? 0,
    paygo_total_installments: schedule.totalInstallments ?? 0,
    paygo_frequency_hours: schedule.frequencyHours ?? 24,
    paygo_grace_period_hours: schedule.gracePeriodHours ?? 0,
    paygo_schedule_status: schedule.scheduleStatus || 'inactive',
    last_reminder_sent_at: resetReminderState ? null : customer.last_reminder_sent_at || null,
    next_reminder_due: resetReminderState ? null : customer.next_reminder_due || null,
    reminder_count: resetReminderState ? 0 : Number(customer.reminder_count || 0),
    updated_at: safeNow.toISOString()
  };
}

function buildCustomerPaygoLegacyPatch(customer = {}, paygoState = {}, now = new Date()) {
  const safeNow = resolveDateTime(now);
  const schedule = paygoState.schedule || {};
  const arrears = paygoState.arrears || {};
  const hasPaymentHistory = Number(schedule.totalPaid || 0) > 0;
  const currentStatus = normalizeText(customer.status).toLowerCase();
  const nextStatus = hasPaymentHistory
    ? (schedule.isComplete ? 'paid' : Number(arrears.overdueDays || 0) >= 3 ? 'defaulted' : schedule.isLocked && !arrears.hasArrears ? 'defaulted' : 'active')
    : currentStatus || 'active';
  const resetReminderState = Number(schedule.remainingBalance || 0) <= 0 || nextStatus === 'paid';

  return {
    paid_amount: schedule.totalPaid || Number(customer.paid_amount || 0),
    balance: schedule.remainingBalance ?? Number(customer.balance || 0),
    overdue_days: arrears.overdueDays ?? schedule.daysOverdue ?? Number(customer.overdue_days || 0),
    status: nextStatus,
    due_date: arrears.hasArrears && customer.due_date
      ? String(customer.due_date).slice(0, 10)
      : schedule.nextDueAt
        ? schedule.nextDueAt.slice(0, 10)
        : null,
    last_payment_date: schedule.lastPaymentAt ? schedule.lastPaymentAt.slice(0, 10) : null,
    last_reminder_sent_at: resetReminderState ? null : customer.last_reminder_sent_at || null,
    next_reminder_due: resetReminderState ? null : customer.next_reminder_due || null,
    reminder_count: resetReminderState ? 0 : Number(customer.reminder_count || 0),
    updated_at: safeNow.toISOString()
  };
}

function isMissingCustomerPaygoColumnError(error = {}) {
  const message = String(error?.message || '').toLowerCase();
  return [
    'paygo_started_at',
    'paygo_first_payment_at',
    'paygo_last_payment_at',
    'paygo_next_due_at',
    'paygo_usage_ends_at',
    'unlock_until',
    'paygo_grace_until_at',
    'paygo_installments_paid',
    'paygo_total_installments',
    'paygo_frequency_hours',
    'paygo_grace_period_hours',
    'paygo_schedule_status'
  ].some((column) => message.includes(column));
}

async function refreshCustomerPaygoState(customerId, {
  customer = null,
  now = new Date(),
  payments = null
} = {}) {
  const safeNow = resolveDateTime(now);
  const resolvedCustomer = customer || await getSupabase()
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .maybeSingle()
    .then((result) => {
      if (result.error) throw mapSupabaseError(result.error);
      return result.data || null;
    });

  if (!resolvedCustomer) {
    const error = new Error('Customer record was not found.');
    error.statusCode = 404;
    throw error;
  }

  const resolvedPayments = payments || await loadCustomerPaymentRows(customerId);
  const paygoState = buildPaygoCustomerState(resolvedCustomer, resolvedPayments, safeNow);
  const patch = buildCustomerPaygoPatch(resolvedCustomer, paygoState, safeNow);
  const legacyPatch = buildCustomerPaygoLegacyPatch(resolvedCustomer, paygoState, safeNow);

  let updateResult = await getSupabase()
    .from('customers')
    .update(patch)
    .eq('id', customerId)
    .select('*')
    .single();

  if (updateResult.error && isMissingCustomerPaygoColumnError(updateResult.error)) {
    updateResult = await getSupabase()
      .from('customers')
      .update(legacyPatch)
      .eq('id', customerId)
      .select('*')
      .single();
  }

  if (updateResult.error) throw mapSupabaseError(updateResult.error);

  return {
    customer: updateResult.data || { ...resolvedCustomer, ...patch, ...legacyPatch },
    payments: resolvedPayments,
    schedule: paygoState.schedule,
    deviceState: paygoState.deviceState,
    deviceAction: paygoState.deviceAction,
    patch,
    previousUnlockUntil: resolvedCustomer.unlock_until || resolvedCustomer.unlockUntilAt || resolvedCustomer.paygo_usage_ends_at || resolvedCustomer.paygoUsageEndsAt || null
  };
}

async function resolveCustomerRecord(customerOrId) {
  if (!customerOrId) return null;

  if (typeof customerOrId === 'string') {
    const result = await getSupabase()
      .from('customers')
      .select('*')
      .eq('id', customerOrId)
      .maybeSingle();

    if (result.error) throw mapSupabaseError(result.error);
    return result.data || null;
  }

  return customerOrId;
}

export async function reconcileCustomerPaygoAndLocker(customerOrId, {
  customer = null,
  payments = null,
  now = new Date(),
  sourcePortal = 'backend',
  reason = 'Paygo schedule reconciled.',
  payment = null,
  action = null,
  state = null,
  accountReference = ''
} = {}) {
  const safeNow = resolveDateTime(now);
  const resolvedCustomer = customer || await resolveCustomerRecord(customerOrId);
  if (!resolvedCustomer?.id) {
    const error = new Error('Customer record was not found.');
    error.statusCode = 404;
    throw error;
  }

  const paygoRefresh = await refreshCustomerPaygoState(resolvedCustomer.id, {
    customer: resolvedCustomer,
    payments,
    now: safeNow
  });
  const runtimeLog = buildPaygoRuntimeLog({
    customer: paygoRefresh.customer,
    payment,
    schedule: paygoRefresh.schedule,
    previousUnlockUntil: paygoRefresh.previousUnlockUntil,
    newUnlockUntil: paygoRefresh.patch?.unlock_until || paygoRefresh.customer?.unlock_until || null,
    action: paygoRefresh.deviceAction,
    deviceState: paygoRefresh.deviceState,
    source: sourcePortal,
    now: safeNow
  });

  console.info('[paygo-payment-sync]', runtimeLog);

  await logPaymentEvent('PAYGO_PAYMENT_SYNC', {
    ...runtimeLog,
    reason,
    sourcePortal
  }).catch(() => null);

  const lockerResult = await syncPhoneLockerForCustomer(paygoRefresh.customer, {
    action: action || paygoRefresh.deviceAction,
    state: state || paygoRefresh.deviceState,
    payment: payment || null,
    accountReference: accountReference || payment?.provider_account_reference || payment?.account_reference || payment?.accountReference || resolvedCustomer?.national_id || resolvedCustomer?.id || '',
    sourcePortal,
    reason,
    notifyDevice: Boolean(payment) || action === 'lock' || action === 'unlock',
    metadata: {
      ...runtimeLog,
      reason,
      sourcePortal
    }
  }).catch((error) => ({
    configured: phoneLockerDiagnostics().configured,
    skipped: false,
    success: false,
    error: error.message || String(error),
    reason: 'locker_sync_failed'
  }));

  if (payment) {
    await logPaymentEvent('PAYMENT_RECEIVED', {
      customerId: resolvedCustomer.id,
      deviceId: lockerResult?.registeredId || resolvedCustomer.id,
      paymentId: payment.id || payment.receipt || payment.provider_transaction_id || payment.provider_reference || null,
      amount: payment.paid_amount || payment.paygo_payment || payment.deposit_credit || payment.amount || null,
      response: payment,
      paygo: runtimeLog,
      lockerResult: safeJson(lockerResult)
    }).catch(() => null);
  }

  if (lockerResult?.success && lockerResult.action === 'lock') {
    await logDeviceEvent('DEVICE_LOCKED', {
      customerId: resolvedCustomer.id,
      deviceId: lockerResult.registeredId || resolvedCustomer.id,
      productId: lockerResult.productId || null,
      honorTaskId: lockerResult.honorTaskId || lockerResult.requestId || null,
      honorResponse: lockerResult.honorLastResponse || lockerResult.response || null,
      action: lockerResult.action,
      state: lockerResult.honorLockStatus || lockerResult.status || null,
      paygo: runtimeLog
    }).catch(() => null);
  }

  if (lockerResult?.success && lockerResult.action === 'unlock') {
    await logDeviceEvent('DEVICE_UNLOCKED', {
      customerId: resolvedCustomer.id,
      deviceId: lockerResult.registeredId || resolvedCustomer.id,
      productId: lockerResult.productId || null,
      honorTaskId: lockerResult.honorTaskId || lockerResult.requestId || null,
      honorResponse: lockerResult.honorLastResponse || lockerResult.response || null,
      action: lockerResult.action,
      state: lockerResult.honorLockStatus || lockerResult.status || null,
      paygo: runtimeLog
    }).catch(() => null);
  }

  console.info('[paygo-payment-sync-result]', {
    ...runtimeLog,
    lockerSuccess: Boolean(lockerResult?.success),
    lockerAction: lockerResult?.action || null,
    lockerSkipped: Boolean(lockerResult?.skipped),
    lockerStatus: lockerResult?.status || null,
    lockerError: lockerResult?.error || null,
    honorTaskId: lockerResult?.honorTaskId || null,
    honorLockStatus: lockerResult?.honorLockStatus || null,
    honorResponse: safeJson(lockerResult?.honorLastResponse || lockerResult?.response || null),
    finalDeviceState: lockerResult?.honorLockStatus || paygoRefresh.deviceState || null
  });

  return {
    ...paygoRefresh,
    lockerResult
  };
}

function isHonorAlreadyExistsError(error = {}) {
  const responseRows = Array.isArray(error?.response?.data) ? error.response.data : [];
  if (responseRows.some((row) => Number(row?.code) === 40001102)) {
    return true;
  }

  const responseMessage = String(error?.response?.message || error?.response?.msg || '').toLowerCase();
  if (responseMessage.includes('already exists')) {
    return true;
  }

  return String(error?.message || '').toLowerCase().includes('already exists');
}

async function findInventoryPhoneProductForCustomer(customer = {}, {
  accountReference = ''
} = {}) {
  const customerId = nonEmpty(customer?.id || customer?.customer_id);
  const identifiers = [
    customer?.serial_number,
    customer?.chassis_number,
    customer?.imei_1,
    customer?.imei_2
  ]
    .map(nonEmpty)
    .filter(Boolean);

  const mappedRegisteredId = await resolveMappedPhoneRegisteredId({ customer, accountReference });
  if (mappedRegisteredId) {
    const mappedProduct = await findInventoryProductByIdentifiers([mappedRegisteredId], 'phone');
    if (mappedProduct) return mappedProduct;
  }

  if (customerId) {
    const direct = await getSupabase()
      .from('inventory_products')
      .select('*')
      .eq('product_type', 'phone')
      .eq('assigned_customer_id', customerId)
      .maybeSingle();

    if (direct.error) throw mapSupabaseError(direct.error);
    if (direct.data) return direct.data;
  }

  for (const identifier of identifiers) {
    for (const column of ['imei_1', 'imei_2', 'serial_number', 'chassis_number', 'locker_id']) {
      const result = await getSupabase()
        .from('inventory_products')
        .select('*')
        .eq('product_type', 'phone')
        .eq(column, identifier)
        .maybeSingle();

      if (result.error) throw mapSupabaseError(result.error);
      if (result.data) return result.data;
    }
  }

  if (customerId) {
    const applicationResult = await getSupabase()
      .from('customer_applications')
      .select('product_id')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (applicationResult.error) throw mapSupabaseError(applicationResult.error);
    if (applicationResult.data?.product_id) {
      const productResult = await getSupabase()
        .from('inventory_products')
        .select('*')
        .eq('id', applicationResult.data.product_id)
        .eq('product_type', 'phone')
        .maybeSingle();

      if (productResult.error) throw mapSupabaseError(productResult.error);
      if (productResult.data) return productResult.data;
    }
  }

  return null;
}

async function findInventoryProductByIdentifiers(identifiers = [], productType = null) {
  const values = identifiers.map(nonEmpty).filter(Boolean);
  if (values.length === 0) return null;

  for (const identifier of values) {
    for (const column of ['serial_number', 'chassis_number', 'imei_1', 'imei_2', 'locker_id']) {
      let request = getSupabase()
        .from('inventory_products')
        .select('*')
        .eq(column, identifier);

      if (productType) {
        request = request.eq('product_type', productType);
      }

      const result = await request.maybeSingle();
      if (result.error) throw mapSupabaseError(result.error);
      if (result.data) return result.data;
    }
  }

  if (values.length > 0) {
    const productTypeGuess = values.some((value) => digitCount(value) === 15) ? 'phone' : null;
    if (productTypeGuess && !productType) {
      return findInventoryProductByIdentifiers(values, productTypeGuess);
    }
  }

  return null;
}

async function updatePhoneLockerSyncRecord(product, {
  action,
  payload,
  response,
  error,
  status = 'synced',
  sourcePortal = 'backend',
  recordLockRequestAt = false
} = {}) {
  const profileProvider = embeddedPhoneProfile(product);
  const currentProfile = profileProvider;
  const rowLockerProvider = resolveProductLockerProvider(product, currentProfile);
  const payloadLockerProvider = nonEmpty(payload?.locker_provider || payload?.lockerProvider);
  const resolvedLockerProvider = [rowLockerProvider, payloadLockerProvider].some(isTrustonicLockerProviderValue)
    ? 'trustonic'
    : resolvePhoneLockerProvider({
      product,
      profile: profileProvider,
      lockerProvider: payloadLockerProvider || rowLockerProvider
    });
  const payloadRegisteredId = nonEmpty(payload?.registeredId || payload?.lockerId || payload?.deviceUid);
  const trustonicRegisteredId = nonEmpty(
    payloadRegisteredId ||
    currentProfile?.locker_id ||
    currentProfile?.lockerId ||
    product?.locker_id ||
    product?.lockerId ||
    inventoryProductRegisteredId(product)
  );
  const registeredId = resolvedLockerProvider === 'trustonic'
    ? trustonicRegisteredId
    : inventoryProductRegisteredId(product) || payloadRegisteredId;
  const productId = nonEmpty(product?.id || payload?.productId);
  const now = new Date().toISOString();
  const syncStatus = status === 'failed' ? 'failed' : status === 'pending' ? 'pending' : 'synced';
  const syncError = error ? String(error.message || error) : null;
  const honorTaskId = nonEmpty(
    response?.taskId ||
    response?.task_id ||
    response?.requestId ||
    response?.request_id ||
    payload?.honorTaskId ||
    payload?.requestId
  );
  const providerTaskId = nonEmpty(
    response?.providerTaskId ||
    response?.honorTaskId ||
    response?.taskId ||
    response?.task_id ||
    response?.requestId ||
    response?.request_id ||
    payload?.providerTaskId ||
    payload?.honorTaskId ||
    payload?.taskId ||
    payload?.requestId ||
    honorTaskId
  );
  const providerRequestId = nonEmpty(
    response?.providerRequestId ||
    response?.requestId ||
    response?.request_id ||
    payload?.providerRequestId ||
    payload?.requestId ||
    providerTaskId
  );
  const lockStatus = coerceStoredHonorLockStatus(
    extractHonorTaskStatus(response, action) ||
    payload?.lockStatus ||
    payload?.honorLockStatus ||
    response?.honorLockStatus ||
    response?.lockStatus ||
    syncStatus,
    action,
    syncStatus
  );
  const providerState = nonEmpty(
    response?.providerState ||
    payload?.providerState ||
    response?.honorDeviceState ||
    payload?.honorDeviceState ||
    response?.deviceState ||
    payload?.deviceState ||
    lockStatus ||
    ''
  ) || null;
  const storedFallbackState = normalizeKnownPhoneLockerLockStatus(
    lockStatus ||
    response?.providerLockStatus ||
    response?.finalDeviceState ||
    response?.lockStatus ||
    response?.honorLockStatus ||
    payload?.providerLockStatus ||
    payload?.finalDeviceState ||
    payload?.lockStatus ||
    payload?.honorLockStatus ||
    currentProfile?.lock_status ||
    currentProfile?.honor_lock_status ||
    currentProfile?.final_device_state ||
    '',
    action === 'unlock'
      ? 'unlocked'
      : action === 'lock'
        ? 'locked'
        : action === 'register'
          ? 'registered'
          : action === 'sync'
            ? 'synced'
            : 'pending'
  ) || null;
  const inferredState = inferPhoneLockerStateFromResponse(
    response?.providerResponse ||
    response?.response ||
    response?.honorLastResponse ||
    response?.providerResponseBody ||
    response ||
    payload?.providerResponse ||
    payload?.response ||
    payload?.honorLastResponse ||
    payload || {},
    action
  );
  const providerLockStatus = normalizeKnownPhoneLockerLockStatus(
    response?.providerLockStatus ||
    response?.finalDeviceState ||
    response?.lockStatus ||
    response?.honorLockStatus ||
    payload?.providerLockStatus ||
    payload?.finalDeviceState ||
    payload?.lockStatus ||
    payload?.honorLockStatus ||
    inferredState.providerLockStatus ||
    inferredState.providerState ||
    inferredState.finalDeviceState ||
    storedFallbackState ||
    lockStatus ||
    '',
    lockStatus
  ) || null;
  const finalDeviceState = providerLockStatus || inferredState.finalDeviceState || storedFallbackState || normalizeKnownPhoneLockerLockStatus(lockStatus) || null;
  const providerResponse = safeJson(
    response?.providerResponse ||
    response?.response ||
    response?.honorLastResponse ||
    response?.commandResponse ||
    response?.verificationResponse ||
    payload?.providerResponse ||
    payload?.response ||
    payload?.honorLastResponse ||
    null
  );
  const providerErrorCode = nonEmpty(
    response?.providerErrorCode ||
    payload?.providerErrorCode ||
    (error?.statusCode ? String(error.statusCode) : '') ||
    ''
  ) || null;
  const providerErrorMessage = nonEmpty(
    response?.providerErrorMessage ||
    payload?.providerErrorMessage ||
    syncError ||
    error?.message ||
    ''
  ) || null;
  const syncStatusResolved = normalizePhoneLockerSyncStatus(response?.syncStatus || payload?.syncStatus || syncStatus);
  const commandStatusResolved = normalizePhoneLockerCommandStatus(
    response?.commandStatus ||
    payload?.commandStatus ||
    (syncStatusResolved === 'failed' ? 'failed' : (action === 'sync' ? 'skipped' : 'success'))
  );
  const lastProviderSyncAt = nonEmpty(response?.lastProviderSyncAt || payload?.lastProviderSyncAt || now) || now;
  const commandWasSkipped = Boolean(response?.skipped || payload?.skipped);
  const commandAttemptRecorded = !commandWasSkipped && (recordLockRequestAt || action !== 'sync');
  const lastCommandAt = nonEmpty(
    response?.lastCommandAt ||
    payload?.lastCommandAt ||
    (commandAttemptRecorded ? now : '')
  ) || null;
  const lastVerifiedAt = nonEmpty(response?.lastVerifiedAt || payload?.lastVerifiedAt || now) || null;
  const unlockUntilAt = nonEmpty(
    response?.unlockUntilAt ||
    response?.unlock_until_at ||
    payload?.unlockUntilAt ||
    payload?.unlock_until_at ||
    ''
  ) || null;
  const honorResponse = safeJson(response);
  const shouldStampRequestAt = commandAttemptRecorded;
  const lockRequestAt = shouldStampRequestAt ? now : nonEmpty(payload?.lastLockRequestAt);
  const profileCandidates = inventoryPhoneProfileLookupCandidates(product, payload);
  const matchCandidates = [
    { column: 'product_id', value: profileCandidates[0], label: 'product_id' },
    { column: 'locker_id', value: profileCandidates[1], label: 'locker_id' },
    { column: 'imei_1', value: profileCandidates[2], label: 'imei_1' }
  ].filter((candidate) => candidate.value);

  const profileUpdate = {
    locker_id: registeredId || null,
    locker_provider: resolvedLockerProvider || null,
    locker_app_id: phoneLockerAppId({ product, lockerProvider: resolvedLockerProvider }) || null,
    locker_sync_payload: {
      action,
      ...(payload && typeof payload === 'object' ? payload : {})
    },
    provider_state: providerState,
    provider_lock_status: providerLockStatus,
    provider_task_id: providerTaskId || null,
    provider_request_id: providerRequestId || null,
    provider_response: providerResponse,
    provider_error_code: providerErrorCode,
    provider_error_message: providerErrorMessage,
    sync_status: syncStatusResolved,
    command_status: commandStatusResolved,
    last_provider_sync_at: lastProviderSyncAt,
    last_command_at: lastCommandAt,
    last_verified_at: lastVerifiedAt,
    unlock_until_at: unlockUntilAt,
    final_device_state: finalDeviceState,
    locker_sync_status: syncStatusResolved,
    locker_last_error: providerErrorMessage || syncError,
    lock_status: normalizeStoredPhoneLockerLockStatus(
      finalDeviceState ||
      storedFallbackState ||
      (status === 'failed'
        ? 'failed'
        : action === 'unlock'
          ? 'unlocked'
          : action === 'lock'
            ? 'locked'
            : currentProfile?.lock_status || currentProfile?.honor_lock_status || currentProfile?.final_device_state || 'pending'),
      action,
      'pending'
    ),
    honor_lock_status: normalizeStoredPhoneLockerLockStatus(
      finalDeviceState || storedFallbackState || inferredState.finalDeviceState || currentProfile?.honor_lock_status || currentProfile?.lock_status || 'pending',
      action,
      'pending'
    ),
    device_status: providerState || finalDeviceState || inferredState.providerState || currentProfile?.device_status || currentProfile?.lock_status || null,
    last_known_honor_status: normalizeStoredPhoneLockerLockStatus(
      finalDeviceState || storedFallbackState || inferredState.finalDeviceState || currentProfile?.last_known_honor_status || currentProfile?.lock_status || 'pending',
      action,
      'pending'
    ),
    honor_last_response: honorResponse,
    last_sync_at: now,
    updated_at: now
  };

  const profileLockReason = nonEmpty(payload?.reason || payload?.lockReason || payload?.message || '');
  if (profileLockReason) {
    profileUpdate.lock_reason = profileLockReason;
  }
  if (action === 'lock' || lockStatus === 'locked') {
    profileUpdate.locked_at = now;
  }
  if (action === 'unlock' || lockStatus === 'unlocked') {
    profileUpdate.unlocked_at = now;
  }

  if (honorTaskId) {
    profileUpdate.honor_task_id = honorTaskId;
  }

  if (providerTaskId) {
    profileUpdate.provider_task_id = providerTaskId;
  }

  if (providerRequestId) {
    profileUpdate.provider_request_id = providerRequestId;
  }

  if (lockRequestAt) {
    profileUpdate.locker_last_request_at = lockRequestAt;
    profileUpdate.last_lock_request_at = lockRequestAt;
  }

  if (lastCommandAt) {
    profileUpdate.last_command_at = lastCommandAt;
  }

  if (lastVerifiedAt) {
    profileUpdate.last_verified_at = lastVerifiedAt;
  }

  if (!payload?.skipped) {
    if (action === 'lock' && lockRequestAt) {
      profileUpdate.last_lock_command_at = lockRequestAt;
      profileUpdate.last_command_action = 'lock';
    }
    if (action === 'unlock' && lockRequestAt) {
      profileUpdate.last_unlock_command_at = lockRequestAt;
      profileUpdate.last_command_action = 'unlock';
    }
  }

  if (syncStatusResolved === 'synced') {
    profileUpdate.locker_last_synced_at = lastProviderSyncAt;
  }

  let matchedProfile = null;
  let matchedBy = null;
  for (const candidate of matchCandidates) {
    const profileResult = await getSupabase()
      .from('inventory_phone_profiles')
      .select('product_id, locker_id, imei_1')
      .eq(candidate.column, candidate.value)
      .maybeSingle();

    if (profileResult.error) {
      console.warn('[phone-locker-profile-lookup-failed]', {
        column: candidate.column,
        value: candidate.value,
        error: profileResult.error?.message || profileResult.error
      });
      continue;
    }

    if (profileResult.data) {
      matchedProfile = profileResult.data;
      matchedBy = candidate.label;
      break;
    }
  }

  const profileRowId = matchedProfile?.product_id || productId;
  if (profileRowId) {
    console.info('[phone-locker-profile-update-start]', {
      productId: profileRowId,
      matchedBy,
      lockerId: profileUpdate.locker_id,
      honorTaskId,
      providerTaskId: profileUpdate.provider_task_id || null,
      providerState: profileUpdate.provider_state || null,
      providerLockStatus: profileUpdate.provider_lock_status || null,
      honorLockStatus: lockStatus,
      syncStatus: syncStatusResolved
    });

    try {
      let profileUpdatePayload = { ...profileUpdate };
      let profileResult = null;
      const removedColumns = [];

      for (let attempt = 0; attempt < 8; attempt += 1) {
        profileResult = await getSupabase()
          .from('inventory_phone_profiles')
          .update(profileUpdatePayload)
          .eq('product_id', profileRowId);

        if (!profileResult.error) {
          break;
        }

        const missingColumn = extractMissingSchemaColumnName(profileResult.error);
        if (!missingColumn || !Object.prototype.hasOwnProperty.call(profileUpdatePayload, missingColumn)) {
          break;
        }

        removedColumns.push(missingColumn);
        const nextPayload = { ...profileUpdatePayload };
        delete nextPayload[missingColumn];

        if (Object.keys(nextPayload).length === Object.keys(profileUpdatePayload).length) {
          break;
        }

        profileUpdatePayload = nextPayload;
      }

      if (profileResult?.error) {
        console.warn('[phone-locker-profile-update-failed]', {
          productId: profileRowId,
          matchedBy,
          lockerId: profileUpdate.locker_id,
          imei1: profileCandidates[2] || null,
          error: profileResult.error?.message || profileResult.error,
          removedColumns
        });
      } else {
        console.info('[phone-locker-profile-update-complete]', {
          productId: profileRowId,
          matchedBy,
          lockerId: profileUpdate.locker_id,
          honorTaskId: profileUpdate.honor_task_id || null,
          providerTaskId: profileUpdate.provider_task_id || null,
          providerState: profileUpdate.provider_state || null,
          providerLockStatus: profileUpdate.provider_lock_status || null,
          honorLockStatus: profileUpdate.honor_lock_status || null,
          lockerSyncStatus: profileUpdatePayload.locker_sync_status || profileUpdate.locker_sync_status,
          removedColumns,
          updatedAt: now
        });
      }
    } catch (updateError) {
      console.warn('[phone-locker-profile-update-failed]', {
        productId: profileRowId,
        matchedBy,
        lockerId: profileUpdate.locker_id,
        imei1: profileCandidates[2] || null,
        error: updateError?.message || updateError
      });
    }
  } else {
    console.warn('[phone-locker-profile-update-skipped]', {
      registeredId,
      lockerId: profileUpdate.locker_id,
      imei1: profileCandidates[2] || null
    });
  }

  if (registeredId && phoneLockerDiagnostics({ product, lockerProvider: resolvedLockerProvider }).configured && phoneLockerAppId({ product, lockerProvider: resolvedLockerProvider }) && phoneLockerBaseUrl({ product, lockerProvider: resolvedLockerProvider })) {
    try {
      console.info('[phone-locker-integration-update-start]', {
        lockerId: registeredId,
        appId: phoneLockerAppId({ product, lockerProvider: resolvedLockerProvider }),
        lockerProvider: resolvedLockerProvider,
        syncStatus
      });

      const integrationResult = await getSupabase()
        .from('phone_locker_integrations')
        .upsert({
          locker_id: registeredId,
          locker_provider: resolvedLockerProvider || 'honor',
          app_id: phoneLockerAppId({ product, lockerProvider: resolvedLockerProvider }),
          app_key: null,
          sync_base_url: phoneLockerBaseUrl({ product, lockerProvider: resolvedLockerProvider }),
          sync_enabled: true,
          last_sync_status: syncStatus,
          last_synced_at: syncStatus === 'synced' ? now : null,
          last_error: syncError,
          updated_at: now
        }, { onConflict: 'locker_id' });

      if (integrationResult.error) {
        console.warn('[phone-locker-integration-update-failed]', {
          lockerId: registeredId,
          error: integrationResult.error?.message || integrationResult.error
        });
      } else {
        console.info('[phone-locker-integration-update-complete]', {
          lockerId: registeredId,
          lockerProvider: resolvedLockerProvider,
          syncStatus,
          updatedAt: now
        });
      }
    } catch (integrationError) {
      console.warn('[phone-locker-integration-update-failed]', {
        lockerId: registeredId,
        error: integrationError?.message || integrationError
      });
    }
  }

  return {
    productId,
    registeredId,
    lockerProvider: resolvedLockerProvider,
    providerState,
    providerLockStatus,
    finalDeviceState,
    providerTaskId: providerTaskId || null,
    providerRequestId: providerRequestId || null,
    providerResponse,
    providerErrorCode,
    providerErrorMessage,
    syncStatus: syncStatusResolved,
    commandStatus: commandStatusResolved,
    lastProviderSyncAt,
    lastCommandAt,
    lastVerifiedAt,
    unlockUntilAt,
    honorTaskId: honorTaskId || null,
    lockStatus: finalDeviceState || lockStatus,
    honorLastResponse: honorResponse,
    lastLockRequestAt: lastCommandAt || lockRequestAt || null,
    action,
    status: syncStatusResolved,
    error: syncError,
    response: response || null,
    sourcePortal,
    updatedAt: now
  };
}

function normalizeHonorTaskValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function normalizeHonorOperationType(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isRecognizedHonorDeviceState(value) {
  return ['locked', 'unlocked', 'pending', 'registered', 'failed'].includes(String(value || '').trim().toLowerCase());
}

function extractHonorDeviceState(source) {
  const payload = source?.body && typeof source.body === 'object' ? source.body : source || {};
  const rows = [
    ...(Array.isArray(source?.rows) ? source.rows : []),
    ...(Array.isArray(payload?.data) ? payload.data : [])
  ].filter((row) => row && typeof row === 'object');

  for (const row of rows) {
    const operationType = normalizeHonorOperationType(row.operationType ?? row.operation_type);
    const operationResult = normalizeHonorOperationType(row.operationResult ?? row.operation_result);

    if (operationResult !== 0) continue;
    if (operationType === 4) return 'unlocked';
    if (operationType === 3) return 'locked';
    if (operationType === 1 || operationType === 0) return 'registered';
  }

  const candidates = [
    payload?.status,
    payload?.state,
    payload?.result,
    payload?.resultStatus,
    payload?.taskStatus,
    payload?.operationStatus,
    payload?.lockStatus,
    payload?.message,
    ...rows.flatMap((row) => [
      row?.status,
      row?.state,
      row?.result,
      row?.resultStatus,
      row?.taskStatus,
      row?.operationStatus,
      row?.lockStatus,
      row?.message
    ])
  ]
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .map((value) => normalizeHonorTaskValue(value));

  for (const candidate of candidates) {
    const state = normalizeHonorDeviceState(candidate);
    if (isRecognizedHonorDeviceState(state)) {
      return state;
    }
  }

  return '';
}

function normalizeStoredHonorLockStatus(value, action = '') {
  const normalized = normalizeHonorTaskValue(value);
  if (!normalized) return '';
  if (normalized.includes('unlocking') || normalized.includes('locking') || normalized.includes('releasingcontrol')) return 'pending';
  if (['11', '12', '13', '21', '22', '23', '33', '34', '35'].includes(normalized)) return 'pending';
  if (['1', '3', 'released', 'controlreleased'].includes(normalized)) return 'unlocked';
  if (['2', '31', '32', 'offlinelocked'].includes(normalized)) return 'locked';
  if (/^\d+$/.test(normalized)) {
    const numeric = Number(normalized);
    if (numeric >= 200 && numeric < 300) {
      const mappedAction = normalizeHonorTaskValue(action);
      if (mappedAction === 'unlock') return 'unlocked';
      if (mappedAction === 'lock') return 'locked';
      if (mappedAction === 'register') return 'registered';
      return 'synced';
    }
  }
  if (['failed', 'error', 'cancelled', 'canceled', 'rejected', 'invalid'].includes(normalized)) return 'failed';
  if (['pending', 'queued', 'processing', 'running', 'inprogress', 'sent', 'submitted', 'waiting'].includes(normalized)) return 'pending';
  if (['unlocked', 'unlockedsuccess'].includes(normalized)) return 'unlocked';
  if (['locked', 'lockedsuccess', 'success', 'succeeded', 'completed', 'complete', 'done', 'accepted', 'ok', '20000000'].includes(normalized)) {
    const mappedAction = normalizeHonorTaskValue(action);
    if (mappedAction === 'unlock') return 'unlocked';
    if (mappedAction === 'register') return 'registered';
    if (mappedAction === 'sync') return 'synced';
    return 'locked';
  }
  if (normalized === 'registered') return 'registered';
  if (normalized === 'synced') return 'synced';
  return normalized;
}

function coerceStoredHonorLockStatus(value, action = '', fallback = '') {
  const normalized = normalizeStoredHonorLockStatus(value, action);
  const mappedAction = normalizeHonorTaskValue(action);

  if (['pending', 'synced', 'failed', 'locked', 'unlocked', 'registered'].includes(normalized)) {
    return normalized;
  }

  if (normalized) {
    if (mappedAction === 'unlock') return 'unlocked';
    if (mappedAction === 'lock') return 'locked';
    if (mappedAction === 'register') return 'registered';
    if (mappedAction === 'sync') return 'synced';
  }

  return fallback || (mappedAction === 'unlock' ? 'unlocked' : mappedAction === 'lock' ? 'locked' : mappedAction === 'register' ? 'registered' : 'synced');
}

function extractTrustonicDeviceUidCandidate(source, seen = new Set()) {
  if (!source) return '';

  if (Array.isArray(source)) {
    for (const item of source) {
      const candidate = extractTrustonicDeviceUidCandidate(item, seen);
      if (candidate) return candidate;
    }
    return '';
  }

  if (typeof source !== 'object') {
    return nonEmpty(source);
  }

  if (seen.has(source)) return '';
  seen.add(source);

  const directCandidates = [
    source.deviceUid,
    source.device_uid,
    source.registeredId,
    source.registered_id,
    source.deviceId,
    source.device_id,
    source.lockerId,
    source.locker_id,
    source.imei,
    source.imei_1,
    source.imei1,
    source.serialNumber,
    source.serial_number
  ]
    .map(nonEmpty)
    .filter(Boolean);
  if (directCandidates.length > 0) return directCandidates[0];

  const arrayCandidates = [
    source.registeredIds,
    source.deviceIds,
    source.deviceUids
  ];
  for (const candidateList of arrayCandidates) {
    if (!Array.isArray(candidateList)) continue;
    const candidate = candidateList.map(nonEmpty).find(Boolean);
    if (candidate) return candidate;
  }

  const nestedKeys = [
    'provider_response',
    'providerResponse',
    'locker_sync_payload',
    'lockerSyncPayload',
    'honor_last_response',
    'honorLastResponse',
    'response',
    'body',
    'payload',
    'data',
    'rows',
    'result',
    'results',
    'items',
    'list',
    'deviceList',
    'deviceResponseList',
    'deviceReleaseList',
    'updateExpirationList',
    'messageList',
    'pinUnlockList',
    'devices'
  ];
  for (const key of nestedKeys) {
    const nested = source[key];
    if (!nested) continue;
    const candidate = extractTrustonicDeviceUidCandidate(nested, seen);
    if (candidate) return candidate;
  }

  return '';
}

export function resolveTrustonicPhoneLockerDeviceUid(product = {}, profile = null) {
  const responseSources = [
    profile?.provider_response,
    profile?.providerResponse,
    profile?.locker_sync_payload,
    profile?.lockerSyncPayload,
    profile?.honor_last_response,
    profile?.honorLastResponse,
    product?.provider_response,
    product?.providerResponse,
    product?.locker_sync_payload,
    product?.lockerSyncPayload,
    product?.honor_last_response,
    product?.honorLastResponse
  ];

  for (const source of responseSources) {
    const candidate = extractTrustonicDeviceUidCandidate(source);
    if (candidate) return candidate;
  }

  return nonEmpty(
    profile?.locker_id ||
    profile?.lockerId ||
    product?.locker_id ||
    product?.lockerId ||
    profile?.deviceUid ||
    profile?.device_uid ||
    product?.deviceUid ||
    product?.device_uid ||
    profile?.imei_1 ||
    profile?.imei1 ||
    product?.imei_1 ||
    product?.imei1 ||
    ''
  );
}

function resolveGenericPhoneLockerDeviceUid(product = {}, profile = null, lockerProvider = '') {
  const providerName = normalizeText(lockerProvider || product?.locker_provider || product?.lockerProvider || profile?.locker_provider || profile?.lockerProvider || '').toLowerCase();
  if (providerName === 'trustonic') {
    return resolveTrustonicPhoneLockerDeviceUid(product, profile);
  }

  return nonEmpty(
    inventoryProductRegisteredId(product) ||
    profile?.locker_id ||
    product?.locker_id ||
    product?.imei_1 ||
    profile?.imei_1 ||
    ''
  );
}

function resolveGenericPhoneLockerExpectedState(action = '', state = '') {
  return normalizeStoredHonorLockStatus(state, action);
}

function extractMissingSchemaColumnName(error = {}) {
  const message = String(error?.message || error?.details || error || '');
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /Could not find the "([^"]+)" column/i,
    /column '([^']+)' of 'inventory_phone_profiles' in the schema cache/i,
    /column "([^"]+)" of "inventory_phone_profiles" in the schema cache/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }

  return '';
}

function buildGenericPhoneLockerDeviceInfos(product = {}, profile = null, lockerProvider = '', deviceUid = '') {
  const providerName = normalizeText(lockerProvider || product?.locker_provider || product?.lockerProvider || profile?.locker_provider || profile?.lockerProvider || '').toLowerCase();
  if (providerName === 'trustonic') {
    const resolvedUid = nonEmpty(deviceUid || resolveTrustonicPhoneLockerDeviceUid(product, profile));
    return resolvedUid ? [[resolvedUid]] : [];
  }

  const phoneIds = inventoryPhoneDeviceIds(product);
  if (phoneIds.length > 0) {
    return [phoneIds];
  }

  const fallbackId = nonEmpty(deviceUid || inventoryProductRegisteredId(product) || profile?.locker_id || product?.locker_id || '');
  return fallbackId ? [[fallbackId]] : [];
}

function buildPhoneLockerResult({
  provider,
  lockerProvider,
  action,
  registeredId,
  deviceUid,
  expectedState = '',
  providerState = 'unknown',
  providerLockStatus = 'unknown',
  syncStatus = 'unknown',
  commandStatus = 'unknown',
  success = false,
  skipped = false,
  providerTaskId = null,
  providerRequestId = null,
  providerResponse = null,
  providerErrorCode = null,
  providerErrorMessage = null,
  lastProviderSyncAt = null,
  lastCommandAt = null,
  lastVerifiedAt = null,
  unlockUntilAt = null,
  providerRequestUrl = null,
  commandSent = false,
  skipReason = null,
  confirmedCommand = false,
  recentCommand = false,
  commandAgeMs = null,
  commandCooldownMs = null,
  payload = null,
  requestId = null,
  commandResponse = null,
  verificationResponse = null
} = {}) {
  const normalizedFinalState = normalizePhoneLockerLockStatus(providerLockStatus);
  const finalDeviceState = normalizedFinalState !== 'unknown'
    ? normalizedFinalState
    : normalizePhoneLockerLockStatus(expectedState);
  const providerResponseBody = providerResponse || verificationResponse || commandResponse || null;
  const resolvedRequestId = requestId || providerRequestId || providerTaskId || null;

  return {
    configured: true,
    success: Boolean(success),
    skipped: Boolean(skipped),
    action,
    provider: provider?.name || lockerProvider || '',
    lockerProvider: lockerProvider || provider?.name || '',
    registeredId: deviceUid || registeredId || '',
    deviceUid: deviceUid || registeredId || '',
    requestId: resolvedRequestId,
    providerRequestId: providerRequestId || resolvedRequestId,
    providerTaskId: providerTaskId || null,
    providerState: providerState || 'unknown',
    providerLockStatus: finalDeviceState,
    lockStatus: finalDeviceState,
    finalDeviceState,
    syncStatus: normalizePhoneLockerSyncStatus(syncStatus),
    commandStatus: normalizePhoneLockerCommandStatus(commandStatus),
    providerResponse: providerResponseBody,
    providerErrorCode: providerErrorCode || null,
    providerErrorMessage: providerErrorMessage || null,
    lastProviderSyncAt: lastProviderSyncAt || null,
    lastCommandAt: lastCommandAt || null,
    lastVerifiedAt: lastVerifiedAt || null,
    unlockUntilAt: unlockUntilAt || null,
    providerRequestUrl: providerRequestUrl || providerResponseBody?.url || providerResponseBody?.requestUrl || null,
    commandSent: Boolean(commandSent),
    skipReason: skipReason || null,
    confirmedCommand: Boolean(confirmedCommand),
    recentCommand: Boolean(recentCommand),
    commandAgeMs: Number.isFinite(commandAgeMs) ? commandAgeMs : null,
    commandCooldownMs: Number.isFinite(commandCooldownMs) ? commandCooldownMs : null,
    payload,
    response: providerResponseBody,
    honorTaskId: providerTaskId || providerRequestId || resolvedRequestId || null,
    honorLockStatus: finalDeviceState,
    honorDeviceState: providerState || finalDeviceState,
    honorLastResponse: providerResponseBody,
    lockerSyncStatus: normalizePhoneLockerSyncStatus(syncStatus),
    lastLockRequestAt: lastCommandAt || null
  };
}

function extractHonorTaskStatus(source, action = '') {
  const mappedAction = normalizeHonorTaskValue(action);
  const deviceState = extractHonorDeviceState(source);
  if (deviceState) return deviceState;

  const payload = source?.body && typeof source.body === 'object' ? source.body : source || {};
  const rows = [
    ...(Array.isArray(source?.rows) ? source.rows : []),
    ...(Array.isArray(payload?.data) ? payload.data : [])
  ];
  const candidates = [
    payload?.status,
    payload?.state,
    payload?.result,
    payload?.resultStatus,
    payload?.taskStatus,
    payload?.operationStatus,
    payload?.lockStatus,
    payload?.message,
    ...rows.flatMap((row) => [
      row?.status,
      row?.state,
      row?.result,
      row?.resultStatus,
      row?.taskStatus,
      row?.operationStatus,
      row?.lockStatus,
      row?.message
    ])
  ]
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .map((value) => normalizeHonorTaskValue(value));

  const hasAny = (values) => values.some((value) => candidates.includes(value));
  if (hasAny(['failed', 'error', 'cancelled', 'canceled', 'rejected', 'invalid'])) return 'failed';
  if (hasAny(['pending', 'queued', 'processing', 'running', 'inprogress', 'sent', 'submitted', 'waiting'])) return 'pending';
  if (hasAny(['success', 'succeeded', 'completed', 'complete', 'done', 'accepted', 'ok', '20000000'])) {
    if (mappedAction === 'unlock') return 'unlocked';
    if (mappedAction === 'lock') return 'locked';
    if (mappedAction === 'register') return 'registered';
    return 'synced';
  }
  return '';
}

async function resolveHonorTaskStatus({
  action,
  product = null,
  registeredId,
  timeoutMs
} = {}) {
  const fallbackStatus = action === 'sync' ? 'synced' : 'pending';
  let lastTaskResult = null;
  let lastStatus = '';

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      lastTaskResult = await queryTask({ registeredId, product, action, timeoutMs });
      lastStatus = extractHonorTaskStatus(lastTaskResult, action);
      if (lastStatus && lastStatus !== 'pending') {
        return {
          honorLockStatus: lastStatus,
          taskResult: lastTaskResult
        };
      }
    } catch (error) {
      console.warn('[phone-locker-task-query-failed]', registeredId, error?.message || error);
      break;
    }

    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    }
  }

  return {
    honorLockStatus: lastStatus || fallbackStatus,
    taskResult: lastTaskResult
  };
}

function normalizeHonorDeviceState(value) {
  const normalized = normalizeHonorTaskValue(value);
  if (!normalized) return '';
  if (normalized.includes('unlocking') || normalized.includes('locking') || normalized.includes('releasingcontrol')) return 'pending';
  if (['11', '12', '13', '21', '22', '23', '33', '34', '35', 'pending', 'queued', 'processing', 'running', 'waiting'].includes(normalized)) return 'pending';
  if (['1', '3', 'activated', 'active', 'unlocked', 'unlock', 'available', 'normal', 'released', 'controlreleased'].includes(normalized)) return 'unlocked';
  if (['2', '31', '32', 'locked', 'lock', 'disabled', 'deactivated', 'inactive', 'restricted', 'offlinelocked'].includes(normalized)) return 'locked';
  return normalized;
}

function isHonorAlreadyInDesiredStateError(error = {}, expectedState = '') {
  const message = String(error?.message || error?.response?.message || '').toLowerCase();
  const responseCode = Number(
    error?.response?.code ||
    error?.response?.data?.[0]?.code ||
    error?.response?.data?.code ||
    0
  );

  if (!expectedState) return false;

  if (responseCode === 40000101 || responseCode === 40000201) {
    return message.includes('current state') || message.includes('not allowed');
  }

  return (
    message.includes('current state of the device') ||
    message.includes('operation is not allowed in the current state') ||
    message.includes('already locked') ||
    message.includes('already unlocked')
  );
}

export function isHonorDesiredStateNoop({
  lockerProvider = '',
  error = null,
  expectedState = '',
  actualState = ''
} = {}) {
  const providerName = String(lockerProvider || '').trim().toLowerCase();
  const expected = normalizeStoredHonorLockStatus(expectedState);
  const actual = normalizeStoredHonorLockStatus(actualState);

  return (
    providerName === 'honor' &&
    Boolean(error) &&
    ['locked', 'unlocked'].includes(expected) &&
    actual === expected &&
    isHonorAlreadyInDesiredStateError(error, expected)
  );
}

function extractHonorDeviceStateFromDevicesResult(result = {}) {
  const payload = result?.body && typeof result.body === 'object' ? result.body : result || {};
  const rows = [
    ...(Array.isArray(result?.rows) ? result.rows : []),
    ...(Array.isArray(payload?.data) ? payload.data : [])
  ].filter((row) => row && typeof row === 'object');

  const candidates = [
    payload?.status,
    payload?.state,
    payload?.stateInfo,
    payload?.state_info,
    payload?.lockStatus,
    payload?.lock_status,
    payload?.deviceStatus,
    payload?.device_status,
    ...rows.flatMap((row) => [
      row?.status,
      row?.state,
      row?.stateInfo,
      row?.state_info,
      row?.lockStatus,
      row?.lock_status,
      row?.deviceStatus,
      row?.device_state
    ])
  ];

  for (const candidate of candidates) {
    const state = normalizeHonorDeviceState(candidate);
    if (isRecognizedHonorDeviceState(state)) return state;
  }

  return '';
}

async function verifyHonorDeviceState({
  registeredId,
  expectedState,
  action = '',
  product = null,
  timeoutMs = 15_000
} = {}) {
  if (!registeredId) {
    return {
      verified: false,
      actualState: '',
      response: null
    };
  }

  try {
    const response = await queryDevice({ registeredId, product, action, timeoutMs });
    const actualState = extractHonorDeviceStateFromDevicesResult(response);
    const verified = Boolean(expectedState && actualState && normalizeHonorDeviceState(expectedState) === actualState);
    console.info('[honor-device-verify]', {
      registeredId,
      expectedState,
      actualState,
      verified,
      requestId: response?.requestId || null
    });

    return {
      verified,
      actualState,
      response
    };
  } catch (error) {
    console.warn('[phone-locker-device-verify-failed]', {
      registeredId,
      expectedState,
      error: error?.message || error
    });
    return {
      verified: false,
      actualState: '',
      response: null,
      error
    };
  }
}

async function queryPhoneLockerStateV2(provider, providerName, {
  product = {},
  deviceUid = '',
  deviceInfos = [],
  action = 'sync',
  timeoutMs = 15_000
} = {}) {
  try {
    const response = await provider.queryDevice({
      product,
      registeredId: deviceUid,
      deviceUid,
      deviceInfos,
      action,
      timeoutMs
    });

    return {
      response,
      mapped: mapPhoneLockerProviderState(providerName, response, { action, product, deviceUid }),
      error: null
    };
  } catch (error) {
    const response = error?.response || null;
    return {
      response,
      mapped: response
        ? mapPhoneLockerProviderState(providerName, response, { action, product, deviceUid })
        : {
            provider: providerName,
            action,
            providerState: 'unknown',
            providerLockStatus: 'unknown',
            finalDeviceState: 'unknown',
            providerRequestId: error?.requestId || '',
            providerTaskId: error?.taskId || error?.requestId || '',
            providerErrorCode: error?.statusCode ? String(error.statusCode) : '',
            providerErrorMessage: error?.message || String(error),
            providerResponse: null,
            providerRows: [],
            hasExplicitState: false
          },
      error
    };
  }
}

async function refreshPhoneLockerStatusForProductV2(product, {
  action = 'sync',
  timeoutMs = 15_000,
  sourcePortal = 'backend',
  taskResult = null
} = {}) {
  const registeredId = inventoryProductRegisteredId(product);
  if (!registeredId) return null;

  let currentProfile = embeddedPhoneProfile(product);
  const productId = nonEmpty(product?.id);
  if (!currentProfile && productId) {
    try {
      const currentProfileResult = await getSupabase()
        .from('inventory_phone_profiles')
        .select('*')
        .eq('product_id', productId)
        .maybeSingle();

      if (!currentProfileResult.error) {
        currentProfile = currentProfileResult.data || null;
      }
    } catch (error) {
      console.warn('[phone-locker-profile-provider-lookup-failed]', productId, error?.message || error);
    }
  }

  const lockerProvider = resolveProductLockerProvider(product, currentProfile);
  const provider = getPhoneLockerProvider({ product, profile: currentProfile, lockerProvider });
  const providerName = provider.name || lockerProvider;
  const deviceUid = resolveGenericPhoneLockerDeviceUid(product, currentProfile, providerName);
  if (!deviceUid) {
    return {
      configured: phoneLockerDiagnostics({ product, lockerProvider: providerName }).configured,
      skipped: true,
      success: false,
      commandStatus: 'failed',
      syncStatus: 'failed',
      reason: 'missing_registered_id'
    };
  }

  const deviceInfos = buildGenericPhoneLockerDeviceInfos(product, currentProfile, providerName, deviceUid);
  const now = new Date().toISOString();
  const queryResult = taskResult
    ? {
        response: taskResult,
        mapped: mapPhoneLockerProviderState(providerName, taskResult, { action, product, deviceUid }),
        error: null
      }
    : await queryPhoneLockerStateV2(provider, providerName, {
        product,
        deviceUid,
        deviceInfos,
        action,
        timeoutMs
      });

  const syncStatus = normalizePhoneLockerSyncStatus(
    queryResult.error
      ? 'failed'
      : queryResult.mapped.providerLockStatus === 'pending'
        ? 'pending'
        : 'synced'
  );

  const result = buildPhoneLockerResult({
    provider,
    lockerProvider: providerName,
    action,
    registeredId: deviceUid,
    deviceUid,
    providerState: queryResult.mapped.providerState || 'unknown',
    providerLockStatus: queryResult.mapped.providerLockStatus || 'unknown',
    syncStatus,
    commandStatus: 'skipped',
    success: !queryResult.error,
    skipped: true,
    providerTaskId: queryResult.mapped.providerTaskId || null,
    providerRequestId: queryResult.mapped.providerRequestId || null,
    providerResponse: queryResult.mapped.providerResponse || queryResult.response || null,
    providerErrorCode: queryResult.mapped.providerErrorCode || null,
    providerErrorMessage: queryResult.mapped.providerErrorMessage || (queryResult.error?.message || null),
    lastProviderSyncAt: now,
    lastVerifiedAt: now,
    payload: {
      action,
      lockerProvider: providerName,
      finalDeviceState: queryResult.mapped.providerLockStatus || 'unknown'
    },
    requestId: queryResult.mapped.providerRequestId || queryResult.mapped.providerTaskId || null
  });

  const syncRecord = await updatePhoneLockerSyncRecord(product, {
    action,
    payload: {
      ...result.payload,
      ...result,
      lockerProvider: providerName
    },
    response: result,
    status: result.syncStatus,
    error: queryResult.error || null,
    sourcePortal,
    recordLockRequestAt: action !== 'sync'
  });

  return {
    ...result,
    ...syncRecord,
    lockerProvider: providerName
  };
}

async function syncPhoneLockerForProductV2(product, {
  action = 'sync',
  state,
  customer = null,
  payment = null,
  accountReference = '',
  reason = '',
  sourcePortal = 'backend',
  metadata = {},
  unlockUntilAt = null,
  forceCommand = false
} = {}) {
  if (action === 'sync') {
    return refreshPhoneLockerStatusForProductV2(product, {
      action,
      sourcePortal,
      timeoutMs: 15_000
    });
  }

  if (!product || !isPhoneInventoryProduct(product) || !inventoryProductRegisteredId(product)) {
    const fallbackProvider = resolveProductLockerProvider(product || {}, embeddedPhoneProfile(product || {}));
    return {
      configured: phoneLockerDiagnostics({ product, lockerProvider: fallbackProvider }).configured,
      skipped: true,
      success: false,
      commandStatus: 'failed',
      syncStatus: 'failed',
      reason: 'phone_product_missing_or_unassigned'
    };
  }

  let currentProfile = embeddedPhoneProfile(product);
  const productId = nonEmpty(product?.id);
  if (!currentProfile && productId) {
    const currentProfileResult = await getSupabase()
      .from('inventory_phone_profiles')
      .select('*')
      .eq('product_id', productId)
      .maybeSingle();

    if (currentProfileResult.error) throw mapSupabaseError(currentProfileResult.error);
    currentProfile = currentProfileResult.data || null;
  }

  const lockerProvider = resolveProductLockerProvider(product, currentProfile);
  const provider = getPhoneLockerProvider({ product, profile: currentProfile, lockerProvider });
  const providerName = provider.name || lockerProvider;
  const diagnostics = phoneLockerDiagnostics({
    product,
    profile: currentProfile,
    lockerProvider: providerName
  });
  if (!diagnostics.configured) {
    return {
      configured: false,
      success: false,
      skipped: false,
      commandStatus: 'failed',
      syncStatus: 'failed',
      reason: `Phone locker provider "${lockerProvider}" is not configured. Check that the provider base URL, credentials, and policy/app identifiers are set.`
    };
  }

  const deviceUid = resolveGenericPhoneLockerDeviceUid(product, currentProfile, providerName);
  if (!deviceUid) {
    return {
      configured: true,
      skipped: true,
      success: false,
      commandStatus: 'failed',
      syncStatus: 'failed',
      reason: 'missing_registered_id'
    };
  }

  const deviceInfos = buildGenericPhoneLockerDeviceInfos(product, currentProfile, providerName, deviceUid);
  const expectedState = resolveGenericPhoneLockerExpectedState(action, state);
  const now = new Date().toISOString();
  const forceUnlock = isForceUnlockEnabled();
  const resolvedUnlockUntilAt = nonEmpty(
    unlockUntilAt ||
    customer?.unlock_until ||
    customer?.unlockUntilAt ||
    customer?.paygo_usage_ends_at ||
    customer?.paygoUsageEndsAt ||
    currentProfile?.unlock_until ||
    currentProfile?.unlockUntilAt ||
    currentProfile?.paygo_usage_ends_at ||
    currentProfile?.paygoUsageEndsAt ||
    ''
  ) || null;

  const payload = buildPhoneLockerPayload({
    action,
    state: expectedState,
    product,
    customer,
    payment,
    reason,
    sourcePortal,
    metadata,
    lockerProvider: providerName,
    deviceUid
  });

  await upsertPhoneDeviceMappings({
    customer,
    product,
    registeredId: deviceUid,
    accountReference: accountReference || metadata.accountReference || customer?.provider_account_reference || customer?.customer_account || customer?.national_id || customer?.id || '',
    sourcePortal
  });

  const lockPolicy = buildLockPolicy({
    lockerProvider: providerName,
    product,
    customer,
    payment,
    metadata,
    deviceUid
  });
  const unlockPolicy = buildUnlockPolicy({
    lockerProvider: providerName,
    product,
    customer,
    payment,
    reason,
    metadata,
    content: 'Your device has been unlocked.',
    deviceUid
  });

  const storedDeviceState = normalizeStoredHonorLockStatus(
    currentProfile?.provider_lock_status ||
    currentProfile?.final_device_state ||
    currentProfile?.device_status ||
    currentProfile?.last_known_honor_status ||
    currentProfile?.honor_lock_status ||
    currentProfile?.lock_status ||
    currentProfile?.locker_sync_payload?.providerLockStatus ||
    currentProfile?.locker_sync_payload?.finalDeviceState ||
    currentProfile?.locker_sync_payload?.honorLockStatus ||
    currentProfile?.locker_sync_payload?.lockStatus ||
    currentProfile?.honor_last_response?.stateInfo ||
    currentProfile?.honor_last_response?.state ||
    currentProfile?.honor_last_response?.lockStatus ||
    '',
    action
  );

  const preflight = await queryPhoneLockerStateV2(provider, providerName, {
    product,
    deviceUid,
    deviceInfos,
    action: 'sync',
    timeoutMs: 15_000
  });

  const preflightState = preflight.mapped.providerLockStatus || 'unknown';
  const preflightMatchesDesired = expectedState !== 'unknown' && preflightState === expectedState;
  const storedMatchesDesired = expectedState !== 'unknown' && storedDeviceState === expectedState;

  const commandDecision = resolveLockerCommandDecision({
    profile: currentProfile || {},
    action,
    desiredState: expectedState,
    currentState: preflightState,
    useProfileState: false,
    forceCommand,
    forceUnlock
  });

  const shouldSkipCommand = commandDecision.shouldSkip || Boolean(
    preflightMatchesDesired &&
    !forceCommand &&
    !(action === 'unlock' && forceUnlock)
  );
  const skipReason = commandDecision.skipReason || (preflightMatchesDesired ? 'provider-state-matched' : null);

  if (action !== 'register' && shouldSkipCommand) {
    console.info('[phone-locker-action-skip]', {
      registeredId: deviceUid,
      action,
      expectedState,
      currentState: commandDecision.currentState,
      finalDeviceState: commandDecision.currentState !== 'unknown' ? commandDecision.currentState : (preflightState !== 'unknown' ? preflightState : storedDeviceState || 'unknown'),
      requestId: preflight.mapped.providerRequestId || preflight.mapped.providerTaskId || null,
      taskId: preflight.mapped.providerTaskId || preflight.mapped.providerRequestId || null,
      providerRequestUrl: preflight.response?.url || preflight.mapped.providerRequestUrl || null,
      storedDeviceState,
      commandStatus: commandDecision.commandStatus,
      commandAt: commandDecision.commandAt || null,
      commandAgeMs: commandDecision.commandAgeMs,
      commandCooldownMs: commandDecision.commandCooldownMs,
      lastCommandAt: commandDecision.commandAt || null,
      lastVerifiedAt: commandDecision.lastVerifiedAt || null,
      confirmedCommand: commandDecision.confirmedCommand,
      recentCommand: commandDecision.recentCommand,
      forceUnlock: commandDecision.forceUnlock,
      reason: skipReason
    });

    const result = buildPhoneLockerResult({
      provider,
      lockerProvider: providerName,
      action,
      registeredId: deviceUid,
      deviceUid,
      expectedState,
      providerState: preflight.mapped.providerState || 'unknown',
      providerLockStatus: commandDecision.currentState !== 'unknown' ? commandDecision.currentState : (preflightState !== 'unknown' ? preflightState : storedDeviceState || 'unknown'),
      syncStatus: (preflightState === 'pending' || storedDeviceState === 'pending') ? 'pending' : 'synced',
      commandStatus: 'skipped',
      success: true,
      skipped: true,
      providerTaskId: preflight.mapped.providerTaskId || null,
      providerRequestId: preflight.mapped.providerRequestId || null,
      providerResponse: preflight.mapped.providerResponse || preflight.response || null,
      providerErrorCode: preflight.mapped.providerErrorCode || null,
      providerErrorMessage: preflight.mapped.providerErrorMessage || null,
      lastProviderSyncAt: now,
      lastVerifiedAt: now,
      unlockUntilAt: resolvedUnlockUntilAt,
      providerRequestUrl: preflight.response?.url || preflight.mapped.providerRequestUrl || null,
      commandSent: false,
      skipReason,
      confirmedCommand: commandDecision.confirmedCommand,
      recentCommand: commandDecision.recentCommand,
      commandAgeMs: commandDecision.commandAgeMs,
      commandCooldownMs: commandDecision.commandCooldownMs,
      payload,
      requestId: preflight.mapped.providerRequestId || preflight.mapped.providerTaskId || null
    });

    const syncRecord = await updatePhoneLockerSyncRecord(product, {
      action,
      payload: {
        ...payload,
        ...result,
        lockerProvider: providerName
      },
      response: result,
      status: result.syncStatus,
      sourcePortal,
      recordLockRequestAt: false
    });

    return {
      ...result,
      ...syncRecord,
      payload,
      lockerProvider: providerName
    };
  }

  let commandResponse = null;
  let commandValidation = null;
  let verification = preflight;
  let commandError = null;

  try {
    if (action === 'register') {
      commandResponse = await provider.enrollDevice({
        product,
        customer,
        payment,
        body: payload,
        timeoutMs: 15_000
      });
    } else if (action === 'lock') {
      commandResponse = typeof provider.lockDevice === 'function'
        ? await provider.lockDevice({
            product,
            customer,
            payment,
            registeredIds: [deviceUid],
            deviceInfos,
            lockPolicy,
            body: payload,
            timeoutMs: 15_000
          })
        : await provider.deliverLock({
            product,
            customer,
            payment,
            registeredIds: [deviceUid],
            deviceInfos,
            lockPolicy,
            body: payload,
            timeoutMs: 15_000
          });
    } else if (action === 'unlock') {
      commandResponse = typeof provider.unlockOrExtendDevice === 'function'
        ? await provider.unlockOrExtendDevice({
            product,
            customer,
            payment,
            registeredIds: [deviceUid],
            deviceInfos,
            unlockPolicy,
            body: payload,
            timeoutMs: 15_000
          })
        : await provider.unlockDevice({
            product,
            customer,
            payment,
            registeredIds: [deviceUid],
            deviceInfos,
            unlockPolicy,
            body: payload,
            timeoutMs: 15_000
          });
    } else if (action === 'release') {
      commandResponse = await provider.releaseDevice(deviceUid, {
        timeoutMs: 15_000
      });
    }

    commandValidation = validatePhoneLockerCommandResponse(commandResponse, {
      provider: providerName,
      action,
      product,
      deviceUid
    });
  } catch (error) {
    commandError = error;
    commandResponse = error?.response || null;
    commandValidation = commandResponse
      ? validatePhoneLockerCommandResponse(commandResponse, {
          provider: providerName,
          action,
          product,
          deviceUid
        })
      : {
          provider: providerName,
          action,
          providerState: 'unknown',
          providerLockStatus: 'unknown',
          finalDeviceState: 'unknown',
          providerRequestId: error?.requestId || null,
          providerTaskId: error?.taskId || error?.requestId || null,
          providerErrorCode: error?.statusCode ? String(error.statusCode) : '',
          providerErrorMessage: error?.message || String(error),
          providerResponse: null,
          providerRows: [],
          hasExplicitState: false,
          commandStatus: 'failed',
          success: false,
          commandAccepted: false,
          commandPending: false,
          rawResultCode: ''
        };
  }

  if (action !== 'sync' || commandValidation.commandStatus === 'failed') {
    verification = await queryPhoneLockerStateV2(provider, providerName, {
      product,
      deviceUid,
      deviceInfos,
      action: 'sync',
      timeoutMs: 15_000
    });
  }

  const verificationState = verification.mapped?.providerLockStatus || 'unknown';
  const finalDeviceState = verificationState !== 'unknown'
    ? verificationState
    : commandValidation.providerLockStatus || 'unknown';
  const honorDesiredStateNoop = isHonorDesiredStateNoop({
    lockerProvider: providerName,
    error: commandError,
    expectedState,
    actualState: finalDeviceState
  });
  const resolvedCommandStatus = honorDesiredStateNoop
    ? 'skipped'
    : commandValidation.commandStatus || 'success';
  let syncStatus = 'synced';
  if (resolvedCommandStatus === 'failed') {
    syncStatus = 'failed';
  } else if (finalDeviceState === 'pending' || resolvedCommandStatus === 'pending') {
    syncStatus = 'pending';
  } else if (expectedState !== 'unknown' && finalDeviceState !== 'unknown' && finalDeviceState !== expectedState) {
    syncStatus = 'failed';
  }
  if (action === 'register' && syncStatus === 'failed' && commandValidation.commandStatus !== 'failed') {
    syncStatus = 'synced';
  }
  const success = syncStatus !== 'failed';
  const result = buildPhoneLockerResult({
    provider,
    lockerProvider: providerName,
    action,
    registeredId: deviceUid,
    deviceUid,
    expectedState,
    providerState: verification.mapped?.providerState || commandValidation.providerState || 'unknown',
    providerLockStatus: finalDeviceState,
    syncStatus,
    commandStatus: resolvedCommandStatus,
    success,
    skipped: honorDesiredStateNoop,
    providerTaskId: commandValidation.providerTaskId || verification.mapped?.providerTaskId || null,
    providerRequestId: commandValidation.providerRequestId || verification.mapped?.providerRequestId || null,
    providerResponse: verification.response || commandValidation.providerResponse || commandResponse || null,
    providerErrorCode: honorDesiredStateNoop ? null : commandValidation.providerErrorCode || null,
    providerErrorMessage: honorDesiredStateNoop ? null : commandValidation.providerErrorMessage || (commandError?.message || null),
    lastProviderSyncAt: now,
    lastCommandAt: action === 'sync' ? null : now,
    lastVerifiedAt: verification.response ? now : null,
    unlockUntilAt: resolvedUnlockUntilAt,
    commandSent: action !== 'sync',
    skipReason: honorDesiredStateNoop ? 'provider-already-in-desired-state' : null,
    payload,
    requestId: commandValidation.providerRequestId || verification.mapped?.providerRequestId || null,
    commandResponse,
    verificationResponse: verification.response
  });

  const syncRecord = await updatePhoneLockerSyncRecord(product, {
    action,
    payload: {
      ...payload,
      ...result,
      lockerProvider: providerName
    },
    response: result,
    error: syncStatus === 'failed' ? commandError || new Error(result.providerErrorMessage || 'Phone locker command failed.') : null,
    status: syncStatus,
    sourcePortal,
    recordLockRequestAt: action !== 'sync'
  });

  const finalResult = {
    ...result,
    ...syncRecord,
    payload,
    lockerProvider: providerName
  };

  return finalResult;
}

export async function refreshHonorTaskStatusForProduct(product, {
  action = 'sync',
  timeoutMs = 15_000,
  sourcePortal = 'backend',
  taskResult = null
} = {}) {
  return refreshPhoneLockerStatusForProductV2(product, {
    action,
    timeoutMs,
    sourcePortal,
    taskResult
  });

  const registeredId = inventoryProductRegisteredId(product);
  if (!registeredId) return null;

  let currentProfile = embeddedPhoneProfile(product);
  const productId = nonEmpty(product?.id);
  if (!currentProfile && productId) {
    try {
      const currentProfileResult = await getSupabase()
        .from('inventory_phone_profiles')
        .select('*')
        .eq('product_id', productId)
        .maybeSingle();

      if (!currentProfileResult.error) {
        currentProfile = currentProfileResult.data || null;
      }
    } catch (error) {
      console.warn('[phone-locker-profile-provider-lookup-failed]', productId, error?.message || error);
    }
  }
  const lockerProvider = resolveProductLockerProvider(product, currentProfile);

  let resolvedTaskResult = taskResult;
  if (!resolvedTaskResult) {
    try {
      resolvedTaskResult = await queryTask({ registeredId, product, action, timeoutMs, lockerProvider });
    } catch (error) {
      console.warn('[phone-locker-task-refresh-failed]', registeredId, error?.message || error);
      return null;
    }
  }

  const honorLockStatus = coerceStoredHonorLockStatus(
    extractHonorTaskStatus(resolvedTaskResult, action),
    action,
    'pending'
  );
  const syncStatus = honorLockStatus === 'pending' ? 'pending' : 'synced';

  try {
    await updatePhoneLockerSyncRecord(product, {
      action,
      payload: {
        lockerProvider,
        honorLockStatus,
        lockStatus: honorLockStatus
      },
      response: resolvedTaskResult,
      status: syncStatus,
      sourcePortal,
      recordLockRequestAt: true
    });
  } catch (error) {
    console.warn('[phone-locker-task-refresh-update-failed]', registeredId, error?.message || error);
  }

  return {
    honorLockStatus,
    lockStatus: honorLockStatus,
    honorLastResponse: resolvedTaskResult,
    lockerProvider,
    status: syncStatus,
    taskResult: resolvedTaskResult
  };
}

export async function syncPhoneLockerForProduct(product, {
  action = 'sync',
  state,
  customer = null,
  payment = null,
  accountReference = '',
  reason = '',
  sourcePortal = 'backend',
  metadata = {},
  forceCommand = false
} = {}) {
  return syncPhoneLockerForProductV2(product, {
    action,
    state,
    customer,
    payment,
    accountReference,
    reason,
    sourcePortal,
    metadata,
    forceCommand
  });

  if (!product || !isPhoneInventoryProduct(product) || !inventoryProductRegisteredId(product)) {
    const fallbackProvider = resolveProductLockerProvider(product || {}, embeddedPhoneProfile(product || {}));
    return {
      configured: phoneLockerDiagnostics({ product, lockerProvider: fallbackProvider }).configured,
      skipped: true,
      success: false,
      reason: 'phone_product_missing_or_unassigned'
    };
  }

  let currentProfile = embeddedPhoneProfile(product);
  const productId = nonEmpty(product?.id);
  if (!currentProfile && productId) {
    const currentProfileResult = await getSupabase()
      .from('inventory_phone_profiles')
      .select('*')
      .eq('product_id', productId)
      .maybeSingle();

    if (currentProfileResult.error) throw mapSupabaseError(currentProfileResult.error);
    currentProfile = currentProfileResult.data || null;
  }

  const lockerProvider = resolveProductLockerProvider(product, currentProfile);
  const diagnostics = phoneLockerDiagnostics({
    product,
    profile: currentProfile,
    lockerProvider
  });
  if (!diagnostics.configured) {
    const error = new Error(`Phone locker provider "${lockerProvider}" is not configured. Check that the provider base URL, credentials, and policy/app identifiers are set.`);
    error.statusCode = 500;
    throw error;
  }

  const importDeviceIds = inventoryPhoneDeviceIds(product);
  const resolvedRegisteredId = inventoryProductRegisteredId(product);
  const honorRegisteredIds = resolvedRegisteredId ? [resolvedRegisteredId] : [];
  const payload = buildPhoneLockerPayload({
    action,
    state: state || customerPaymentState(customer || product, payment?.balance ?? customer?.balance),
    product,
    customer,
    payment,
    reason,
    sourcePortal,
    metadata,
    lockerProvider,
    deviceUid
  });

  await upsertPhoneDeviceMappings({
    customer,
    product,
    registeredId: deviceUid,
    accountReference: accountReference || metadata.accountReference || customer?.provider_account_reference || customer?.customer_account || customer?.national_id || customer?.id || '',
    sourcePortal
  });

  const lockPolicy = buildLockPolicy({
    lockerProvider,
    product,
    customer,
    payment,
    metadata,
    deviceUid
  });
  const unlockPolicy = buildUnlockPolicy({
    lockerProvider,
    product,
    customer,
    payment,
    reason,
    metadata,
    content: 'Your device has been unlocked.',
    deviceUid
  });

  if (lockerProvider === 'trustonic') {
    const desiredState = normalizeStoredHonorLockStatus(
      state || (action === 'lock' ? 'locked' : action === 'unlock' ? 'unlocked' : ''),
      action
    ) || (action === 'unlock' ? 'unlocked' : action === 'lock' ? 'locked' : action === 'register' ? 'registered' : '');
    const storedDeviceState = normalizeStoredHonorLockStatus(
      currentProfile?.device_status ||
      currentProfile?.lock_status ||
      currentProfile?.locker_sync_payload?.lockStatus ||
      currentProfile?.locker_sync_payload?.status ||
      '',
      action
    );
    const storedCommandAction = normalizeHonorTaskValue(
      currentProfile?.last_command_action ||
      currentProfile?.locker_sync_payload?.lastAction ||
      currentProfile?.locker_sync_payload?.action ||
      ''
    );
    const expectedDeviceState = action === 'lock'
      ? 'locked'
      : action === 'unlock'
        ? 'unlocked'
        : desiredState;
    const providerDeviceIds = deviceUid ? [deviceUid] : resolvedRegisteredId ? [resolvedRegisteredId] : [];
    const providerDeviceInfos = [importDeviceIds.length > 0 ? importDeviceIds : providerDeviceIds];

    const verifyTrustonicDeviceState = async () => {
      if (!expectedDeviceState || action === 'register') return null;

      try {
        const response = await queryDevice({
          registeredId: deviceUid,
          deviceUid,
          product,
          action,
          timeoutMs: 15_000,
          lockerProvider
        });
        const actualState = extractHonorDeviceStateFromDevicesResult(response) || extractHonorTaskStatus(response, action);
        const verified = Boolean(
          actualState &&
          normalizeHonorDeviceState(actualState) === normalizeHonorDeviceState(expectedDeviceState)
        );
        console.info('[trustonic-device-verify]', {
          registeredId: deviceUid,
          expectedState: expectedDeviceState,
          actualState,
          verified,
          requestId: response?.requestId || null
        });

        return {
          verified,
          actualState,
          response
        };
      } catch (error) {
        console.warn('[trustonic-device-verify-failed]', {
          registeredId: deviceUid,
          expectedState: expectedDeviceState,
          error: error?.message || error
        });

        return {
          verified: false,
          actualState: '',
          response: null,
          error
        };
      }
    };

    const preflightVerification = await verifyTrustonicDeviceState();
    const preflightMatchesDesired = Boolean(preflightVerification?.verified);
    const commandDecision = resolveLockerCommandDecision({
      profile: currentProfile || {},
      action,
      desiredState: expectedDeviceState,
      currentState: preflightVerification?.actualState || '',
      useProfileState: false,
      forceCommand,
      forceUnlock
    });

    if (action !== 'register' && commandDecision.shouldSkip) {
      console.info('[phone-locker-action-skip]', {
        provider: lockerProvider,
        registeredId: deviceUid,
        action,
        expectedState: expectedDeviceState,
        currentState: commandDecision.currentState,
        finalDeviceState: commandDecision.currentState || preflightVerification.actualState || storedDeviceState || 'unknown',
        requestId: preflightVerification?.response?.requestId || null,
        taskId: preflightVerification?.response?.taskId || null,
        providerRequestUrl: preflightVerification?.response?.url || null,
        storedDeviceState,
        storedCommandAction,
        commandStatus: commandDecision.commandStatus,
        commandAt: commandDecision.commandAt || null,
        commandAgeMs: commandDecision.commandAgeMs,
        commandCooldownMs: commandDecision.commandCooldownMs,
        lastCommandAt: commandDecision.commandAt || null,
        lastVerifiedAt: commandDecision.lastVerifiedAt || null,
        confirmedCommand: commandDecision.confirmedCommand,
        recentCommand: commandDecision.recentCommand,
        forceUnlock: commandDecision.forceUnlock,
        reason: commandDecision.skipReason
      });

      const syncRecord = await updatePhoneLockerSyncRecord(product, {
        action,
        payload: {
          ...payload,
          lockerProvider,
          skipped: true,
          reason: commandDecision.skipReason,
          skipReason: commandDecision.skipReason,
          lastAction: storedCommandAction || action,
          deviceStatus: commandDecision.currentState || preflightVerification.actualState || storedDeviceState,
          lastKnownHonorStatus: commandDecision.currentState || preflightVerification.actualState || storedDeviceState,
          providerRequestUrl: preflightVerification.response?.url || null,
          confirmedCommand: commandDecision.confirmedCommand
        },
        response: {
          provider: lockerProvider,
          verified: true,
          actualState: preflightVerification.actualState,
          skipped: true,
          skipReason: commandDecision.skipReason,
          providerRequestUrl: preflightVerification.response?.url || null,
          confirmedCommand: commandDecision.confirmedCommand,
          raw: preflightVerification.response?.body || preflightVerification.response || null
        },
        status: 'synced',
        sourcePortal,
        recordLockRequestAt: false
      });

      return {
        configured: true,
        success: true,
        skipped: true,
        action,
        status: 'synced',
        honorLockStatus: preflightVerification.actualState || storedDeviceState || expectedDeviceState,
        requestId: currentProfile?.honor_task_id || preflightVerification.response?.requestId || null,
        honorTaskId: currentProfile?.honor_task_id || preflightVerification.response?.requestId || null,
        providerRequestUrl: preflightVerification.response?.url || null,
        deviceVerification: {
          verified: true,
          actualState: preflightVerification.actualState,
          skipped: true
        },
        commandSent: false,
        skipReason: commandDecision.skipReason,
        confirmedCommand: commandDecision.confirmedCommand,
        payload,
        lockerProvider,
        ...syncRecord
      };
    }

    let result;
    try {
      if (action === 'register') {
        const importResult = await importDevice({
          registeredIds: providerDeviceIds,
          deviceInfos: providerDeviceInfos,
          product,
          customer,
          payment,
          metadata,
          timeoutMs: 15_000,
          lockerProvider
        });

        result = {
          configured: true,
          success: true,
          action,
          status: 'synced',
          honorLockStatus: 'registered',
          requestId: importResult.requestId,
          honorTaskId: importResult.taskId || importResult.requestId,
          providerRequestUrl: importResult.url || null,
          importResult: importResult.body,
          taskResult: importResult.body,
          commandSent: true,
          payload
        };
      } else if (action === 'lock') {
        const lockResult = await deliverLock({
          registeredIds: providerDeviceIds,
          deviceInfos: providerDeviceInfos,
          lockPolicy,
          product,
          customer,
          payment,
          metadata,
          timeoutMs: 15_000,
          lockerProvider
        });
        const statusResult = await queryTask({
          registeredId: deviceUid,
          deviceUid,
          product,
          action,
          timeoutMs: 15_000,
          lockerProvider
        }).catch(() => null);
        const resolvedState = extractHonorDeviceStateFromDevicesResult(statusResult || {}) || extractHonorTaskStatus(statusResult || lockResult, action) || 'locked';

        result = {
          configured: true,
          success: true,
          action,
          status: 'synced',
          honorLockStatus: resolvedState,
          requestId: lockResult.requestId,
          honorTaskId: lockResult.taskId || lockResult.requestId,
          providerRequestUrl: lockResult.url || null,
          lockResult: lockResult.body,
          taskResult: statusResult?.body || statusResult?.rows || lockResult.body || null,
          commandSent: true,
          payload
        };
      } else if (action === 'unlock') {
        const unlockResult = await unlockDevice({
          registeredIds: providerDeviceIds,
          deviceInfos: providerDeviceInfos,
          unlockPolicy,
          product,
          customer,
          payment,
          metadata,
          timeoutMs: 15_000,
          lockerProvider
        });
        const resolvedState = extractHonorDeviceStateFromDevicesResult(unlockResult || {}) || extractHonorTaskStatus(unlockResult || {}, action) || 'unlocked';

        result = {
          configured: true,
          success: true,
          action,
          status: 'synced',
          honorLockStatus: resolvedState,
          requestId: unlockResult.requestId,
          honorTaskId: unlockResult.taskId || unlockResult.requestId,
          providerRequestUrl: unlockResult.url || null,
          unlockResult: unlockResult.body,
          taskResult: unlockResult.body || unlockResult.rows || null,
          commandSent: true,
          payload
        };
      } else {
        const taskResult = await queryTask({
          registeredId: deviceUid,
          deviceUid,
          product,
          timeoutMs: 15_000,
          lockerProvider
        });
        result = {
          configured: true,
          success: true,
          action,
          status: 'synced',
          honorLockStatus: extractHonorDeviceStateFromDevicesResult(taskResult) || extractHonorTaskStatus(taskResult, action) || 'synced',
          requestId: taskResult.requestId,
          honorTaskId: null,
          taskResult: taskResult.body,
          payload
        };
      }
    } catch (syncError) {
      await updatePhoneLockerSyncRecord(product, {
        action,
        payload: {
          ...payload,
          lockerProvider,
          honorTaskId: action === 'sync' ? null : syncError.requestId || null,
          honorLockStatus: 'failed'
        },
        response: syncError.response || null,
        error: syncError,
        status: 'failed',
        sourcePortal,
        recordLockRequestAt: action !== 'sync'
      }).catch(() => null);
      throw syncError;
    }

    const syncStatus = result.honorLockStatus === 'pending' ? 'pending' : 'synced';
    const syncRecord = await updatePhoneLockerSyncRecord(product, {
      action,
      payload: {
        ...payload,
        lockerProvider,
        honorTaskId: result.honorTaskId,
        honorLockStatus: result.honorLockStatus || result.status
      },
      response: {
        provider: lockerProvider,
        ...result
      },
      status: syncStatus,
      sourcePortal,
      recordLockRequestAt: action !== 'sync'
    });

    return {
      ...result,
      ...syncRecord,
      payload,
      lockerProvider
    };
  }

  const desiredState = normalizeStoredHonorLockStatus(
    state || (action === 'lock' ? 'locked' : action === 'unlock' ? 'unlocked' : ''),
    action
  ) || (action === 'unlock' ? 'unlocked' : action === 'lock' ? 'locked' : '');
  const storedDeviceState = normalizeStoredHonorLockStatus(
    currentProfile?.device_status ||
    currentProfile?.last_known_honor_status ||
    currentProfile?.honor_lock_status ||
    currentProfile?.lock_status ||
    currentProfile?.locker_sync_payload?.honorLockStatus ||
    currentProfile?.locker_sync_payload?.lockStatus ||
    '',
    action
  );
  const storedCommandAction = normalizeHonorTaskValue(
    currentProfile?.last_command_action ||
    currentProfile?.locker_sync_payload?.lastAction ||
    currentProfile?.locker_sync_payload?.action ||
    ''
  );
  const expectedDeviceState = action === 'lock'
    ? 'locked'
    : action === 'unlock'
      ? 'unlocked'
      : desiredState;
  const preflightVerification = action !== 'register'
    ? await verifyHonorDeviceState({
      registeredId: resolvedRegisteredId,
      expectedState: expectedDeviceState,
      action,
      product,
      timeoutMs: 15_000
    })
    : null;

  const preflightMatchesDesired = Boolean(
    preflightVerification?.verified &&
    expectedDeviceState &&
    normalizeHonorDeviceState(preflightVerification.actualState) === normalizeHonorDeviceState(expectedDeviceState)
  );
  const preflightStateKnown = Boolean(preflightVerification?.actualState);
  const canTrustStoredState = !preflightStateKnown || preflightVerification?.actualState === 'unknown';
  const storedStateMatchesDesired = canTrustStoredState && storedMatchesDesired;

  const commandDecision = resolveLockerCommandDecision({
    profile: currentProfile || {},
    action,
    desiredState: expectedDeviceState,
    currentState: preflightVerification?.actualState || '',
    useProfileState: false,
    forceCommand,
    forceUnlock
  });
  const syncDecision = resolveHonorSyncDecision({
    profile: currentProfile || {},
    action,
    desiredState
  });

  const honorCommandShouldSkip = commandDecision.shouldSkip || storedStateMatchesDesired;
  const honorCommandSkipReason = commandDecision.skipReason || (storedStateMatchesDesired ? 'stored-state-matched' : null);

  if (action !== 'register' && honorCommandShouldSkip) {
    console.info('[phone-locker-action-skip]', {
      registeredId: resolvedRegisteredId,
      action,
      expectedState: expectedDeviceState,
      currentState: commandDecision.currentState,
      finalDeviceState: commandDecision.currentState || preflightVerification.actualState || storedDeviceState || 'unknown',
      requestId: preflightVerification?.response?.requestId || null,
      taskId: preflightVerification?.response?.taskId || null,
      providerRequestUrl: preflightVerification?.response?.url || null,
      storedDeviceState,
      storedCommandAction,
      commandStatus: commandDecision.commandStatus,
      commandAt: commandDecision.commandAt || null,
      commandAgeMs: commandDecision.commandAgeMs,
      commandCooldownMs: commandDecision.commandCooldownMs,
      lastCommandAt: commandDecision.commandAt || null,
      lastVerifiedAt: commandDecision.lastVerifiedAt || null,
      confirmedCommand: commandDecision.confirmedCommand,
      recentCommand: commandDecision.recentCommand,
      storedStateMatchesDesired,
      forceUnlock: commandDecision.forceUnlock,
      reason: honorCommandSkipReason
    });

    const syncRecord = await updatePhoneLockerSyncRecord(product, {
      action,
      payload: {
        ...payload,
        lockerProvider,
        skipped: true,
        reason: honorCommandSkipReason,
        skipReason: honorCommandSkipReason,
        lastAction: storedCommandAction || action,
        deviceStatus: commandDecision.currentState || storedDeviceState,
        lastKnownHonorStatus: commandDecision.currentState || storedDeviceState,
        providerRequestUrl: preflightVerification?.response?.url || null,
        confirmedCommand: commandDecision.confirmedCommand,
        recentCommand: commandDecision.recentCommand,
        storedStateMatchesDesired,
        commandAgeMs: commandDecision.commandAgeMs,
        commandCooldownMs: commandDecision.commandCooldownMs
      },
      response: {
        verified: true,
        actualState: preflightVerification.actualState,
        skipped: true,
        skipReason: honorCommandSkipReason,
        providerRequestUrl: preflightVerification?.response?.url || null,
        confirmedCommand: commandDecision.confirmedCommand,
        recentCommand: commandDecision.recentCommand,
        storedStateMatchesDesired,
        commandAgeMs: commandDecision.commandAgeMs,
        commandCooldownMs: commandDecision.commandCooldownMs
      },
      status: 'synced',
      sourcePortal,
      recordLockRequestAt: false
    });

    return {
      configured: true,
      success: true,
      skipped: true,
      action,
      status: 'synced',
      honorLockStatus: preflightVerification.actualState || storedDeviceState,
      requestId: currentProfile?.honor_task_id || null,
      honorTaskId: currentProfile?.honor_task_id || null,
      providerRequestUrl: preflightVerification?.response?.url || null,
      deviceVerification: {
        verified: true,
        actualState: preflightVerification.actualState,
        skipped: true
      },
      commandSent: false,
      skipReason: honorCommandSkipReason,
      confirmedCommand: commandDecision.confirmedCommand,
      storedStateMatchesDesired,
      payload,
      lockerProvider,
      ...syncRecord
    };
  }

  if (action !== 'register' && (syncDecision.shouldSkip || syncDecision.shouldRefresh) && !preflightMatchesDesired) {
    console.warn('[honor-desync-error]', {
      registeredId: resolvedRegisteredId,
      expectedState: expectedDeviceState,
      actualState: preflightVerification?.actualState || '',
      action,
      shouldSkip: syncDecision.shouldSkip,
      shouldRefresh: syncDecision.shouldRefresh
    });
  }

  async function runHonorActionWithVerification({
    actionName,
    expectedState,
    taskAction = actionName,
    run,
    waitForTaskResolution = true,
    verifyAfterAction = true,
    retryOnVerificationFailure = true
  }) {
    let response;
    try {
      response = await run();
    } catch (actionError) {
      const currentStateCheck = await verifyHonorDeviceState({
        registeredId: resolvedRegisteredId,
        expectedState,
        action: actionName,
        product,
        timeoutMs: 15_000
      });

      if (isHonorAlreadyInDesiredStateError(actionError, expectedState) && (currentStateCheck.verified || storedStateMatchesDesired)) {
        console.info('[honor-action-noop]', {
          action: actionName,
          registeredId: resolvedRegisteredId,
          expectedState,
          actualState: currentStateCheck.actualState,
          storedStateMatchesDesired,
          requestId: actionError?.requestId || null,
          requestUrl: actionError?.url || null,
          responseStatus: actionError?.statusCode || null
        });

        return {
          response: actionError.response || null,
          taskResolution: {
            honorLockStatus: currentStateCheck.actualState || storedDeviceState || normalizeHonorDeviceState(expectedState) || 'synced',
            taskResult: actionError.response || null
          },
          verification: currentStateCheck,
          skipped: true
        };
      }

      throw actionError;
    }

    let taskResolution = waitForTaskResolution && taskAction && taskAction !== 'sync'
      ? await resolveHonorTaskStatus({
        action: taskAction,
        product,
        registeredId: resolvedRegisteredId,
        timeoutMs: 15_000
      })
      : { honorLockStatus: extractHonorTaskStatus(response, actionName) || normalizeHonorDeviceState(expectedState) || 'synced', taskResult: response };
    let verification = verifyAfterAction
      ? await verifyHonorDeviceState({
        registeredId: resolvedRegisteredId,
        expectedState,
        action: actionName,
        product,
        timeoutMs: 15_000
      })
      : {
          verified: true,
          actualState: normalizeHonorDeviceState(expectedState) || expectedState || '',
          response: null,
          skipped: true
        };
    const verificationState = normalizeHonorDeviceState(verification.actualState);

    if (verifyAfterAction && verificationState === 'pending') {
      console.info('[honor-action-pending]', {
        action: actionName,
        registeredId: resolvedRegisteredId,
        expectedState,
        actualState: verification.actualState,
        requestId: response?.requestId || null,
        requestUrl: response?.url || null,
        responseStatus: response?.status || null,
        taskId: response?.taskId || null,
        response: response?.body || response || null
      });

      return {
        response,
        taskResolution,
        verification: {
          ...verification,
          pending: true
        }
      };
    }

    if (verifyAfterAction && !verification.verified) {
      console.warn('[honor-desync-error]', {
        registeredId: resolvedRegisteredId,
        expectedState,
        actualState: verification.actualState || '',
        action: actionName,
        taskAction
      });

      if (retryOnVerificationFailure) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const retryTaskResolution = waitForTaskResolution && taskAction && taskAction !== 'sync'
          ? await resolveHonorTaskStatus({
            action: taskAction,
            product,
            registeredId: resolvedRegisteredId,
            timeoutMs: 15_000
          })
          : taskResolution;
        const retryVerification = await verifyHonorDeviceState({
          registeredId: resolvedRegisteredId,
          expectedState,
          action: actionName,
          product,
          timeoutMs: 15_000
        });
        const retryState = normalizeHonorDeviceState(retryVerification.actualState);

        if (retryState === 'pending') {
          console.info('[honor-action-pending]', {
            action: actionName,
            registeredId: resolvedRegisteredId,
            expectedState,
            actualState: retryVerification.actualState,
            requestId: response?.requestId || null,
            requestUrl: response?.url || null,
            responseStatus: response?.status || null,
            taskId: response?.taskId || null,
            response: response?.body || response || null
          });

          taskResolution = retryTaskResolution;
          verification = {
            ...retryVerification,
            pending: true
          };
        } else if (!retryVerification.verified) {
          const error = new Error(`DESYNC ERROR: Honor device ${resolvedRegisteredId} remained ${retryVerification.actualState || 'unknown'} after ${actionName} retry.`);
          error.statusCode = 502;
          error.response = {
            initial: response?.body || response || null,
            verification: retryVerification
          };
          throw error;
        } else {
          taskResolution = retryTaskResolution;
          verification = retryVerification;
        }
      } else {
        verification = {
          ...verification,
          skipped: true
        };
      }
    }

    console.info('[honor-action-complete]', {
      action: actionName,
      registeredId: resolvedRegisteredId,
      expectedState,
      actualState: verification.actualState,
      verified: verification.verified,
      requestId: response?.requestId || null,
      requestUrl: response?.url || null,
      responseStatus: response?.status || null,
      taskId: response?.taskId || null,
      response: response?.body || response || null
    });

    return {
      response,
      taskResolution,
      verification
    };
  }

  let result;
  try {
    if (action === 'register') {
      let importAlreadyExists = false;
      const actionResult = await runHonorActionWithVerification({
        actionName: 'register',
        expectedState: 'locked',
        taskAction: 'lock',
        run: async () => {
          let importResult;
          try {
            importResult = await importDevice({
              deviceInfos: [importDeviceIds.length > 0 ? importDeviceIds : honorRegisteredIds],
              product,
              customer,
              payment,
              metadata,
              timeoutMs: 15_000
            });
          } catch (importError) {
            if (!isHonorAlreadyExistsError(importError)) {
              throw importError;
            }

            importAlreadyExists = true;
            importResult = {
              success: true,
              requestId: importError.requestId || null,
              url: importError.url || null,
              status: importError.statusCode || 200,
              body: importError.response || null,
              rows: Array.isArray(importError.response?.data) ? importError.response.data : [],
              taskId: importError.requestId || resolvedRegisteredId,
              alreadyExists: true
            };
          }

          const lockResult = await deliverLock({
            registeredIds: honorRegisteredIds,
            lockPolicy,
            product,
            customer,
            payment,
            metadata,
            timeoutMs: 15_000
          });

          return {
            importResult,
            lockResult
          };
        }
      });

      result = {
        configured: true,
        success: true,
        action,
        status: 'synced',
        honorLockStatus: actionResult.verification.actualState || 'locked',
        requestId: actionResult.response.lockResult.requestId || actionResult.response.importResult.requestId,
        honorTaskId: actionResult.response.lockResult.taskId || actionResult.response.lockResult.requestId || actionResult.response.importResult.taskId || actionResult.response.importResult.requestId,
        providerRequestUrl: actionResult.response.lockResult.url || actionResult.response.importResult.url || null,
        importAlreadyExists,
        importResult: actionResult.response.importResult.body,
        lockResult: actionResult.response.lockResult.body,
        taskResult: actionResult.taskResolution.taskResult?.body || actionResult.taskResolution.taskResult?.rows || null,
        deviceVerification: actionResult.verification,
        commandSent: true,
        payload
      };
    } else if (action === 'lock') {
      const actionResult = await runHonorActionWithVerification({
        actionName: 'lock',
        expectedState: 'locked',
        taskAction: 'lock',
        run: async () => deliverLock({
          registeredIds: honorRegisteredIds,
          lockPolicy,
          product,
          customer,
          payment,
          metadata,
          timeoutMs: 15_000
        })
      });

      result = {
        configured: true,
        success: true,
        action,
        status: 'synced',
        honorLockStatus: actionResult.verification.actualState || 'locked',
        requestId: actionResult.response.requestId,
        honorTaskId: actionResult.response.taskId || actionResult.response.requestId,
        providerRequestUrl: actionResult.response.url || null,
        lockResult: actionResult.response.body,
        taskResult: actionResult.taskResolution.taskResult?.body || actionResult.taskResolution.taskResult?.rows || null,
        deviceVerification: actionResult.verification,
        commandSent: true,
        payload
      };
    } else if (action === 'unlock') {
      const actionResult = await runHonorActionWithVerification({
        actionName: 'unlock',
        expectedState: 'unlocked',
        taskAction: 'unlock',
        waitForTaskResolution: false,
        verifyAfterAction: false,
        retryOnVerificationFailure: false,
        run: async () => unlockDevice({
          registeredIds: honorRegisteredIds,
          unlockPolicy,
          product,
          customer,
          payment,
          metadata,
          timeoutMs: 15_000
        })
      });

      result = {
        configured: true,
        success: true,
        action,
        status: 'synced',
        honorLockStatus: 'unlocked',
        requestId: actionResult.response.requestId,
        honorTaskId: actionResult.response.taskId || actionResult.response.requestId,
        providerRequestUrl: actionResult.response.url || null,
        unlockResult: actionResult.response.body,
        taskResult: actionResult.taskResolution.taskResult?.body || actionResult.taskResolution.taskResult?.rows || actionResult.response.body || null,
        deviceVerification: actionResult.verification,
        commandSent: true,
        payload
      };
    } else {
      const taskResult = await queryTask({
        registeredId: resolvedRegisteredId,
        product,
        timeoutMs: 15_000
      });
        result = {
          configured: true,
          success: true,
          action,
          status: 'synced',
          honorLockStatus: extractHonorTaskStatus(taskResult, action) || 'synced',
          requestId: taskResult.requestId,
          honorTaskId: null,
          providerRequestUrl: taskResult.url || null,
          taskResult: taskResult.body,
          commandSent: false,
          payload
        };
    }
  } catch (syncError) {
    await updatePhoneLockerSyncRecord(product, {
      action,
      payload: {
        ...payload,
        lockerProvider,
        honorTaskId: action === 'sync' ? null : syncError.requestId || null,
        honorLockStatus: 'failed'
      },
      response: syncError.response || null,
      error: syncError,
      status: 'failed',
      sourcePortal,
      recordLockRequestAt: action !== 'sync'
    }).catch(() => null);
    throw syncError;
  }

  const syncStatus = result.honorLockStatus === 'pending' ? 'pending' : 'synced';

  const syncRecord = await updatePhoneLockerSyncRecord(product, {
    action,
    payload: {
      ...payload,
      lockerProvider,
      honorTaskId: result.honorTaskId,
      honorLockStatus: result.honorLockStatus || result.status
    },
    response: result,
    status: syncStatus,
    sourcePortal,
    recordLockRequestAt: action !== 'sync'
  });

  if (result.honorLockStatus === 'pending' || action === 'register') {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await refreshHonorTaskStatusForProduct(product, {
      action: action === 'register' ? 'lock' : action,
      timeoutMs: 15_000,
      sourcePortal
    });
  }

  return {
    ...result,
    ...syncRecord,
    payload,
    lockerProvider
  };
}

export async function syncPhoneLockerForCustomer(customer, options = {}) {
  const product = await findInventoryPhoneProductForCustomer(customer, {
    accountReference: options.accountReference || ''
  });
  if (!product) {
    return {
      configured: phoneLockerDiagnostics().configured,
      skipped: true,
      success: false,
      reason: 'phone_product_not_found'
    };
  }

  const lockerResult = await syncPhoneLockerForProduct(product, {
    customer,
    accountReference: options.accountReference || '',
    ...options
  });

  if (!options.notifyDevice || !lockerResult?.success) {
    return lockerResult;
  }

  if (lockerResult?.skipped) {
    return {
      ...lockerResult,
      lockerNotification: {
        delivered: false,
        skipped: true,
        reason: 'locker_action_skipped'
      }
    };
  }

  const registeredId = lockerResult.registeredId || inventoryProductRegisteredId(product) || '';
  if (!registeredId) {
    return {
      ...lockerResult,
      lockerNotification: {
        delivered: false,
        skipped: true,
        reason: 'missing_registered_id'
      }
    };
  }

  const lockerProvider = lockerResult.lockerProvider || product?.locker_provider || product?.lockerProvider || 'honor';
  const notificationTitle = options.notificationTitle || (
    lockerResult.action === 'unlock'
      ? 'Device unlocked'
      : lockerResult.action === 'lock'
        ? 'Payment reminder'
        : lockerResult.action === 'register'
          ? 'Device enrolled'
          : 'Device update'
  );
  const notificationContent = options.notificationContent || (
    lockerResult.action === 'unlock'
      ? 'Your financed device has been unlocked.'
      : lockerResult.action === 'lock'
        ? 'Your financed device is restricted until the outstanding payment is cleared.'
        : lockerResult.action === 'register'
          ? 'Your financed device has been enrolled with the locker provider.'
          : 'Your device status has been updated.'
  );

  try {
    const lockerNotification = await sendPhoneLockerNotification(registeredId, {
      notificationTitle,
      notificationContent,
      notificationType: options.notificationType || 'headsup'
    }, {
      product,
      lockerProvider
    });

    return {
      ...lockerResult,
      lockerNotification
    };
  } catch (error) {
    console.warn('[phone-locker-notification-failed]', {
      registeredId,
      lockerProvider,
      error: error?.message || error
    });

    return {
      ...lockerResult,
      lockerNotification: {
        delivered: false,
        error: error?.message || String(error)
      }
    };
  }
}

async function findAgentByNameOrCode(agentName, agentId) {
  const code = nonEmpty(agentId);
  const name = nonEmpty(agentName);

  if (code) {
    const byCode = await getSupabase()
      .from('agents')
      .select('id,agent_code,full_name,agent_name,phone')
      .or(`agent_code.eq.${code},id.eq.${code}`)
      .maybeSingle();

    if (byCode.error) throw mapSupabaseError(byCode.error);
    if (byCode.data) return byCode.data;
  }

  if (name) {
    const byName = await getSupabase()
      .from('agents')
      .select('id,agent_code,full_name,agent_name,phone')
      .or(`full_name.ilike.%${name}%,agent_name.ilike.%${name}%`)
      .maybeSingle();

    if (byName.error) throw mapSupabaseError(byName.error);
    if (byName.data) return byName.data;
  }

  return null;
}

async function findCustomerForManualPayment(body = {}) {
  const customerId = nonEmpty(body.customerId || body.customer_id);
  if (customerId) {
    const direct = await getSupabase()
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .maybeSingle();

    if (direct.error) throw mapSupabaseError(direct.error);
    if (direct.data) return direct.data;
  }

  const phoneCandidates = buildPhoneCandidates(body.customerPhone || body.customer_phone || body.phone);
  for (const candidate of phoneCandidates) {
    const byPhone = await getSupabase()
      .from('customers')
      .select('*')
      .eq('customer_phone', candidate)
      .maybeSingle();

    if (byPhone.error) throw mapSupabaseError(byPhone.error);
    if (byPhone.data) return byPhone.data;
  }

  const serialCandidates = [
    body.serialNumber,
    body.serial_number,
    body.chassisNumber,
    body.chassis_number
  ]
    .map(nonEmpty)
    .filter(Boolean);

  for (const candidate of serialCandidates) {
    const bySerial = await getSupabase()
      .from('customers')
      .select('*')
      .or(`serial_number.eq.${candidate},chassis_number.eq.${candidate}`)
      .maybeSingle();

    if (bySerial.error) throw mapSupabaseError(bySerial.error);
    if (bySerial.data) return bySerial.data;
  }

  const product = await findInventoryProductByIdentifiers(serialCandidates);

  if (product?.assigned_customer_id) {
    const assignedCustomer = await getSupabase()
      .from('customers')
      .select('*')
      .eq('id', product.assigned_customer_id)
      .maybeSingle();

    if (assignedCustomer.error) throw mapSupabaseError(assignedCustomer.error);
    if (assignedCustomer.data) return assignedCustomer.data;
  }

  const name = nonEmpty(body.customerName || body.customer_name);
  if (name) {
    const byName = await getSupabase()
      .from('customers')
      .select('*')
      .ilike('customer_name', `%${name}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byName.error) throw mapSupabaseError(byName.error);
    if (byName.data) return byName.data;
  }

  return null;
}

export async function logPaymentEvent(action, details = {}) {
  const payload = {
    actor_user_id: null,
    actor_email: null,
    action,
    target_table: 'payments',
    target_id: details.paymentId || details.customerId || details.reference || action,
    details: safeJson(details) || {}
  };

  console.log('[payment-event]', action, payload.details);

  try {
    await getSupabase().from('admin_audit_logs').insert(payload);
  } catch (error) {
    console.error('[payment-event-log-failed]', action, error?.message || error);
  }
}

export async function logDeviceEvent(action, details = {}) {
  const payload = {
    actor_user_id: null,
    actor_email: null,
    action,
    target_table: 'devices',
    target_id: details.deviceId || details.productId || details.customerId || details.registeredId || action,
    details: safeJson(details) || {}
  };

  console.log('[device-event]', action, payload.details);

  try {
    await getSupabase().from('admin_audit_logs').insert(payload);
  } catch (error) {
    console.error('[device-event-log-failed]', action, error?.message || error);
  }
}

function buildPhoneCandidates(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const normalizedPhone = normalizePhone(phone);
  const rawPhone = nonEmpty(phone);
  return [...new Set([
    rawPhone,
    normalizedPhone,
    digits,
    digits.startsWith('254') ? `+${digits}` : '',
    digits.startsWith('254') ? `0${digits.slice(3)}` : '',
    digits.startsWith('0') ? `+254${digits.slice(1)}` : '',
    digits.startsWith('0') ? `254${digits.slice(1)}` : '',
    digits.length === 9 ? `+254${digits}` : '',
    digits.length === 9 ? `0${digits}` : '',
    digits.length === 9 ? `254${digits}` : ''
  ].filter(Boolean))];
}

async function findCustomerByPhone(phone) {
  const candidates = buildPhoneCandidates(phone);
  for (const candidate of candidates) {
    const result = await getSupabase()
      .from('customers')
      .select('id, customer_name, customer_phone, national_id')
      .eq('customer_phone', candidate)
      .maybeSingle();

    if (result.error) throw mapSupabaseError(result.error);
    if (result.data) return result.data;
  }

  return null;
}

async function queuePaymentNotifications({
  customer,
  customerId,
  paymentId,
  amount,
  balance,
  repaymentPct,
  receipt,
  payerPhone,
  sourcePortal,
  accountReference,
  paidAt,
  financeType,
  financeTitle,
  financeMessage,
  financeIssue,
  financeFollowUp,
  financeSourcePortal
}) {
  const customerPhone = normalizeKenyanPhone(customer?.customer_phone) || normalizePhone(customer?.customer_phone);
  const rawPayerPhone = nonEmpty(payerPhone);
  const normalizedPayerPhone = normalizeKenyanPhone(rawPayerPhone);
  const reference = nonEmpty(accountReference) || paymentAccountReference(customer) || customerId;
  const payerDifferent = Boolean(normalizedPayerPhone) && normalizedPayerPhone !== customerPhone;
  const amountText = formatKes(amount);
  const balanceText = formatKes(balance);
  const progressText = `${Math.round(Number(repaymentPct || 0))}%`;
  const payerNote = payerDifferent ? ` from ${normalizedPayerPhone}` : '';
  const payeeMessage = `Payment of KES ${amountText} was confirmed on account ${reference}${payerNote}. Ref: ${receipt || 'pending'}. New balance: KES ${balanceText}. Progress: ${progressText} paid.`;

  const tasks = [
    sendPaymentConfirmedSms({
      customer,
      paymentId,
      amount,
      receipt,
      balance,
      repaymentPct,
      accountReference: reference,
      payerPhone: normalizedPayerPhone || rawPayerPhone
    }),
    getSupabase()
      .from('customer_notifications')
      .insert({
        customer_id: customerId,
        title: 'Payment confirmed',
        message: payeeMessage,
        type: 'payment',
        status: 'unread'
      }),
    getSupabase()
      .from('finance_notifications')
      .insert({
        type: financeType || 'payment_confirmed',
        title: financeMessage?.title || financeTitle || 'Payment confirmed',
        message: financeMessage?.message || `${customer?.customer_name || 'Customer'} paid KES ${amountText}.`,
        issue: financeIssue || 'Provider callback was received and matched to a customer.',
        follow_up: financeFollowUp || 'Review reconciliation only if the amount or account looks unusual.',
        customer_id: customerId,
        customer_name: customer?.customer_name || '',
        customer_phone: customer?.customer_phone || normalizedPayerPhone || '',
        agent_name: customer?.agent_name || null,
        agent_code: customer?.agent_id || null,
        amount,
        balance,
        overdue_days: Number(customer?.overdue_days || 0),
        source_portal: financeSourcePortal || sourcePortal || 'backend',
        severity: 'success',
        status: 'unread'
      }),
    getSupabase()
      .from('reconciliation')
      .insert({
        payment_id: paymentId || null,
        receipt: receipt || null,
        customer_name: customer?.customer_name || 'Customer',
        national_id: customer?.national_id || null,
        provider_amount: amount,
        system_amount: amount,
        date: String(paidAt || new Date().toISOString()).slice(0, 10),
        status: 'matched',
        source_portal: sourcePortal || 'backend'
      })
  ];

  if (rawPayerPhone && !normalizedPayerPhone) {
    logWarn('payer_notice_skipped_invalid_msisdn', {
      customerId,
      paymentId: paymentId || null,
      receipt: receipt || null,
      providerPayerPhoneRaw: rawPayerPhone,
      accountReference: reference
    });
  }

  if (payerDifferent) {
    let payerCustomer = null;
    try {
      payerCustomer = await findCustomerByPhone(normalizedPayerPhone);
    } catch {
      payerCustomer = null;
    }

    const payerMessage = `You paid KES ${amountText} for ${customer?.customer_name || 'a customer'} account ${reference}. Ref: ${receipt || 'pending'}. New balance: KES ${balanceText}.`;

    if (payerCustomer && payerCustomer.id !== customerId) {
      tasks.push(
        getSupabase()
          .from('customer_notifications')
          .insert({
            customer_id: payerCustomer.id,
            title: 'Payment sent',
            message: payerMessage,
            type: 'payment',
            status: 'unread'
          })
      );
    } else if (hasAfricasTalkingSmsConfig()) {
      tasks.push(sendSms({
        to: normalizedPayerPhone,
        purpose: 'payer_notice',
        message: payerMessage,
        customerId,
        eventId: `payer_notice:${receipt || paymentId}`
      }));
    }
  }

  const notificationResults = await Promise.allSettled(tasks);
  notificationResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      logWarn('payment.notification_task_failed', {
        customerId,
        paymentId,
        receipt: receipt || null,
        taskIndex: index,
        error: result.reason?.message || String(result.reason || 'Unknown notification failure')
      });
    }
  });
}

async function syncPaymentFinancialSnapshot(paymentId, { balance, totalPayable } = {}) {
  const id = nonEmpty(paymentId);
  if (!id) return;

  const result = await getSupabase()
    .from('payments')
    .update({
      balance: Number(balance || 0),
      total_payable: Number(totalPayable || 0),
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (result.error) {
    logWarn('payment.financial_snapshot_sync_failed', {
      paymentId: id,
      balance,
      totalPayable,
      error: result.error
    });
  }
}

export function hashOtp(identifier, otp) {
  const pepper = process.env.OTP_PEPPER;
  if (!pepper || pepper === 'SALAMA LOCK-paygo') {
    const error = new Error('OTP_PEPPER must be configured with a private random value.');
    error.statusCode = 500;
    throw error;
  }

  return crypto
    .createHash('sha256')
    .update(`${normalizeEmail(identifier)}:${otp}:${pepper}`)
    .digest('hex');
}

function hashResetToken(identifier, resetToken) {
  const pepper = process.env.OTP_PEPPER;
  if (!pepper || pepper === 'SALAMA LOCK-paygo') {
    const error = new Error('OTP_PEPPER must be configured with a private random value.');
    error.statusCode = 500;
    throw error;
  }

  return crypto
    .createHash('sha256')
    .update(`${normalizeEmail(identifier)}:${resetToken}:${pepper}`)
    .digest('hex');
}

function createResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hasOtpPepper() {
  return Boolean(process.env.OTP_PEPPER && process.env.OTP_PEPPER !== 'SALAMA LOCK-paygo');
}

export function createOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

async function sendPasswordResetSms({ phone, otp, senderMode = 'configured', requestId = '', sourcePortal = 'finance' } = {}) {
  if (!phone) {
    return {
      configured: false,
      delivered: false,
      sent: false,
      providerAccepted: false,
      gatewayAccepted: false,
      provider: 'africastalking',
      reason: 'missing_phone'
    };
  }

  return sendOtpSms({ phone, otp, senderMode, requestId, sourcePortal });
}

function normalizePasswordResetSmsErrorMessage(message) {
  const rawMessage = String(message || '').trim();
  const normalizedMessage = rawMessage.toLowerCase().replace(/\s+/g, '');

  if (normalizedMessage.includes('invalidphonenumber') || normalizedMessage.includes('invalidphone')) {
    return 'The phone number linked to this account is invalid. Update the account phone number and try again.';
  }

  if (normalizedMessage.includes('userinblacklist') || normalizedMessage.includes('blacklist') || normalizedMessage.includes('optedout') || normalizedMessage.includes('unsubscribed')) {
    return 'The phone number linked to this account is blacklisted or opted out from Africa\'s Talking SMS. Ask the user to opt back in or update the account phone number.';
  }

  return normalizeSmsProviderErrorMessage(rawMessage || 'OTP delivery failed.');
}

function rateLimitError(message, retryAfterSeconds) {
  const error = new Error(message);
  error.statusCode = 429;
  error.retryAfterSeconds = Math.max(1, Math.ceil(Number(retryAfterSeconds || 1)));
  error.retryAfterMs = error.retryAfterSeconds * 1000;
  error.resendAvailableAt = new Date(Date.now() + error.retryAfterMs).toISOString();
  return error;
}

async function assertPasswordResetOtpRateLimit({ phone, requestedEmail, userId, sourcePortal } = {}) {
  const normalizedPhone = normalizePhoneForStorage(phone);
  if (!normalizedPhone) return;

  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const cooldownMs = 60 * 1000;
  const windowStart = new Date(now - windowMs).toISOString();
  const { data, error } = await getSupabase()
    .from('password_reset_requests')
    .select('id,created_at,status')
    .eq('phone', normalizedPhone)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw mapSupabaseError(error);

  const recent = data || [];
  const lastCreatedAt = recent[0]?.created_at ? new Date(recent[0].created_at).getTime() : 0;
  if (lastCreatedAt && now - lastCreatedAt < cooldownMs) {
    const retryAfterSeconds = Math.ceil((cooldownMs - (now - lastCreatedAt)) / 1000);
    logWarn('password_reset.otp_rate_limited', {
      requestedEmail,
      userId: userId || null,
      sourcePortal,
      registeredPhone: maskPhone(normalizedPhone),
      reason: 'resend_cooldown',
      retryAfterSeconds
    });
    throw rateLimitError(`Please wait ${retryAfterSeconds} seconds before requesting another OTP.`, retryAfterSeconds);
  }

  if (recent.length >= 3) {
    const oldestCreatedAt = new Date(recent[recent.length - 1].created_at).getTime();
    const retryAfterSeconds = Math.ceil(((oldestCreatedAt + windowMs) - now) / 1000);
    logWarn('password_reset.otp_rate_limited', {
      requestedEmail,
      userId: userId || null,
      sourcePortal,
      registeredPhone: maskPhone(normalizedPhone),
      reason: 'phone_window_limit',
      retryAfterSeconds
    });
    throw rateLimitError(`Too many OTP requests for this phone number. Try again in ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} minute(s).`, retryAfterSeconds);
  }
}

function mapOtpDeliveryError(error, provider = 'africastalking') {
  const providerMessage = error?.providerResponse?.SMSMessageData?.Recipients?.[0]?.status
    || error?.providerResponse?.message
    || error?.providerResponse?.errorMessage
    || error?.message;

  return {
    configured: true,
    delivered: false,
    provider,
    error: normalizePasswordResetSmsErrorMessage(providerMessage),
    providerCode: error.providerCode || null,
    response: error.providerResponse || null
  };
}

function isLikelyEmail(value) {
  const email = normalizeEmail(value);
  return Boolean(email) && email.includes('@') && !/\s/.test(email);
}

function buildPasswordResetLookup(identifier) {
  const requested = String(identifier || '').trim();
  const normalized = normalizeEmail(requested);
  return {
    requested,
    normalized,
    isEmail: isLikelyEmail(normalized)
  };
}

function authUserMatchesLookup(user = {}, lookup = {}) {
  if (!lookup.isEmail) return false;
  return normalizeEmail(user.email) === lookup.normalized;
}

function lowerText(value) {
  return String(value || '').trim().toLowerCase();
}

async function findAuthUserByIdentifier(identifier) {
  const lookup = buildPasswordResetLookup(identifier);
  if (!lookup.requested || !lookup.isEmail) return null;

  let page = 1;
  while (page <= 10) {
    const { data, error } = await getSupabase().auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw mapSupabaseError(error);

    const user = (data.users || []).find((item) => authUserMatchesLookup(item, lookup));
    if (user) {
      logInfo('password_reset.user_lookup_complete', {
        requestedEmail: lookup.requested,
        normalizedEmail: lookup.normalized,
        found: true,
        userId: user.id || null
      });
      return user;
    }

    if (data.users.length < 100) {
      break;
    }
    page += 1;
  }

  logWarn('password_reset.user_lookup_complete', {
    requestedEmail: lookup.requested,
    normalizedEmail: lookup.normalized,
    found: false
  });
  return null;
}

async function sendPasswordResetOtp(body, email) {
  if (!hasOtpPepper()) {
    const error = new Error('OTP_PEPPER is not configured. Set OTP_PEPPER to a private random value before sending reset OTPs.');
    error.statusCode = 500;
    error.provider = 'local_otp';
    throw error;
  }

  const otp = createOtp();
  logInfo('password_reset.otp_generated', {
    requestedEmail: email,
    registeredPhone: maskPhone(body.phone || ''),
    otpGenerated: true,
    otpLength: otp.length,
    smsConfigured: hasAfricasTalkingSmsConfig()
  });
  logInfo('otp_generated', {
    requestedEmail: email,
    registeredPhone: maskPhone(body.phone || ''),
    otpGenerated: true,
    otpLength: otp.length,
    smsProvider: 'africastalking'
  });

  return {
    otp,
    otpHash: hashOtp(email, otp),
    phone: normalizePhoneForStorage(body.phone || '')
  };
}

async function confirmPasswordResetOtp(request, identifier, otp) {
  if (!request || new Date(request.otp_expires_at).getTime() < Date.now()) {
    return { verified: false };
  }

  const normalizedIdentifier = normalizeEmail(identifier);
  const storedEmail = normalizeEmail(request.email || normalizedIdentifier);

  return {
    verified: Boolean(
      request.otp_hash &&
      (
        request.otp_hash === hashOtp(normalizedIdentifier, otp) ||
        request.otp_hash === hashOtp(storedEmail, otp)
      )
    ),
    provider: request.provider_response?.sms?.provider || request.provider_response?.email?.provider || 'local_otp'
  };
}

async function findAuthUserByEmail(email) {
  const normalized = normalizeEmail(email);
  let page = 1;

  logInfo('password_reset.user_lookup_start', {
    email: normalized
  });

  while (page <= 10) {
    const { data, error } = await getSupabase().auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw mapSupabaseError(error);
    const user = data.users.find((item) => normalizeEmail(item.email) === normalized);
    if (user) {
      logInfo('password_reset.user_lookup_complete', {
        email: normalized,
        found: true,
        userId: user.id || null
      });
      return user;
    }
    if (data.users.length < 100) {
      logWarn('password_reset.user_lookup_complete', {
        email: normalized,
        found: false
      });
      return null;
    }
    page += 1;
  }

  logWarn('password_reset.user_lookup_complete', {
    email: normalized,
    found: false,
    reason: 'max_pages_reached'
  });
  return null;
}

function resolveLinkedResetPhone(profile = {}, authUser = {}, role = '') {
  const portal = String(role || '').trim().toLowerCase();
  const phone = normalizePhone(
    portal === 'customer'
      ? profile.customer_phone || authUser?.user_metadata?.phone || authUser?.phone || ''
      : profile.phone || authUser?.user_metadata?.phone || authUser?.phone || ''
  );

  if (!phone) return '';
  if (portal === 'customer') {
    const customerPhoneVerified = Boolean(
      profile.customer_phone_verified_at ||
      profile.customer_activation_otp_verified_at ||
      String(profile.customer_activation_otp_status || '').toLowerCase() === 'verified' ||
      authUser?.phone_confirmed_at
    );
    if (!customerPhoneVerified) {
      logWarn('password_reset.customer_phone_unverified_fallback', {
        email: normalizeEmail(authUser?.email),
        registeredPhone: maskPhone(phone),
        hasProfilePhone: Boolean(normalizePhone(profile.customer_phone || '')),
        hasAuthPhone: Boolean(normalizePhone(authUser?.user_metadata?.phone || authUser?.phone || ''))
      });
    }
  }

  return phone;
}

async function syncAuthUserPhoneFromProfile(authUser = {}, phone = '', fullName = '') {
  const normalizedPhone = normalizePhone(phone);
  if (!authUser?.id || !normalizedPhone) return;

  const currentPhone = normalizePhone(authUser?.user_metadata?.phone || authUser?.phone || '');
  const currentName = normalizeText(authUser?.user_metadata?.full_name || '');
  const nextMetadata = {
    ...(authUser.user_metadata || {}),
    phone: normalizedPhone
  };

  if (fullName && !currentName) {
    nextMetadata.full_name = fullName;
  }

  if (currentPhone === normalizedPhone && (!fullName || currentName)) return;

  const updated = await getSupabase().auth.admin.updateUserById(authUser.id, {
    user_metadata: nextMetadata
  });

  if (updated.error) {
    logWarn('account_phone_link.sync_failed', {
      userId: authUser.id,
      email: normalizeEmail(authUser.email),
      registeredPhone: maskPhone(normalizedPhone),
      error: updated.error
    });
    return;
  }

  logInfo('account_phone_link.synced', {
    userId: authUser.id,
    email: normalizeEmail(authUser.email),
    registeredPhone: maskPhone(normalizedPhone)
  });
}

async function findAuthUserById(userId) {
  const id = String(userId || '').trim();
  if (!id) return null;

  const { data, error } = await getSupabase().auth.admin.getUserById(id);
  if (error) throw mapSupabaseError(error);
  return data?.user || null;
}

function resetProfilePhone(portalName, profile = {}) {
  return portalName === 'customer' ? profile.customer_phone : profile.phone;
}

function resetProfileName(portalName, profile = {}) {
  if (portalName === 'customer') return profile.customer_name || '';
  return profile.full_name || profile.agent_name || '';
}

function chooseResetProfile(portalName, rows = []) {
  const profiles = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (profiles.length <= 1) return profiles[0] || null;

  if (portalName === 'customer') {
    return profiles.find((row) => row.auth_user_id && (
      row.customer_phone_verified_at ||
      row.customer_activation_otp_verified_at ||
      String(row.customer_activation_otp_status || '').toLowerCase() === 'verified'
    )) || profiles.find((row) => row.auth_user_id) || profiles.find((row) => (
      row.customer_phone_verified_at ||
      row.customer_activation_otp_verified_at ||
      String(row.customer_activation_otp_status || '').toLowerCase() === 'verified'
    )) || profiles[0];
  }

  return profiles.find((row) => row.auth_user_id) || profiles[0];
}

async function findResetProfileByEmail(portalName, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const table = portalName === 'customer'
    ? 'customers'
    : portalName === 'agent'
      ? 'agents'
      : portalName === 'admin'
        ? 'admin_profiles'
        : '';
  if (!table) return null;

  const { data, error } = await getSupabase()
    .from(table)
    .select('*')
    .ilike('email', normalizedEmail)
    .order('updated_at', { ascending: false })
    .limit(10);

  if (error) throw mapSupabaseError(error);
  if (!data?.length) return null;

  if (data.length > 1) {
    logWarn('password_reset.profile_email_duplicate', {
      portal: portalName,
      normalizedEmail,
      matches: data.length
    });
  }

  return chooseResetProfile(portalName, data);
}

async function linkResetProfileToAuthUser(portalName, profile = {}, authUser = {}) {
  if (!profile?.id || !authUser?.id) return profile;
  if (profile.auth_user_id === authUser.id) return profile;
  if (profile.auth_user_id && profile.auth_user_id !== authUser.id) return profile;

  const table = portalName === 'customer'
    ? 'customers'
    : portalName === 'agent'
      ? 'agents'
      : portalName === 'admin'
        ? 'admin_profiles'
        : '';
  if (!table) return profile;

  const { data, error } = await getSupabase()
    .from(table)
    .update({ auth_user_id: authUser.id })
    .eq('id', profile.id)
    .select()
    .single();

  if (error) {
    logWarn('password_reset.profile_link_failed', {
      portal: portalName,
      profileId: profile.id,
      userId: authUser.id,
      normalizedEmail: normalizeEmail(authUser.email),
      error
    });
    return profile;
  }

  return data || profile;
}

async function resolvePasswordResetTargetFromProfile(identifier, sourcePortal = 'finance') {
  const lookup = buildPasswordResetLookup(identifier);
  if (!lookup.requested || !lookup.isEmail) return null;

  const preferredPortal = String(sourcePortal || '').trim().toLowerCase();
  const portalCandidates = [...new Set([
    preferredPortal === 'customer' || preferredPortal === 'agent' || preferredPortal === 'admin' ? preferredPortal : '',
    'customer',
    'agent',
    'admin'
  ].filter(Boolean))];

  for (const portalName of portalCandidates) {
    const profile = await findResetProfileByEmail(portalName, lookup.normalized).catch((error) => {
      logWarn('password_reset.profile_lookup_failed', {
        portal: portalName,
        requestedEmail: lookup.requested,
        normalizedEmail: lookup.normalized,
        error
      });
      return null;
    });
    if (!profile) continue;
    const authUser = profile.auth_user_id
      ? await findAuthUserById(profile.auth_user_id).catch((error) => {
        logWarn('password_reset.auth_user_id_lookup_failed', {
          portal: portalName,
          requestedEmail: lookup.requested,
          normalizedEmail: lookup.normalized,
          userId: profile.auth_user_id,
          error
        });
        return null;
      })
      : await findAuthUserByEmail(lookup.normalized).catch(() => null);
    if (!authUser || normalizeEmail(authUser.email) !== lookup.normalized) continue;

    const linkedProfile = await linkResetProfileToAuthUser(portalName, profile, authUser);
    await syncAuthUserPhoneFromProfile(authUser, resetProfilePhone(portalName, linkedProfile), resetProfileName(portalName, linkedProfile));

    return {
      user: authUser,
      profile: linkedProfile,
      registeredPhone: resolveLinkedResetPhone(linkedProfile, authUser, portalName),
      role: portalName,
      matchedBy: 'profile'
    };
  }

  return null;
}

async function findAdminProfileForAuthUser(user) {
  const supabase = getSupabase();
  const userEmail = normalizeEmail(user?.email);

  let byAuthUser = await supabase
    .from('admin_profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (byAuthUser.error) throw mapSupabaseError(byAuthUser.error);
  if (byAuthUser.data) {
    await syncAuthUserPhoneFromProfile(user, byAuthUser.data.phone, byAuthUser.data.full_name);
    return byAuthUser.data;
  }

  if (!userEmail) return null;

  const byEmail = await supabase
    .from('admin_profiles')
    .select('*')
    .ilike('email', userEmail)
    .maybeSingle();

  if (byEmail.error) throw mapSupabaseError(byEmail.error);
  if (!byEmail.data) return null;

  if (!byEmail.data.auth_user_id) {
    const linked = await supabase
      .from('admin_profiles')
      .update({ auth_user_id: user.id })
      .eq('id', byEmail.data.id)
      .select()
      .single();

    if (linked.error) throw mapSupabaseError(linked.error);
    await syncAuthUserPhoneFromProfile(user, linked.data.phone, linked.data.full_name);
    return linked.data;
  }

  await syncAuthUserPhoneFromProfile(user, byEmail.data.phone, byEmail.data.full_name);
  return byEmail.data;
}

async function resolvePasswordResetTarget(identifier, sourcePortal = 'finance') {
  const lookup = buildPasswordResetLookup(identifier);
  if (!lookup.requested || !lookup.isEmail) return null;

  const profileTarget = await resolvePasswordResetTargetFromProfile(lookup.normalized, sourcePortal);
  if (profileTarget?.user) return profileTarget;

  const authUser = await findAuthUserByEmail(lookup.normalized).catch(() => null);
  if (!authUser) return null;

  const role = String(authUser.app_metadata?.role || authUser.user_metadata?.role || '').trim().toLowerCase();
  const preferredPortal = String(sourcePortal || '').trim().toLowerCase();
  const portalCandidates = [...new Set([
    role,
    preferredPortal === 'customer' || preferredPortal === 'agent' || preferredPortal === 'admin' ? preferredPortal : '',
    'customer',
    'agent',
    'admin'
  ].filter(Boolean))];

  let profile = null;
  let resolvedRole = role || preferredPortal || 'finance';

  for (const portalName of portalCandidates) {
    if (portalName === 'customer') {
      profile = await findCustomerForAuthUser(authUser).catch(() => null);
    } else if (portalName === 'agent') {
      profile = await findAgentForAuthUser(authUser).catch(() => null);
    } else if (portalName === 'admin') {
      profile = await findAdminProfileForAuthUser(authUser).catch(() => null);
    } else {
      continue;
    }

    if (profile) {
      resolvedRole = portalName;
      break;
    }
  }

  return {
    user: authUser,
    profile,
    registeredPhone: resolveLinkedResetPhone(profile || {}, authUser, resolvedRole),
    role: resolvedRole,
    matchedBy: profile ? 'profile' : 'auth_user'
  };
}

function paymentAmount(payment) {
  const splitAmount = Number(payment.deposit_credit || payment.depositCredit || 0)
    + Number(payment.paygo_payment || payment.paygoPayment || 0);
  if (splitAmount > 0) return splitAmount;
  return Number(
    payment.paid_amount
    ?? payment.paidAmount
    ?? payment.amount
    ?? payment.total_amount
    ?? payment.totalAmount
    ?? 0
  );
}

function customerPaymentAmount(payment) {
  const splitAmount = Number(payment.deposit_credit || payment.depositCredit || 0)
    + Number(payment.paygo_payment || payment.paygoPayment || 0);
  if (splitAmount > 0) return splitAmount;
  return Number(
    payment.paid_amount
    ?? payment.paidAmount
    ?? payment.amount
    ?? payment.total_amount
    ?? payment.totalAmount
    ?? 0
  );
}

function resolveCustomerDailyInstallment(customer = {}, fallback = 0) {
  const value = Number(
    customer?.daily_installment ??
    customer?.dailyInstallment ??
    fallback ??
    0
  );

  return Number.isFinite(value) && value > 0 ? value : 0;
}

function isNextOfKinVerified(customer = {}) {
  return String(customer.next_of_kin_otp_status || '').toLowerCase() === 'verified';
}

export function calculatePaygoInstallmentDays(totalPayable, dailyInstallment) {
  const payable = Number(totalPayable || 0);
  const installment = Number(dailyInstallment || 0);

  if (!Number.isFinite(payable) || payable <= 0 || !Number.isFinite(installment) || installment <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(payable / installment));
}

export function calculatePaygoDueDate(totalPayable, dailyInstallment, baseDate = new Date()) {
  const days = calculatePaygoInstallmentDays(totalPayable, dailyInstallment);
  if (!days) return null;

  const source = baseDate instanceof Date ? new Date(baseDate.getTime()) : new Date(baseDate);
  if (Number.isNaN(source.getTime())) return null;

  source.setDate(source.getDate() + days);
  return source.toISOString().slice(0, 10);
}

function normalizeLimit(value, fallback = 500, max = 1000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.trunc(parsed), max);
}

function normalizeOffset(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
}

function applyRange(request, query = {}, fallbackLimit = 500) {
  const limit = normalizeLimit(query.limit, fallbackLimit);
  const offset = normalizeOffset(query.offset);
  return request.range(offset, offset + limit - 1);
}

async function readPagedRows(buildRequest, query = {}, fallbackLimit = 500) {
  const requestedLimit = normalizeLimit(query.limit, fallbackLimit, 5000);
  const initialOffset = normalizeOffset(query.offset);
  const pageSize = Math.min(1000, requestedLimit);
  const rows = [];

  while (rows.length < requestedLimit) {
    const remaining = requestedLimit - rows.length;
    const currentPageSize = Math.min(pageSize, remaining);
    const pageOffset = initialOffset + rows.length;
    const result = await buildRequest().range(pageOffset, pageOffset + currentPageSize - 1);

    if (result.error) return result;

    const page = result.data || [];
    rows.push(...page);
    if (page.length < currentPageSize) break;
  }

  return { data: rows, error: null };
}

function normalizeDashboardProductType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['phone', 'phones'].includes(normalized)) return 'phone';
  if (['bike', 'bikes'].includes(normalized)) return 'bike';
  if (['product', 'all', ''].includes(normalized)) return '';
  return normalized;
}

function scopeProductTypes(productType) {
  const normalized = normalizeDashboardProductType(productType);
  if (normalized === 'bike') return ['bike', 'product'];
  if (normalized === 'phone') return ['phone'];
  return [];
}

function recordMatchesScope(record, productType) {
  const scopeValues = scopeProductTypes(productType);
  if (scopeValues.length === 0) return true;
  const recordType = normalizeDashboardProductType(inferProductType(record));
  return scopeValues.includes(recordType) || (scopeValues.includes('bike') && recordType === '');
}

function inventorySourceForType(productType) {
  if (productType === 'phone') return 'inventory_phone_feed';
  if (productType === 'bike') return 'inventory_bike_feed';
  return 'inventory_products';
}

function inferProductType(record) {
  return inferCommissionProductType(record);
}

export function commissionMatchesProductScope(record = {}, productType = '') {
  const normalizedScope = normalizeDashboardProductType(productType);
  if (!normalizedScope) return true;
  return normalizeDashboardProductType(inferProductType(record)) === normalizedScope;
}

export function mergeDashboardCommissionRecords(existingCommissions = [], generatedCommissions = []) {
  const generatedById = new Map();
  const generatedByPaymentId = new Map();
  const usedGenerated = new Set();

  for (const commission of generatedCommissions || []) {
    const id = normalizeText(commission.id);
    const paymentId = normalizeText(commission.payment_id || commission.paymentId);
    if (id) generatedById.set(id, commission);
    if (paymentId) generatedByPaymentId.set(paymentId, commission);
  }

  const merged = (existingCommissions || []).map((commission) => {
    const id = normalizeText(commission.id);
    const paymentId = normalizeText(commission.payment_id || commission.paymentId);
    const generated = generatedById.get(id) || generatedByPaymentId.get(paymentId) || null;
    if (!generated) {
      return { ...commission, product_type: inferProductType(commission) };
    }

    usedGenerated.add(generated);
    const classified = {
      ...generated,
      ...commission,
      payment_id: commission.payment_id || commission.paymentId || generated.payment_id || generated.paymentId || null,
      product_type: commission.product_type || commission.productType || generated.product_type || generated.productType,
      product_model: commission.product_model || commission.productModel || generated.product_model || generated.productModel,
      serial_number: commission.serial_number || commission.serialNumber || generated.serial_number || generated.serialNumber,
      chassis_number: commission.chassis_number || commission.chassisNumber || generated.chassis_number || generated.chassisNumber
    };

    return { ...classified, product_type: inferProductType(classified) };
  });

  for (const commission of generatedCommissions || []) {
    if (!usedGenerated.has(commission)) merged.push(commission);
  }

  return merged;
}

export function summarizeUnpaidCommissionAmounts(commissions = []) {
  return (Array.isArray(commissions) ? commissions : []).reduce((summary, commission) => {
    if (String(commission.status || '').trim().toLowerCase() === 'paid') return summary;

    const amount = Number(commission.amount || 0);
    if (!Number.isFinite(amount)) return summary;

    summary.total += amount;
    if (commissionMatchesProductScope(commission, 'bike')) summary.bike += amount;
    if (commissionMatchesProductScope(commission, 'phone')) summary.phone += amount;
    return summary;
  }, { total: 0, bike: 0, phone: 0 });
}

function customerMapById(customers = []) {
  return new Map((customers || [])
    .map((customer) => [
      normalizeText(customer.id || customer.customer_id || customer.customerId),
      customer
    ])
    .filter(([id]) => Boolean(id)));
}

function resolveSaleProductType(payment = {}, customer = {}) {
  const paymentType = normalizeDashboardProductType(payment.product_type || payment.productType);
  const customerType = normalizeDashboardProductType(customer.product_type || customer.productType);
  if (paymentType) return paymentType;
  if (customerType) return customerType;
  return normalizeText(payment.product_type || payment.productType || customer.product_type || customer.productType) || 'product';
}

export function buildSaleCommissionsFromPayments(payments, customers = [], agentPhoneByCode = new Map()) {
  const customerById = customerMapById(customers);

  return firstSalePaymentRows(payments)
    .map((payment) => {
      const customer = customerById.get(normalizeText(payment.customer_id || payment.customerId)) || {};
      const resolvedPayment = mergeSalePaymentCustomerFallback(payment, customer);
      const agentPhone = agentPhoneByCode.get(normalizeText(resolvedPayment.agent_id).toLowerCase()) ||
        resolvedPayment.agent_phone ||
        resolvedPayment.agentPhone ||
        null;

      return buildSaleCommissionFromPayment(resolvedPayment, agentPhone);
    })
    .filter(Boolean);
}

function saleCommissionBase(payment = {}) {
  return commissionPaymentBase(payment);
}

function saleCommissionId(payment = {}) {
  return `COM-SALE-${payment.receipt || payment.id}`;
}

function saleCommissionDuplicateKey(record = {}) {
  const serial = normalizeText(record.serial_number).toLowerCase();
  const chassis = normalizeText(record.chassis_number).toLowerCase();
  if (!serial && !chassis) return '';

  return [
    normalizeText(record.agent_code || record.agent_id).toLowerCase(),
    normalizeText(record.customer_name).toLowerCase(),
    serial,
    chassis
  ].join('|');
}

function buildSaleCommissionFromPayment(payment = {}, agentPhone = null, sourcePortal = 'finance') {
  const commissionBase = saleCommissionBase(payment);
  if (!(commissionBase > 0)) return null;

  const agentCode = normalizeText(payment.agent_id || payment.agent_code);
  const agentName = normalizeText(payment.agent_name);
  if (!agentCode || !agentName) return null;

  const productType = inferProductType(payment);
  const rate = productType === 'phone' ? 0.03 : 0.04;

  return {
    id: saleCommissionId(payment),
    payment_id: payment.id,
    agent_name: agentName,
    agent_code: agentCode,
    agent_phone: agentPhone || payment.agent_phone || null,
    customer_name: payment.customer_name,
    product_type: productType,
    product_model: payment.product_model || payment.bike_model || 'Product',
    serial_number: payment.serial_number || payment.chassis_number,
    chassis_number: payment.chassis_number || null,
    type: 'sale_activation_commission',
    amount: Math.round(commissionBase * rate),
    status: 'earned',
    earned_at: payment.date || payment.created_at || new Date().toISOString(),
    source_portal: sourcePortal
  };
}

function mergeSalePaymentCustomerFallback(payment = {}, customer = {}) {
  return {
    ...payment,
    agent_id: normalizeText(payment.agent_id || payment.agent_code || payment.agentId || payment.agentCode) ||
      customer.agent_id ||
      customer.agentId ||
      '',
    agent_name: normalizeText(payment.agent_name || payment.agentName) ||
      customer.agent_name ||
      customer.agentName ||
      '',
    customer_name: normalizeText(payment.customer_name || payment.customerName) ||
      customer.customer_name ||
      customer.customerName ||
      'Customer',
    product_type: resolveSaleProductType(payment, customer),
    product_model: normalizeText(payment.product_model || payment.productModel || payment.bike_model || payment.bikeModel) ||
      customer.product_model ||
      customer.productModel ||
      customer.bike_model ||
      customer.bikeModel ||
      'Product',
    bike_model: normalizeText(payment.bike_model || payment.bikeModel) || customer.bike_model || customer.bikeModel || null,
    serial_number: normalizeText(payment.serial_number || payment.serialNumber) || customer.serial_number || customer.serialNumber || null,
    chassis_number: normalizeText(payment.chassis_number || payment.chassisNumber) || customer.chassis_number || customer.chassisNumber || null
  };
}

function mergePaymentRowsWithCustomerFallback(payments = [], customers = []) {
  const customerById = customerMapById(customers);
  return (payments || []).map((payment) => mergeSalePaymentCustomerFallback(
    payment,
    customerById.get(normalizeText(payment.customer_id || payment.customerId)) || {}
  ));
}

function firstSalePaymentRows(payments = []) {
  const sorted = [...(payments || [])]
    .filter((payment) => payment.customer_id && isCommissionablePayment(payment))
    .sort((left, right) => {
      const leftDate = new Date(left.date || left.created_at || 0).getTime() || 0;
      const rightDate = new Date(right.date || right.created_at || 0).getTime() || 0;
      if (leftDate !== rightDate) return leftDate - rightDate;
      return String(left.id || '').localeCompare(String(right.id || ''));
    });

  const firstByCustomer = new Map();
  for (const payment of sorted) {
    if (!firstByCustomer.has(payment.customer_id)) {
      firstByCustomer.set(payment.customer_id, payment);
    }
  }

  return [...firstByCustomer.values()];
}

function missingSaleCommissionsFromPayments(payments = [], existingCommissions = [], agentPhoneByCode = new Map(), customerById = new Map()) {
  const existingIds = new Set((existingCommissions || []).map((commission) => normalizeText(commission.id)).filter(Boolean));
  const existingPaymentIds = new Set((existingCommissions || []).map((commission) => normalizeText(commission.payment_id)).filter(Boolean));
  const existingKeys = new Set((existingCommissions || []).map(saleCommissionDuplicateKey).filter(Boolean));

  return firstSalePaymentRows(payments)
    .map((payment) => {
      const resolvedPayment = mergeSalePaymentCustomerFallback(
        payment,
        customerById.get(normalizeText(payment.customer_id)) || {}
      );

      return buildSaleCommissionFromPayment(
        resolvedPayment,
        agentPhoneByCode.get(normalizeText(resolvedPayment.agent_id).toLowerCase()) || null,
        'finance_backfill'
      );
    })
    .filter((commission) => {
      if (!commission) return false;
      if (existingIds.has(commission.id)) return false;
      if (existingPaymentIds.has(commission.payment_id)) return false;
      const duplicateKey = saleCommissionDuplicateKey(commission);
      return !duplicateKey || !existingKeys.has(duplicateKey);
    });
}

export async function ensureMissingSaleCommissions({ productType = '' } = {}) {
  const normalizedProductType = normalizeDashboardProductType(productType);
  const supabase = getSupabase();

  const [existingResult, paymentsResult, customersResult, agentsResult] = await Promise.all([
    readPagedRows(
      () => supabase.from('commissions').select('*').eq('type', 'sale_activation_commission').order('earned_at', { ascending: true }),
      { limit: 5000 }
    ),
    readPagedRows(
      () => supabase
        .from('payments')
        .select('id,receipt,customer_id,customer_name,agent_name,agent_id,bike_model,serial_number,chassis_number,product_type,product_model,deposit_credit,paygo_payment,paid_amount,date,created_at,status,payment_status,reconciliation_status,provider_reference,provider_transaction_id')
        .order('date', { ascending: true }),
      { limit: 5000 }
    ),
    readPagedRows(
      () => supabase
        .from('customers')
        .select('id,customer_name,agent_name,agent_id,bike_model,serial_number,chassis_number,product_type,product_model')
        .order('created_at', { ascending: true }),
      { limit: 5000 }
    ),
    readPagedRows(
      () => supabase.from('agents').select('agent_code,phone').order('agent_code', { ascending: true }),
      { limit: 5000 }
    )
  ]);

  if (existingResult.error) throw mapSupabaseError(existingResult.error);
  if (paymentsResult.error) throw mapSupabaseError(paymentsResult.error);
  if (customersResult.error) throw mapSupabaseError(customersResult.error);
  if (agentsResult.error) throw mapSupabaseError(agentsResult.error);

  const agentPhoneByCode = new Map((agentsResult.data || [])
    .map((agent) => [normalizeText(agent.agent_code).toLowerCase(), agent.phone || null])
    .filter(([code]) => Boolean(code)));
  const customerById = new Map((customersResult.data || [])
    .map((customer) => [normalizeText(customer.id), customer])
    .filter(([id]) => Boolean(id)));
  const firstPayments = firstSalePaymentRows(paymentsResult.data || [])
    .map((payment) => mergeSalePaymentCustomerFallback(
      payment,
      customerById.get(normalizeText(payment.customer_id)) || {}
    ))
    .filter((payment) => recordMatchesScope(payment, normalizedProductType));
  const scopedExisting = (existingResult.data || [])
    .filter((commission) => commissionMatchesProductScope(commission, normalizedProductType));
  const missing = missingSaleCommissionsFromPayments(
    paymentsResult.data || [],
    existingResult.data || [],
    agentPhoneByCode,
    customerById
  ).filter((commission) => commissionMatchesProductScope(commission, normalizedProductType));

  if (missing.length === 0) {
    return {
      inserted: [],
      insertedCount: 0,
      expectedCount: firstPayments.length,
      existingCount: scopedExisting.length
    };
  }

  const inserted = await getSupabase()
    .from('commissions')
    .upsert(missing, { onConflict: 'id' })
    .select();

  if (inserted.error) throw mapSupabaseError(inserted.error);

  return {
    inserted: inserted.data || [],
    insertedCount: (inserted.data || []).length,
    expectedCount: firstPayments.length,
    existingCount: scopedExisting.length
  };
}

export async function ensureSaleCommissionForPayment(payment) {
  if (!isCommissionablePayment(payment)) return null;

  let resolvedPayment = { ...payment };
  if (payment?.customer_id && (!payment.agent_id || !payment.agent_name || !payment.product_model)) {
    const customer = await getSupabase()
      .from('customers')
      .select('customer_name,agent_name,agent_id,bike_model,serial_number,chassis_number,product_type,product_model')
      .eq('id', payment.customer_id)
      .maybeSingle();

    if (!customer.error && customer.data) {
      resolvedPayment = mergeSalePaymentCustomerFallback(payment, customer.data);
    }
  }

  let agentPhone = resolvedPayment.agent_phone || null;
  if (!agentPhone && resolvedPayment.agent_id) {
    const agent = await getSupabase()
      .from('agents')
      .select('phone')
      .eq('agent_code', resolvedPayment.agent_id)
      .maybeSingle();

    if (!agent.error && agent.data?.phone) agentPhone = agent.data.phone;
  }

  const commission = buildSaleCommissionFromPayment(resolvedPayment, agentPhone);
  if (!commission) return null;

  const result = await getSupabase()
    .from('commissions')
    .upsert(commission, { onConflict: 'id' })
    .select()
    .single();

  if (result.error) throw mapSupabaseError(result.error);
  return result.data;
}

function groupPaymentsByCustomer(payments = []) {
  return (Array.isArray(payments) ? payments : []).reduce((groups, payment) => {
    const customerId = nonEmpty(payment?.customer_id || payment?.customerId);
    if (!customerId) return groups;
    if (!groups.has(customerId)) groups.set(customerId, []);
    groups.get(customerId).push(payment);
    return groups;
  }, new Map());
}

function customerArrearsSummary(customer = {}, paymentsByCustomer = new Map(), now = new Date()) {
  return computeCustomerArrears({
    customer,
    payments: paymentsByCustomer.get(customer.id) || [],
    now
  });
}

function buildDashboard(payments, customers, commissions, reconciliation) {
  const canonicalPayments = dedupeFinancialPayments(payments);
  const successfulPayments = canonicalPayments.filter(isSuccessfulFinancialPayment);
  const paymentsByCustomer = groupPaymentsByCustomer(successfulPayments);
  const now = new Date();
  const collectibleCustomers = customers.filter((customer) => {
    const status = String(customer.status || '').toLowerCase();
    const applicationStatus = String(customer.application_status || '').toLowerCase();
    return status !== 'rejected' && applicationStatus !== 'rejected';
  });
  const trendByDate = successfulPayments.reduce((days, payment) => {
    const date = String(payment.date || payment.created_at || '').slice(0, 10);
    if (!date) return days;
    days.set(date, (days.get(date) || 0) + financialPaymentAmount(payment));
    return days;
  }, new Map());

  const totalCollected = sumFinancialCustomerCollections(collectibleCustomers);
  const expectedAmount = collectibleCustomers.reduce((total, customer) => total + derivedCustomerExpectedAmount(customer), 0);
  const pendingPayments = collectibleCustomers.reduce((total, customer) => total + derivedCustomerBalance(customer), 0);
  const overdueAmount = collectibleCustomers.reduce((total, customer) => {
    const arrears = customerArrearsSummary(customer, paymentsByCustomer, now);
    return total + arrears.overdueAmount;
  }, 0);
  const unpaidCommissionAmounts = summarizeUnpaidCommissionAmounts(commissions);

  return {
    summary: {
      total_collected: totalCollected,
      expected_amount: expectedAmount,
      expected_collection: expectedAmount,
      pending_payments: pendingPayments,
      overdue_amount: overdueAmount,
      reconciliation_flags: reconciliation.filter((record) => String(record.status || '').toLowerCase() !== 'matched').length,
      unpaid_commissions: unpaidCommissionAmounts.total,
      bike_unpaid_commissions: unpaidCommissionAmounts.bike,
      phone_unpaid_commissions: unpaidCommissionAmounts.phone,
      active_accounts: collectibleCustomers.filter((customer) => String(customer.status || '').toLowerCase() !== 'paid').length,
      today_collections: successfulPayments
        .filter((payment) => String(payment.date || '').startsWith(todayDate()))
        .reduce((total, payment) => total + financialPaymentAmount(payment), 0),
      unpaid_payments: canonicalPayments.filter((payment) => String(payment.status || '').toLowerCase() === 'unpaid').length,
      pending_commissions: commissions.filter((commission) => String(commission.status || '').toLowerCase() === 'earned').length
    },
    trend: [...trendByDate.entries()]
      .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
      .map(([date, amount]) => ({ date, amount }))
  };
}

function financeReference(prefix = 'FIN') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function isAlreadySubmitted(status) {
  return ['processing', 'paid'].includes(String(status || '').toLowerCase());
}

async function queueCommissionPayout(commission, referencePrefix = 'FIN') {
  if (!commission?.id) {
    const error = new Error('Commission not found.');
    error.statusCode = 404;
    throw error;
  }

  if (commission.status === 'paid') {
    return { commission, payoutRequest: null };
  }

  if (isAlreadySubmitted(commission.status)) {
    return { commission, payoutRequest: null };
  }

  const requestedAt = new Date().toISOString();
  const approvalReference = financeReference(referencePrefix);
  if (!commission.agent_phone) {
    const error = new Error('Agent phone is required before payout can be sent.');
    error.statusCode = 400;
    throw error;
  }

  const payoutRecord = {
    commission_id: commission.id,
    agent_name: commission.agent_name,
    agent_code: commission.agent_code,
    agent_phone: commission.agent_phone,
    amount: Number(commission.amount || 0),
    status: 'queued',
    finance_approval_reference: approvalReference,
    requested_at: requestedAt
  };

  const payoutRequest = await getSupabase()
    .from('agent_payout_requests')
    .upsert(payoutRecord, { onConflict: 'commission_id' })
    .select()
    .single();

  if (payoutRequest.error) throw mapSupabaseError(payoutRequest.error);

  let payoutStatus = 'queued';
  let providerResponse = {};
  let backendReference = null;
  let providerReference = null;
  let payoutError = null;

  try {
    const payout = await initiateB2CPayout({
      amount: payoutRecord.amount,
      phone: payoutRecord.agent_phone,
      remarks: `Commission ${commission.id}`,
      occasion: approvalReference
    });
    payoutStatus = payout.status;
    providerResponse = payout.providerResponse || {};
    backendReference = payout.originatorConversationId || payout.conversationId || null;
    providerReference = payout.conversationId || payout.originatorConversationId || null;
  } catch (error) {
    payoutStatus = 'failed';
    providerResponse = error.providerResponse || {};
    payoutError = error.message;
  }

  const payoutUpdate = await getSupabase()
    .from('agent_payout_requests')
    .update({
      status: payoutStatus,
      backend_reference: backendReference,
      provider_reference: providerReference || backendReference,
      provider_response: providerResponse,
      processed_at: payoutStatus === 'failed' ? new Date().toISOString() : null
    })
    .eq('id', payoutRequest.data.id)
    .select()
    .single();

  if (payoutUpdate.error) throw mapSupabaseError(payoutUpdate.error);

  const updated = await getSupabase()
    .from('commissions')
    .update({
      status: payoutStatus === 'paid' ? 'paid' : payoutStatus === 'failed' ? 'failed' : 'processing',
      paid_at: payoutStatus === 'paid' ? new Date().toISOString() : null,
      finance_approved_at: requestedAt,
      finance_approval_reference: approvalReference,
      payout_status: payoutStatus,
      payout_requested_at: requestedAt,
      payout_completed_at: payoutStatus === 'paid' ? new Date().toISOString() : null,
      payout_reference: providerReference || backendReference || payoutRequest.data?.id || null,
      provider_response: providerResponse,
      payout_error: payoutError
    })
    .eq('id', commission.id)
    .select()
    .single();

  if (updated.error) throw mapSupabaseError(updated.error);
  if (payoutStatus === 'paid' && String(commission.status || commission.payout_status || '').toLowerCase() !== 'paid') {
    await sendCommissionPaidSms({ commission: updated.data }).catch(() => null);
  }
  return { commission: updated.data, payoutRequest: payoutUpdate.data };
}

export async function listPayments(query = {}) {
  const productType = normalizeDashboardProductType(query.productType || query.product_type || query.type);
  const buildRequest = () => {
    let request = getSupabase()
      .from('payments')
      .select('*')
      .order('date', { ascending: false });
    if (productType === 'phone') request = request.eq('product_type', 'phone');
    if (productType === 'bike') request = request.in('product_type', ['bike', 'product']);
    return request;
  };
  const { data, error } = await readPagedRows(buildRequest, query);

  if (error) throw mapSupabaseError(error);

  const payments = dedupeFinancialPayments(data || []);
  const paymentsByCustomer = groupPaymentsByCustomer(payments.filter(isSuccessfulFinancialPayment));
  const now = new Date();
  const customerIds = [...new Set(payments.map((payment) => nonEmpty(payment.customer_id)).filter(Boolean))];
  let customerById = new Map();

  if (customerIds.length > 0) {
    const customersResult = await getSupabase()
      .from('customers')
      .select('id,customer_name,customer_phone,daily_installment,overdue_days,balance,total_payable,paid_amount,due_date,last_payment_date,paygo_next_due_at,paygo_schedule_status,status,application_status')
      .in('id', customerIds);

    if (customersResult.error) throw mapSupabaseError(customersResult.error);

    customerById = new Map((customersResult.data || []).map((customer) => [customer.id, customer]));
  }

  return {
    payments: payments.map((payment) => {
      const customer = customerById.get(payment.customer_id) || null;
      const dailyInstallment = resolveCustomerDailyInstallment(customer, payment.daily_target ?? payment.dailyInstallment);
      const repaymentDueAt = customer ? resolveCustomerRepaymentDueAt(customer) : (payment.paygo_next_due_at || payment.due_date || '');
      const arrears = customer
        ? customerArrearsSummary(customer, paymentsByCustomer, now)
        : { overdueDays: Number(payment.overdue_days || 0), overdueAmount: Number(payment.overdue_amount || 0) };
      const overdueDays = arrears.overdueDays;

      return {
        ...payment,
        customer_name: payment.customer_name || customer?.customer_name || '',
        customer_phone: payment.customer_phone || customer?.customer_phone || '',
        daily_target: dailyInstallment,
        daily_installment: dailyInstallment,
        overdue_days: overdueDays,
        overdue_amount: arrears.overdueAmount,
        due_date: repaymentDueAt ? String(repaymentDueAt).slice(0, 10) : (payment.due_date || ''),
        paygo_next_due_at: repaymentDueAt || payment.paygo_next_due_at || '',
        last_payment_date: customer?.last_payment_date || payment.last_payment_date || '',
        paygo_state: customer?.paygo_schedule_status || customer?.status || payment.paygo_state || '',
        customer_status: customer?.status || '',
        balance: customer ? derivedCustomerBalance(customer) : Number(payment.balance || 0),
        total_payable: customer ? Number(customer.total_payable || 0) : Number(payment.total_payable || 0),
        paid_amount: financialPaymentAmount(payment),
        customer_paid_amount: customer ? Number(customer.paid_amount || 0) : null
      };
    })
  };
}

export async function failPaymentRequest(paymentRequestId, { reason, providerResponse = {} } = {}) {
  const result = await getSupabase()
    .from('payment_requests')
    .update({
      status: 'failed',
      failure_reason: reason || 'Payment failed.',
      provider_response: providerResponse,
      updated_at: new Date().toISOString()
    })
    .eq('id', paymentRequestId)
    .select()
    .single();

  if (result.error) throw mapSupabaseError(result.error);
  return result.data;
}

function isUniqueConstraintError(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '23505'
    || message.includes('duplicate key')
    || message.includes('unique constraint');
}

async function findExistingPaymentByProviderIdentity({ receipt, providerTransactionId, providerReference } = {}) {
  const filters = [
    receipt ? `receipt.eq.${receipt}` : '',
    providerTransactionId ? `provider_transaction_id.eq.${providerTransactionId}` : '',
    providerReference ? `provider_reference.eq.${providerReference}` : ''
  ].filter(Boolean);
  if (!filters.length) return null;

  const result = await getSupabase()
    .from('payments')
    .select('id,customer_id,receipt,provider_transaction_id,provider_reference')
    .or(filters.join(','))
    .limit(1)
    .maybeSingle();

  if (result.error) throw mapSupabaseError(result.error);
  return result.data || null;
}

export async function completePaymentRequest(paymentRequest, {
  amount,
  phone,
  receipt,
  providerReference,
  providerTransactionId,
  providerResponse = {},
  paidAt,
  method = 'mpesa_stk_push'
} = {}) {
  const customer = paymentRequest.customers || {};
  const transactionId = providerTransactionId || receipt || providerReference;
  const paymentReceipt = receipt || transactionId || paymentRequest.provider_reference || paymentRequest.id;
  const paidAmount = Number(amount || paymentRequest.amount || 0);

  if (!paidAmount || paidAmount <= 0) {
    const error = new Error('Payment callback amount is missing or invalid.');
    error.statusCode = 400;
    throw error;
  }

  const existingPayment = await findExistingPaymentByProviderIdentity({
    receipt: paymentReceipt,
    providerTransactionId: transactionId || paymentReceipt,
    providerReference: providerReference || paymentReceipt
  });

  if (existingPayment) {
    await getSupabase()
      .from('payment_requests')
      .update({
        status: 'completed',
        failure_reason: null,
        provider_response: providerResponse,
        updated_at: new Date().toISOString()
      })
      .eq('id', paymentRequest.id);
    return { duplicate: true, payment: existingPayment };
  }

  if (!isNextOfKinVerified(customer)) {
    const blocked = new Error('Payment cannot be completed until next-of-kin acceptance is verified.');
    blocked.statusCode = 409;
    await getSupabase()
      .from('payment_requests')
      .update({
        status: 'failed',
        failure_reason: blocked.message,
        provider_response: providerResponse,
        updated_at: new Date().toISOString()
      })
      .eq('id', paymentRequest.id);
    throw blocked;
  }

  const nextPaidAmount = Number(customer.paid_amount || 0) + paidAmount;
  const totalPayable = Number(customer.total_payable || 0);
  const nextBalance = Math.max(totalPayable - nextPaidAmount, 0);
  const repaymentPct = totalPayable > 0 ? Math.min(100, (nextPaidAmount / totalPayable) * 100) : 0;
  const isDeposit = await shouldRecordPaymentAsDeposit(customer, paymentRequest.customer_id);
  const paymentSplit = splitIncomingPaymentAmount(paidAmount, isDeposit);
  const completedAt = paidAt || new Date().toISOString();

  const updateRequest = await getSupabase()
    .from('payment_requests')
    .update({
      status: 'completed',
      failure_reason: null,
      provider_response: providerResponse,
      updated_at: new Date().toISOString()
    })
    .eq('id', paymentRequest.id);

  if (updateRequest.error) throw mapSupabaseError(updateRequest.error);

  const insertPayment = await getSupabase()
    .from('payments')
    .insert({
      customer_id: paymentRequest.customer_id,
      customer_name: customer.customer_name || 'Customer',
      customer_phone: customer.customer_phone || phone,
      product_type: customer.product_type || 'product',
      product_model: customer.product_model || customer.bike_model || null,
      agent_name: customer.agent_name || null,
      agent_id: customer.agent_id || null,
      bike_model: customer.bike_model || null,
      serial_number: customer.serial_number || null,
      chassis_number: customer.chassis_number || null,
      total_payable: totalPayable,
      paid_amount: paidAmount,
      balance: nextBalance,
      daily_target: resolveCustomerDailyInstallment(customer),
      daily_installment: resolveCustomerDailyInstallment(customer),
      deposit_credit: paymentSplit.depositCredit,
      paygo_payment: paymentSplit.paygoPayment,
      date: completedAt,
      receipt: paymentReceipt,
      provider_reference: providerReference || paymentRequest.provider_reference || paymentRequest.backend_reference || null,
      provider_transaction_id: transactionId || null,
      provider_account_reference: paymentAccountReference(customer) || paymentRequest.customer_id,
      provider_payer_phone: String(phone || ''),
      provider_paid_at: completedAt,
      due_date: customer.due_date || customer.paygo_next_due_at?.slice?.(0, 10) || null,
      method,
      status: 'paid',
      payment_status: 'paid',
      source_portal: paymentRequest.source_portal || 'customer'
    })
    .select()
    .single();

  if (insertPayment.error) {
    if (isUniqueConstraintError(insertPayment.error)) {
      const duplicatePayment = await findExistingPaymentByProviderIdentity({
        receipt: paymentReceipt,
        providerTransactionId: transactionId || paymentReceipt,
        providerReference: providerReference || paymentReceipt
      });
      if (duplicatePayment) return { duplicate: true, payment: duplicatePayment };
    }
    throw mapSupabaseError(insertPayment.error);
  }
  await ensureSaleCommissionForPayment(insertPayment.data).catch((error) => {
    console.warn('[payment-commission-sync-failed]', {
      paymentId: insertPayment.data.id,
      paymentRequestId: paymentRequest.id,
      error: error?.message || error
    });
  });

  let updatedCustomerRow = null;
  try {
    const updateCustomer = await getSupabase()
      .from('customers')
      .update({
        paid_amount: nextPaidAmount,
        balance: nextBalance,
        last_payment_date: completedAt.slice(0, 10),
        status: nextBalance <= 0 ? 'paid' : 'active',
        overdue_days: nextBalance <= 0 ? 0 : Number(customer.overdue_days || 0)
      })
      .eq('id', paymentRequest.customer_id);

    if (updateCustomer.error) throw mapSupabaseError(updateCustomer.error);
    updatedCustomerRow = updateCustomer.data || null;
  } catch (error) {
    console.warn('[payment-customer-update-failed]', {
      paymentId: insertPayment.data.id,
      customerId: paymentRequest.customer_id,
      error: error?.message || error
    });
  }

  const paymentCustomer = {
    ...(updatedCustomerRow || customer),
    paid_amount: nextPaidAmount,
    balance: nextBalance,
    last_payment_date: completedAt.slice(0, 10),
    status: nextBalance <= 0 ? 'paid' : 'active',
    overdue_days: nextBalance <= 0 ? 0 : Number(customer.overdue_days || 0),
    total_payable: totalPayable,
    daily_installment: Number(customer.daily_installment || 0)
  };
  let confirmedCustomer = paymentCustomer;

  try {
    const reconciliation = await reconcileCustomerPaygoAndLocker(paymentRequest.customer_id, {
      customer: paymentCustomer,
      payment: insertPayment.data,
      now: completedAt,
      sourcePortal: paymentRequest.source_portal || 'customer',
      reason: isDeposit ? 'Deposit payment received.' : 'Payment received.',
      accountReference: paymentRequest.provider_account_reference || paymentRequest.backend_reference || paymentRequest.customer_id
    });
    confirmedCustomer = reconciliation.customer || paymentCustomer;
  } catch (error) {
    console.warn('[payment-locker-sync-failed]', {
      paymentId: insertPayment.data.id,
      customerId: paymentRequest.customer_id,
      error: error?.message || error
    });
  }
  const confirmedPaidAmount = Number(confirmedCustomer.paid_amount ?? nextPaidAmount);
  const confirmedBalance = Number(confirmedCustomer.balance ?? nextBalance);
  const confirmedRepaymentPct = totalPayable > 0
    ? Math.min(100, (confirmedPaidAmount / totalPayable) * 100)
    : 0;
  await syncPaymentFinancialSnapshot(insertPayment.data.id, {
    balance: confirmedBalance,
    totalPayable
  });
  await queuePaymentNotifications({
    customer: confirmedCustomer,
    customerId: paymentRequest.customer_id,
    paymentId: insertPayment.data.id,
    amount: paidAmount,
    balance: confirmedBalance,
    repaymentPct: confirmedRepaymentPct,
    receipt: paymentReceipt,
    payerPhone: phone,
    sourcePortal: paymentRequest.source_portal || 'customer',
    accountReference: paymentAccountReference(customer) || paymentRequest.customer_id,
    paidAt: completedAt,
    financeType: 'payment_confirmed',
    financeTitle: 'Payment confirmed',
    financeMessage: {
      title: 'Payment confirmed',
      message: `${customer.customer_name || 'Customer'} paid KES ${formatKes(paidAmount)}.`
    },
    financeIssue: 'Provider callback was received and matched to a payment request.',
    financeFollowUp: 'Review reconciliation only if the amount or account looks unusual.',
    financeSourcePortal: paymentRequest.source_portal || 'customer'
  });

  return {
    duplicate: false,
    payment: insertPayment.data,
    customer: confirmedCustomer,
    paidAmount,
    nextBalance: confirmedBalance,
    repaymentPct: confirmedRepaymentPct
  };
}

export async function findCustomerForProviderPayment({ accountReference, phone }) {
  const reference = nonEmpty(accountReference);
  const normalizedReference = normalizeReferenceValue(accountReference);
  const normalizedPhone = normalizePhone(phone);
  const rawPhone = nonEmpty(phone);

  const referenceCandidates = [...new Set([
    reference,
    normalizedReference
  ].filter(Boolean))];
  const phoneCandidates = buildPhoneCandidates(phone);

  for (const candidate of referenceCandidates) {
    const referenceLookups = [];
    if (looksLikeUuid(candidate)) referenceLookups.push(['id', candidate]);
    referenceLookups.push(['national_id', candidate]);
    referenceLookups.push(['customer_phone', candidate]);

    for (const [column, value] of referenceLookups) {
      const result = await getSupabase()
        .from('customers')
        .select('*')
        .eq(column, value)
        .maybeSingle();
      if (result.error) throw mapSupabaseError(result.error);
      if (result.data) return result.data;
    }
  }

  for (const candidate of phoneCandidates) {
    const result = await getSupabase()
      .from('customers')
      .select('*')
      .eq('customer_phone', candidate)
      .maybeSingle();
    if (result.error) throw mapSupabaseError(result.error);
    if (result.data) return result.data;
  }

  const recentCustomers = await getSupabase()
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (recentCustomers.error) throw mapSupabaseError(recentCustomers.error);

  return (recentCustomers.data || []).find((customer) => {
    const customerReferenceCandidates = [
      customer.id,
      customer.national_id,
      customer.customer_phone
    ]
      .map((value) => nonEmpty(value))
      .filter(Boolean);
    const customerReferenceNormalizedCandidates = customerReferenceCandidates
      .map((value) => normalizeReferenceValue(value))
      .filter(Boolean);

    const customerAlternatePhones = String(customer.alternate_phones || '')
      .split(/[\n,]/)
      .map((value) => normalizePhone(value))
      .filter(Boolean);

    if (referenceCandidates.some((candidate) => {
      const normalizedCandidate = normalizeReferenceValue(candidate);
      return customerReferenceCandidates.includes(candidate)
        || customerReferenceCandidates.includes(normalizedCandidate)
        || customerReferenceNormalizedCandidates.includes(candidate)
        || customerReferenceNormalizedCandidates.includes(normalizedCandidate);
    })) {
      return true;
    }

    if (normalizedPhone && [customer.customer_phone, ...customerAlternatePhones].some((value) => normalizePhone(value) === normalizedPhone)) {
      return true;
    }

    if (rawPhone && [customer.customer_phone, ...customerAlternatePhones].some((value) => nonEmpty(value) === rawPhone)) {
      return true;
    }

    return false;
  }) || null;
}

export async function findCustomerForC2BPaybillReference(accountReference, phone) {
  const referenceCandidates = [
    nonEmpty(accountReference),
    normalizeReferenceValue(accountReference)
  ].filter(Boolean);
  const phoneCandidates = buildPhoneCandidates(phone);
  const directCustomerColumns = [
    'national_id',
    'id',
    'customer_account',
    'account_number',
    'accountNumber',
    'provider_account_reference',
    'payment_account_reference',
    'customer_phone',
    'phone'
  ];

  for (const reference of referenceCandidates) {
    try {
      for (const column of directCustomerColumns) {
        const result = await getSupabase()
          .from('customers')
          .select('*')
          .eq(column, reference)
          .maybeSingle();

        if (result.error) {
          console.warn(`[c2b-paybill-customer-${column}-lookup-failed]`, reference, result.error.message || result.error);
        } else if (result.data) {
          return result.data;
        }
      }

      const mappingResult = await getSupabase()
        .from('customer_device_mappings')
        .select('customer_id,customer_account')
        .eq('customer_account', reference)
        .maybeSingle();

      if (mappingResult.error) {
        console.warn('[c2b-paybill-customer-mapping-lookup-failed]', reference, mappingResult.error.message || mappingResult.error);
      } else if (mappingResult.data?.customer_id) {
        const mappedCustomer = await getSupabase()
          .from('customers')
          .select('*')
          .eq('id', mappingResult.data.customer_id)
          .maybeSingle();

        if (mappedCustomer.error) {
          console.warn('[c2b-paybill-customer-mapped-id-lookup-failed]', reference, mappedCustomer.error.message || mappedCustomer.error);
        } else if (mappedCustomer.data) {
          return mappedCustomer.data;
        }
      }
    } catch (error) {
      console.warn('[c2b-paybill-customer-lookup-exception]', reference, error?.message || error);
    }
  }

  for (const candidate of phoneCandidates) {
    try {
      const result = await getSupabase()
        .from('customers')
        .select('*')
        .eq('customer_phone', candidate)
        .maybeSingle();

      if (result.error) {
        console.warn('[c2b-paybill-customer-phone-lookup-failed]', candidate, result.error.message || result.error);
      } else if (result.data) {
        return result.data;
      }
    } catch (error) {
      console.warn('[c2b-paybill-customer-phone-lookup-exception]', candidate, error?.message || error);
    }
  }

  return null;
}

async function insertPaymentRecord(payload) {
  const insert = (record) => getSupabase()
    .from('payments')
    .insert(record)
    .select()
    .single();

  const result = await insert(payload);
  if (!result.error) return result;

  if (
    payload.provider_payer_phone_raw !== undefined &&
    String(result.error.message || '').toLowerCase().includes('provider_payer_phone_raw')
  ) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.provider_payer_phone_raw;
    logWarn('payments.optional_column_missing', {
      missingColumn: 'provider_payer_phone_raw',
      receipt: payload.receipt || null
    });
    return insert(fallbackPayload);
  }

  return result;
}

async function hasRecordedDepositPayment(customerId) {
  const id = nonEmpty(customerId);
  if (!id) return false;

  const result = await getSupabase()
    .from('payments')
    .select('id')
    .eq('customer_id', id)
    .gt('deposit_credit', 0)
    .in('status', ['paid', 'completed'])
    .limit(1);

  if (result.error) throw mapSupabaseError(result.error);
  return Boolean(result.data?.length);
}

async function shouldRecordPaymentAsDeposit(customer = {}, customerId = '') {
  const id = nonEmpty(customerId || customer?.id);
  if (!id) return false;

  const paidAmount = Number(customer?.paid_amount || 0);
  if (paidAmount > 0) return false;

  try {
    return !(await hasRecordedDepositPayment(id));
  } catch (error) {
    logWarn('payment.deposit_classification_check_failed', {
      customerId: id,
      customerName: customer?.customer_name || '',
      error
    });
    return paidAmount <= 0;
  }
}

function splitIncomingPaymentAmount(amount, isDeposit) {
  const paidAmount = Number(amount || 0);
  return {
    depositCredit: isDeposit ? paidAmount : 0,
    paygoPayment: isDeposit ? 0 : paidAmount
  };
}

export async function completeProviderC2BPayment({
  amount,
  phone,
  receipt,
  providerReference,
  providerTransactionId,
  providerResponse = {},
  paidAt,
  accountReference,
  method = 'mpesa_c2b'
} = {}) {
  const transactionId = providerTransactionId || receipt || providerReference;
  const paymentReceipt = receipt || transactionId || providerReference;
  const paidAmount = Number(amount || 0);
  const completedAt = paidAt || new Date().toISOString();
  const providerPayerPhoneRaw = String(phone || '').trim();
  const normalizedPayerPhone = normalizeKenyanPhone(providerPayerPhoneRaw);

  if (!paymentReceipt) {
    const error = new Error('Payment callback transaction reference is missing.');
    error.statusCode = 400;
    throw error;
  }
  if (!paidAmount || paidAmount <= 0) {
    const error = new Error('Payment callback amount is missing or invalid.');
    error.statusCode = 400;
    throw error;
  }

  const existingPayment = await findExistingPaymentByProviderIdentity({
    receipt: paymentReceipt,
    providerTransactionId: transactionId || paymentReceipt,
    providerReference: providerReference || paymentReceipt
  });

  if (existingPayment) return { duplicate: true, payment: existingPayment };

  const customer = await findCustomerForC2BPaybillReference(accountReference, normalizedPayerPhone);
  if (!customer) {
    const unmatchedCustomerName = nonEmpty(accountReference) || 'Unmatched paybill payment';
    const unmatchedPayment = await insertPaymentRecord({
        customer_id: null,
        customer_name: unmatchedCustomerName,
        customer_phone: normalizedPayerPhone || null,
        product_type: 'product',
        total_payable: 0,
        paid_amount: paidAmount,
        balance: 0,
        date: completedAt,
        receipt: paymentReceipt,
        provider_reference: providerReference || transactionId || null,
        provider_transaction_id: transactionId || null,
        provider_account_reference: accountReference || null,
        provider_payer_phone: normalizedPayerPhone || null,
        provider_payer_phone_raw: providerPayerPhoneRaw || null,
        provider_paid_at: completedAt,
        due_date: null,
        method,
        status: 'completed',
        payment_status: 'completed',
        source_portal: 'mpesa_c2b_unmatched'
      });

    if (unmatchedPayment.error) {
      if (isUniqueConstraintError(unmatchedPayment.error)) {
        const duplicatePayment = await findExistingPaymentByProviderIdentity({
          receipt: paymentReceipt,
          providerTransactionId: transactionId || paymentReceipt,
          providerReference: providerReference || paymentReceipt
        });
        if (duplicatePayment) return { duplicate: true, payment: duplicatePayment };
      }
      throw mapSupabaseError(unmatchedPayment.error);
    }

    const reconciliation = await getSupabase()
      .from('reconciliation')
      .insert({
        payment_id: unmatchedPayment.data.id,
        receipt: paymentReceipt,
        customer_name: unmatchedCustomerName,
        national_id: null,
        provider_amount: paidAmount,
        system_amount: 0,
        date: completedAt.slice(0, 10),
        status: 'unmatched',
        source_portal: 'mpesa_c2b_unmatched'
      })
      .select()
      .single();

    if (reconciliation.error) throw mapSupabaseError(reconciliation.error);

    await logPaymentEvent('mpesa_c2b_unmatched_recorded', {
      paymentId: unmatchedPayment.data.id,
      reconciliationId: reconciliation.data.id,
      accountReference: accountReference || '',
      phone: normalizedPayerPhone || '',
      providerPayerPhoneRaw,
      amount: paidAmount,
      receipt: paymentReceipt
    });

    return {
      duplicate: false,
      pendingMatch: true,
      payment: unmatchedPayment.data,
      customer: null,
      paidAmount,
      nextBalance: 0,
      repaymentPct: 0
    };
  }

  const nextPaidAmount = Number(customer.paid_amount || 0) + paidAmount;
  const totalPayable = Number(customer.total_payable || 0);
  const nextBalance = Math.max(totalPayable - nextPaidAmount, 0);
  const repaymentPct = totalPayable > 0 ? Math.min(100, (nextPaidAmount / totalPayable) * 100) : 0;
  const isDeposit = await shouldRecordPaymentAsDeposit(customer, customer.id);
  // Provider callbacks carry real money, so record them even if customer-side gating is still pending.
  if (!isNextOfKinVerified(customer)) {
    console.warn('[mpesa-c2b-next-of-kin-pending]', {
      customerId: customer.id,
      customerName: customer.customer_name || '',
      accountReference: accountReference || '',
      phone: normalizedPayerPhone || ''
    });
  }
  const paymentSplit = splitIncomingPaymentAmount(paidAmount, isDeposit);

  const insertPayment = await insertPaymentRecord({
      customer_id: customer.id,
      customer_name: customer.customer_name || 'Customer',
      customer_phone: customer.customer_phone,
      product_type: customer.product_type || 'product',
      product_model: customer.product_model || customer.bike_model || null,
      agent_name: customer.agent_name || null,
      agent_id: customer.agent_id || null,
      bike_model: customer.bike_model || null,
      serial_number: customer.serial_number || null,
      chassis_number: customer.chassis_number || null,
      total_payable: totalPayable,
      paid_amount: paidAmount,
      balance: nextBalance,
      daily_target: resolveCustomerDailyInstallment(customer),
      daily_installment: resolveCustomerDailyInstallment(customer),
      deposit_credit: paymentSplit.depositCredit,
      paygo_payment: paymentSplit.paygoPayment,
      date: completedAt,
      receipt: paymentReceipt,
      provider_reference: providerReference || transactionId || null,
      provider_transaction_id: transactionId || null,
      provider_account_reference: accountReference || paymentAccountReference(customer),
      provider_payer_phone: normalizedPayerPhone || null,
      provider_payer_phone_raw: providerPayerPhoneRaw || null,
      provider_paid_at: completedAt,
      due_date: customer.due_date || customer.paygo_next_due_at?.slice?.(0, 10) || null,
      method,
      status: 'paid',
      payment_status: 'paid',
      source_portal: 'mpesa_c2b'
    });

  if (insertPayment.error) {
    if (isUniqueConstraintError(insertPayment.error)) {
      const duplicatePayment = await findExistingPaymentByProviderIdentity({
        receipt: paymentReceipt,
        providerTransactionId: transactionId || paymentReceipt,
        providerReference: providerReference || paymentReceipt
      });
      if (duplicatePayment) return { duplicate: true, payment: duplicatePayment };
    }
    throw mapSupabaseError(insertPayment.error);
  }
  await ensureSaleCommissionForPayment(insertPayment.data).catch((error) => {
    console.warn('[payment-commission-sync-failed]', {
      paymentId: insertPayment.data.id,
      customerId: customer.id,
      error: error?.message || error
    });
  });

  let updatedCustomerRow = null;
  try {
    const updateCustomer = await getSupabase()
      .from('customers')
      .update({
        paid_amount: nextPaidAmount,
        balance: nextBalance,
        last_payment_date: completedAt.slice(0, 10),
        status: nextBalance <= 0 ? 'paid' : 'active',
        overdue_days: nextBalance <= 0 ? 0 : Number(customer.overdue_days || 0)
      })
      .eq('id', customer.id);

    if (updateCustomer.error) throw mapSupabaseError(updateCustomer.error);
    updatedCustomerRow = updateCustomer.data || null;
  } catch (error) {
    console.warn('[payment-customer-update-failed]', {
      paymentId: insertPayment.data.id,
      customerId: customer.id,
      error: error?.message || error
    });
  }

  const paymentCustomer = {
    ...(updatedCustomerRow || customer),
    paid_amount: nextPaidAmount,
    balance: nextBalance,
    last_payment_date: completedAt.slice(0, 10),
    status: nextBalance <= 0 ? 'paid' : 'active',
    overdue_days: nextBalance <= 0 ? 0 : Number(customer.overdue_days || 0),
    total_payable: totalPayable,
    daily_installment: Number(customer.daily_installment || 0)
  };
  let confirmedCustomer = paymentCustomer;

  try {
    const reconciliation = await reconcileCustomerPaygoAndLocker(customer.id, {
      customer: paymentCustomer,
      payment: insertPayment.data,
      now: completedAt,
      sourcePortal: 'mpesa_c2b',
      reason: isDeposit ? 'M-PESA C2B deposit received.' : 'M-PESA C2B payment received.',
      accountReference: accountReference || paymentAccountReference(customer) || customer.id
    });
    confirmedCustomer = reconciliation.customer || paymentCustomer;
  } catch (error) {
    console.warn('[payment-locker-sync-failed]', {
      paymentId: insertPayment.data.id,
      customerId: customer.id,
      error: error?.message || error
    });
  }
  const confirmedPaidAmount = Number(confirmedCustomer.paid_amount ?? nextPaidAmount);
  const confirmedBalance = Number(confirmedCustomer.balance ?? nextBalance);
  const confirmedRepaymentPct = totalPayable > 0
    ? Math.min(100, (confirmedPaidAmount / totalPayable) * 100)
    : 0;
  await syncPaymentFinancialSnapshot(insertPayment.data.id, {
    balance: confirmedBalance,
    totalPayable
  });
  await queuePaymentNotifications({
    customer: confirmedCustomer,
    customerId: customer.id,
    paymentId: insertPayment.data.id,
    amount: paidAmount,
    balance: confirmedBalance,
    repaymentPct: confirmedRepaymentPct,
    receipt: paymentReceipt,
    payerPhone: providerPayerPhoneRaw,
    sourcePortal: 'mpesa_c2b',
    accountReference: accountReference || paymentAccountReference(customer),
    paidAt: completedAt,
    financeType: 'payment_confirmed',
    financeTitle: 'C2B payment confirmed',
    financeMessage: {
      title: 'C2B payment confirmed',
      message: `${customer.customer_name || 'Customer'} paid KES ${formatKes(paidAmount)}.`
    },
    financeIssue: 'M-PESA C2B callback was received and matched to a customer.',
    financeFollowUp: 'Review reconciliation only if the amount or account looks unusual.',
    financeSourcePortal: 'mpesa_c2b'
  });

  return {
    duplicate: false,
    payment: insertPayment.data,
    customer: confirmedCustomer,
    paidAmount,
    nextBalance: confirmedBalance,
    repaymentPct: confirmedRepaymentPct,
    payerPhone: normalizedPayerPhone,
    providerPayerPhoneRaw
  };
}

export async function findCustomerForAuthUser(user) {
  const supabase = getSupabase();
  const userEmail = normalizeEmail(user?.email);

  let request = supabase
    .from('customers')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  let { data, error } = await request;
  if (error) throw mapSupabaseError(error);
  if (data) {
    await syncAuthUserPhoneFromProfile(user, data.customer_phone, data.customer_name);
    return data;
  }

  if (!userEmail) return null;

  const byEmail = await supabase
    .from('customers')
    .select('*')
    .ilike('email', userEmail)
    .maybeSingle();

  if (byEmail.error) throw mapSupabaseError(byEmail.error);
  if (!byEmail.data) return null;

  if (!byEmail.data.auth_user_id) {
    const linked = await supabase
      .from('customers')
      .update({ auth_user_id: user.id })
      .eq('id', byEmail.data.id)
      .select()
      .single();

    if (linked.error) throw mapSupabaseError(linked.error);
    await syncAuthUserPhoneFromProfile(user, linked.data.customer_phone, linked.data.customer_name);
    return linked.data;
  }

  await syncAuthUserPhoneFromProfile(user, byEmail.data.customer_phone, byEmail.data.customer_name);
  return byEmail.data;
}

export async function getCustomerPortal(user) {
  const customer = await findCustomerForAuthUser(user);

  if (!customer) {
    const error = new Error('Customer profile is not connected yet. Ask admin to link this email to a customer record.');
    error.statusCode = 403;
    throw error;
  }

  if (customer.customer_activation_otp_status !== 'verified') {
    const error = new Error('Activate your customer account with the OTP sent after approval before opening the portal.');
    error.statusCode = 403;
    throw error;
  }

  const [paymentsResult, notificationsResult, requestsResult] = await Promise.all([
    getSupabase()
      .from('payments')
      .select('*')
      .eq('customer_id', customer.id)
      .order('date', { ascending: false })
      .limit(5000),
    getSupabase()
      .from('customer_notifications')
      .select('*')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(100),
    getSupabase()
      .from('payment_requests')
      .select('*')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(20)
  ]);

  [paymentsResult, notificationsResult, requestsResult].forEach(({ error }) => {
    if (error) throw mapSupabaseError(error);
  });

  const payments = paymentsResult.data || [];
  const activePayments = payments.filter((payment) => String(payment.ledger_state || 'active').toLowerCase() !== 'superseded');
  const completedPayments = dedupeFinancialPayments(activePayments).filter(isSuccessfulFinancialPayment);
  const ledgerSummary = financialCustomerPaymentSummary(customer, completedPayments);
  const arrears = computeCustomerArrears({ customer, payments: completedPayments, now: new Date() });
  const { totalPayable, totalPaid, balance } = ledgerSummary;
  const dailyInstallment = Number(customer.daily_installment || 0);

  return {
    customer: {
      id: customer.id,
      name: customer.customer_name,
      phone: customer.customer_phone || '',
      email: customer.email || '',
      nationalId: customer.national_id || '',
      agentName: customer.agent_name || '',
      agentCode: customer.agent_id || ''
    },
    product: {
      type: customer.product_type || 'product',
      model: customer.product_model || customer.bike_model || '',
      serialNumber: customer.serial_number || '',
      chassisNumber: customer.chassis_number || '',
      totalPrice: totalPayable,
      dailyInstallment,
      dueDate: arrears.dueAt || customer.due_date || '',
      lastPaymentDate: customer.last_payment_date || '',
      status: mapDisplayStatus(customer.status, 'Active')
    },
    summary: {
      totalPayable,
      totalPaid,
      balance,
      progress: ledgerSummary.progress,
      overdueDays: arrears.overdueDays,
      overdueAmount: arrears.overdueAmount,
      pendingRequests: (requestsResult.data || []).filter((request) => request.status === 'pending').length
    },
    payments: activePayments.slice(0, 100).map((payment) => ({
      id: payment.id,
      date: formatDate(payment.date || payment.provider_paid_at || payment.created_at),
      amount: customerPaymentAmount(payment),
      receipt: payment.receipt || payment.provider_transaction_id || '',
      method: payment.method || 'paybill',
      phone: payment.provider_payer_phone || payment.customer_phone || '',
      status: mapDisplayStatus(payment.status)
    })),
    notifications: (notificationsResult.data || []).map((notification) => ({
      id: notification.id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      unread: notification.status === 'unread',
      date: formatDate(notification.created_at)
    })),
    paymentRequests: (requestsResult.data || []).map((request) => ({
      id: request.id,
      amount: Number(request.amount || 0),
      phone: request.phone || '',
      status: mapDisplayStatus(request.status),
      createdAt: formatDate(request.created_at)
    }))
  };
}

async function startCustomerCheckoutRequest(customer, { amount, phone, sourcePortal = 'customer', narration = 'SALAMA LOCK Paygo Installment' }) {
  const { data, error } = await getSupabase()
    .from('payment_requests')
    .insert({
      customer_id: customer.id,
      amount,
      phone,
      status: 'pending',
      source_portal: sourcePortal
    })
    .select()
    .single();

  if (error) throw mapSupabaseError(error);

  let request = data;

  try {
    const provider = await initiateStkPush({
      amount,
      phone,
      accountReference: paymentAccountReference(customer),
      transactionDescription: narration || `SALAMA LOCK Paygo ${customer.customer_name}`
    });
    const updated = await getSupabase()
      .from('payment_requests')
      .update({
        status: provider.status === 'queued' ? 'pending' : provider.status,
        provider_reference: provider.checkoutRequestId || provider.transactionId || data.id,
        backend_reference: provider.merchantRequestId || provider.transactionId || null,
        provider_response: {
          ...(provider.providerResponse || {}),
          accountReference: paymentAccountReference(customer)
        },
        failure_reason: null
      })
      .eq('id', data.id)
      .select()
      .single();

    if (updated.error) throw mapSupabaseError(updated.error);
    request = updated.data;
  } catch (error) {
    const failed = await getSupabase()
      .from('payment_requests')
      .update({
        status: 'failed',
        failure_reason: error.message,
        provider_response: {
          ...(error.providerResponse || {}),
          accountReference: paymentAccountReference(customer)
        }
      })
      .eq('id', data.id)
      .select()
      .single();

    if (failed.error) throw mapSupabaseError(failed.error);
    request = failed.data;
  }

  await getSupabase()
    .from('customer_notifications')
    .insert({
      customer_id: customer.id,
      title: 'Payment request received',
      message: `Your payment request for KES ${amount.toLocaleString('en-KE')} has been received.`,
      type: 'payment',
      status: 'unread'
    });

  return request;
}

export async function createCustomerPaymentRequest(user, body) {
  const customer = await findCustomerForAuthUser(user);

  if (!customer) {
    const error = new Error('Customer profile is not connected yet.');
    error.statusCode = 403;
    throw error;
  }

  if (!isNextOfKinVerified(customer)) {
    const error = new Error('Next-of-kin must accept the application before any customer payment request can be created.');
    error.statusCode = 409;
    throw error;
  }

  if (Number(customer.paid_amount || 0) <= 0) {
    const error = new Error('The initial deposit must be recorded by admin before customer payments can continue.');
    error.statusCode = 409;
    throw error;
  }

  const balance = derivedCustomerBalance(customer);
  const dailyInstallment = Number(customer.daily_installment || 0);
  const requestedAmount = Number(body.amount || 0);
  const amount = requestedAmount > 0
    ? requestedAmount
    : Math.min(dailyInstallment > 0 ? dailyInstallment : balance, balance || dailyInstallment);
  const phone = String(body.phone || customer.customer_phone || '').trim();
  const accountReference = nonEmpty(body.accountReference || body.account_reference) || paymentAccountReference(customer);

  if (!amount || amount <= 0 || !phone) {
    const error = new Error('Enter a valid payment phone number. The payment amount should follow the daily installment set by the agent.');
    error.statusCode = 400;
    throw error;
  }

  if (!accountReference) {
    const error = new Error('This customer does not have a National ID account reference yet.');
    error.statusCode = 400;
    throw error;
  }

  const request = await startCustomerCheckoutRequest(customer, {
    amount,
    phone,
    sourcePortal: 'customer',
    narration: `SALAMA LOCK Paygo Installment | Account ${accountReference}`
  });

  return {
    paymentRequest: request,
    accountReference
  };
}

export async function createCustomerPasswordResetRequest(body) {
  return requestPasswordResetOtp({ ...body, sourcePortal: 'customer' });
}

export async function createAgentPasswordResetRequest(body) {
  return requestPasswordResetOtp({ ...body, sourcePortal: 'agent' });
}

async function insertPasswordResetRequestRecord(payload, selectFields) {
  const optionalColumns = ['requested_email', 'normalized_email', 'registered_phone'];
  let writePayload = payload;

  for (let attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
    const result = await getSupabase()
      .from('password_reset_requests')
      .insert(writePayload)
      .select(selectFields)
      .single();

    if (!result.error) return result;

    const message = String(result.error.message || '').toLowerCase();
    const missingColumn = optionalColumns.find((column) => message.includes(column) && writePayload[column] !== undefined);
    if (!missingColumn) return result;

    logWarn('password_reset.database.optional_column_missing', {
      missingColumn,
      requestedEmail: payload.requested_email || payload.email || '',
      normalizedEmail: payload.normalized_email || payload.email || ''
    });
    writePayload = { ...writePayload };
    delete writePayload[missingColumn];
  }

  return getSupabase()
    .from('password_reset_requests')
    .insert(writePayload)
    .select(selectFields)
    .single();
}

export async function requestPasswordResetOtp(body) {
  const requestedEmail = String(body.identifier || body.email || '').trim();
  const email = normalizeEmail(requestedEmail);
  const sourcePortal = String(body.sourcePortal || body.source_portal || 'finance').trim() || 'finance';
  const senderMode = String(body.senderMode || body.sender_mode || '').trim().toLowerCase() === 'default'
    ? 'default'
    : 'configured';

  if (!isLikelyEmail(email)) {
    const error = new Error('Enter your email address to receive the OTP.');
    error.statusCode = 400;
    throw error;
  }

  logInfo('password_reset.request_started', {
    sourcePortal,
    requestedEmail,
    normalizedEmail: email,
    senderMode
  });

  const target = await resolvePasswordResetTarget(email, sourcePortal);
  if (!target?.user) {
    logWarn('password_reset.user_not_found', {
      sourcePortal,
      requestedEmail,
      normalizedEmail: email,
      userId: target?.user?.id || null,
      matchedBy: target?.matchedBy || null,
      role: target?.role || null
    });
    const error = new Error('Account was not found.');
    error.statusCode = 404;
    throw error;
  }

  if (!target.registeredPhone) {
    logWarn('password_reset.user_phone_missing', {
      sourcePortal,
      requestedEmail,
      normalizedEmail: email,
      userId: target.user.id || null,
      matchedBy: target?.matchedBy || null,
      role: target?.role || null
    });
    const error = new Error('The account does not have a phone number linked to it.');
    error.statusCode = 404;
    throw error;
  }

  await assertPasswordResetOtpRateLimit({
    phone: target.registeredPhone,
    requestedEmail,
    userId: target.user.id,
    sourcePortal
  });

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const resetOtp = await sendPasswordResetOtp({
    phone: target.registeredPhone,
    senderMode
  }, email);

  const requestPayload = {
    requested_email: requestedEmail,
    normalized_email: email,
    registered_phone: resetOtp.phone,
    user_id: target.user.id,
    email,
    phone: resetOtp.phone,
    otp_hash: resetOtp.otpHash,
    reset_token_hash: null,
    reset_token_expires_at: null,
    reset_token_used_at: null,
    used_at: null,
    attempts: 0,
    status: 'otp_required',
    source_portal: sourcePortal,
    otp_expires_at: expiresAt,
    provider_response: {
      provider: 'africastalking',
      sms: {
        status: 'pending',
        senderMode,
        provider: 'africastalking'
      }
    }
  };

  logInfo('password_reset.database.save_start', {
    sourcePortal,
    requestedEmail,
    normalizedEmail: email,
    otpRecordEmail: email,
    userId: target.user.id || null,
    registeredPhone: maskPhone(resetOtp.phone),
    status: requestPayload.status
  });

  const { data, error } = await insertPasswordResetRequestRecord(
    requestPayload,
    'id,user_id,email,phone,status,otp_expires_at,attempts,used_at,source_portal,created_at'
  );

  if (error) {
    logError('password_reset.database.save_failed', {
      sourcePortal,
      requestedEmail,
      normalizedEmail: email,
      otpRecordEmail: email,
      userId: target.user.id || null,
      error
    });
    throw mapSupabaseError(error);
  }

  logInfo('password_reset.database.save_complete', {
    sourcePortal,
    requestId: data.id,
    requestedEmail,
    normalizedEmail: email,
    otpRecordEmail: data.email,
    userId: data.user_id || target.user.id || null,
    status: data.status
  });

  let delivery;
  try {
    logInfo('password_reset.otp.send_start', {
      sourcePortal,
      requestId: data.id,
      requestedEmail,
      normalizedEmail: email,
      otpRecordEmail: data.email,
      userId: data.user_id || target.user.id || null,
      registeredPhone: maskPhone(resetOtp.phone),
      smsConfigured: hasAfricasTalkingSmsConfig(),
      senderMode
    });

    delivery = await sendPasswordResetSms({
      phone: resetOtp.phone,
      otp: resetOtp.otp,
      senderMode,
      requestId: data.id,
      sourcePortal
    });

    logInfo('password_reset.otp.send_complete', {
      sourcePortal,
      requestId: data.id,
      requestedEmail,
      normalizedEmail: email,
      otpRecordEmail: data.email,
      userId: data.user_id || target.user.id || null,
      registeredPhone: maskPhone(resetOtp.phone),
      providerAccepted: Boolean(delivery.providerAccepted),
      smsProvider: delivery.provider || 'africastalking',
      smsMessageId: delivery.sid || delivery.providerMessageId || null,
      senderIdUsed: Boolean(delivery.senderIdUsed),
      providerStatus: delivery.response?.SMSMessageData?.Recipients?.[0]?.status || null,
      providerCode: delivery.response?.SMSMessageData?.Recipients?.[0]?.statusCode ?? null,
      smsResponse: delivery.response || null
    });
  } catch (error) {
    const failure = mapOtpDeliveryError(error);
    logError('password_reset.otp.send_failed', {
      sourcePortal,
      requestId: data.id,
      requestedEmail,
      normalizedEmail: email,
      otpRecordEmail: data.email,
      userId: data.user_id || target.user.id || null,
      error
    });

    const updatedFailure = await getSupabase()
      .from('password_reset_requests')
      .update({
        status: 'failed',
        provider_response: {
          ...(requestPayload.provider_response || {}),
          sms: failure
        }
      })
      .eq('id', data.id)
      .select('id,user_id,email,status,otp_expires_at,attempts,used_at,source_portal,created_at')
      .single();

    if (updatedFailure.error) {
      logError('password_reset.database.failure_update_failed', {
        sourcePortal,
        requestId: data.id,
        requestedEmail,
        normalizedEmail: email,
        otpRecordEmail: data.email,
        userId: data.user_id || target.user.id || null,
        error: updatedFailure.error
      });
    }

    const providerMessage = error.providerResponse?.SMSMessageData?.Recipients?.[0]?.status
      || error.providerResponse?.message
      || error.providerResponse?.errorMessage
      || error.message
      || 'OTP delivery failed.';
    const providerCode = error.providerCode || error.providerResponse?.SMSMessageData?.Recipients?.[0]?.statusCode || error.providerResponse?.code || null;
    const smsError = new Error(normalizePasswordResetSmsErrorMessage(providerMessage));
    smsError.statusCode = error.statusCode || 502;
    smsError.provider = 'africastalking';
    smsError.providerCode = providerCode;
    smsError.providerResponse = error.providerResponse || null;
    throw smsError;
  }

  const deliveryAccepted = Boolean(delivery?.providerAccepted ?? delivery?.sent);
  const finalStatus = deliveryAccepted ? 'otp_sent' : 'failed';
  const updated = await getSupabase()
    .from('password_reset_requests')
    .update({
      status: finalStatus,
      user_id: data.user_id || target.user.id || null,
      phone: resetOtp.phone,
      provider_response: {
        ...(requestPayload.provider_response || {}),
        sms: {
          ...(requestPayload.provider_response?.sms || {}),
          providerAccepted: Boolean(delivery?.providerAccepted),
          sent: Boolean(delivery?.sent),
          delivered: Boolean(delivery?.delivered),
          deliveryStatus: delivery?.deliveryStatus || (deliveryAccepted ? 'provider_accepted' : 'failed'),
          messageId: delivery?.sid || delivery?.providerMessageId || null,
          providerStatus: delivery?.providerStatus || delivery?.response?.SMSMessageData?.Recipients?.[0]?.status || null,
          providerCode: delivery?.providerCode ?? delivery?.response?.SMSMessageData?.Recipients?.[0]?.statusCode ?? null,
          providerResponse: delivery?.response || null,
          senderIdUsed: Boolean(delivery?.senderIdUsed),
          senderId: delivery?.senderId || null,
          senderMode
        }
      }
    })
    .eq('id', data.id)
    .select('id,user_id,email,phone,status,otp_expires_at,attempts,used_at,source_portal,created_at')
    .single();

  if (updated.error) {
    logError('password_reset.database.finalize_failed', {
      sourcePortal,
      requestId: data.id,
      requestedEmail,
      normalizedEmail: email,
      otpRecordEmail: data.email,
      userId: data.user_id || target.user.id || null,
      error: updated.error
    });
    throw mapSupabaseError(updated.error);
  }

  if (!deliveryAccepted) {
    logWarn('password_reset.sms_not_delivered', {
      sourcePortal,
      requestId: data.id,
      requestedEmail,
      normalizedEmail: email,
      otpRecordEmail: data.email,
      userId: data.user_id || target.user.id || null,
      response: delivery.response || null
    });
    const providerMessageRaw = delivery.reason === 'sms_not_configured'
      ? 'SMS provider is not configured. Set AFRICASTALKING_USERNAME and AFRICASTALKING_API_KEY.'
      : delivery.reason === 'missing_phone'
        ? 'The account does not have a phone number linked to it.'
        : delivery.reason === 'invalid_phone'
          ? 'The phone number linked to this account is invalid. Update the account phone number and try again.'
          : delivery.response?.SMSMessageData?.Recipients?.[0]?.status
          || 'OTP request was saved, but the SMS provider did not confirm acceptance.';
    const providerMessage = normalizePasswordResetSmsErrorMessage(providerMessageRaw);
    const error = new Error(providerMessage);
    error.statusCode = 502;
    error.provider = 'africastalking';
    error.providerCode = delivery.response?.SMSMessageData?.Recipients?.[0]?.statusCode || delivery.response?.code || null;
    error.providerResponse = delivery.response || null;
    throw error;
  }

  return {
    sent: deliveryAccepted,
    providerAccepted: deliveryAccepted,
    gatewayAccepted: Boolean(delivery.gatewayAccepted ?? deliveryAccepted),
    delivered: false,
    deliveryStatus: delivery.deliveryStatus || (deliveryAccepted ? 'provider_accepted' : 'failed'),
    request: updated.data,
    otpGenerated: true,
    otpStored: true,
    smsSent: deliveryAccepted,
    smsMessageId: delivery.sid || delivery.providerMessageId || null,
    smsProviderStatus: delivery.providerStatus || delivery.response?.SMSMessageData?.Recipients?.[0]?.status || null,
    smsProviderCode: delivery.providerCode ?? delivery.response?.SMSMessageData?.Recipients?.[0]?.statusCode ?? null,
    providerResponse: delivery.response || null,
    linkedPhoneMasked: maskPhone(resetOtp.phone),
    requestedEmail,
    normalizedEmail: email,
    otpRecordEmail: updated.data.email,
    userId: updated.data.user_id || target.user.id || null,
    resendAvailableAt: new Date(Date.now() + 60 * 1000).toISOString(),
    message: deliveryAccepted
      ? 'OTP sent to the phone number linked to your account.'
      : 'OTP request was saved but the SMS provider did not confirm acceptance.'
  };
}

export async function verifyPasswordResetOtp(body) {
  const requestedEmail = String(body.identifier || body.email || '').trim();
  const email = normalizeEmail(requestedEmail);
  const sourcePortal = String(body.sourcePortal || body.source_portal || 'finance').trim() || 'finance';
  const otp = String(body.otp || '').trim();

  if (!isLikelyEmail(email) || !/^\d{6}$/.test(otp)) {
    const error = new Error('Enter your email address and the 6-digit OTP.');
    error.statusCode = 400;
    throw error;
  }

  logInfo('password_reset.verify_started', {
    requestedEmail,
    normalizedEmail: email,
    sourcePortal
  });

  const target = await resolvePasswordResetTarget(email, sourcePortal).catch(() => null);

  const latestRequest = async () => {
    const byEmail = await getSupabase()
      .from('password_reset_requests')
      .select('*')
      .ilike('email', email)
      .in('status', ['otp_sent', 'otp_required', 'verified'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byEmail.error) return byEmail;
    if (byEmail.data) return byEmail;

    if (target?.user?.id) {
      return getSupabase()
        .from('password_reset_requests')
        .select('*')
        .eq('user_id', target.user.id)
        .in('status', ['otp_sent', 'otp_required', 'verified'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    }

    return byEmail;
  };

  const { data, error } = await latestRequest();

  if (error) throw mapSupabaseError(error);
  if (!data) {
    const invalid = new Error('Invalid or expired OTP.');
    invalid.statusCode = 400;
    throw invalid;
  }

  if (target?.user?.id && data.user_id && data.user_id !== target.user.id) {
    const invalid = new Error('Invalid or expired OTP.');
    invalid.statusCode = 400;
    throw invalid;
  }

  const verification = await confirmPasswordResetOtp(data, email, otp);
  if (!verification.verified) {
    const nextAttempts = Number(data.attempts || 0) + 1;
    const attemptedAt = new Date().toISOString();
    const updatedFailure = await getSupabase()
      .from('password_reset_requests')
      .update({
        attempts: nextAttempts,
        status: nextAttempts >= 5 ? 'failed' : data.status || 'otp_sent',
        provider_response: {
          ...(data.provider_response || {}),
          verification: {
            verified: false,
            attemptedAt,
            attempts: nextAttempts,
            sourcePortal
          }
        }
      })
      .eq('id', data.id)
      .select('id,user_id,email,status,attempts')
      .single();

    if (updatedFailure.error) throw mapSupabaseError(updatedFailure.error);

    logWarn('password_reset.otp_verification_failed', {
      requestedEmail,
      normalizedEmail: email,
      sourcePortal,
      otpRecordEmail: data.email,
      userId: data.user_id || target?.user?.id || null,
      requestId: data.id,
      attempts: nextAttempts
    });

    const invalid = new Error('Invalid or expired OTP.');
    invalid.statusCode = 400;
    invalid.providerResponse = verification.response || null;
    throw invalid;
  }

  const resetToken = createResetToken();
  const resetTokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const resetTokenCreatedAt = new Date().toISOString();
  const updated = await getSupabase()
    .from('password_reset_requests')
    .update({
      status: 'verified',
      otp_verified_at: data.otp_verified_at || resetTokenCreatedAt,
      used_at: null,
      user_id: data.user_id || target?.user?.id || null,
      reset_token_hash: hashResetToken(email, resetToken),
      reset_token_expires_at: resetTokenExpiresAt,
      reset_token_used_at: null,
      provider_response: {
        ...(data.provider_response || {}),
        verification,
        resetToken: {
          created: true,
          createdAt: resetTokenCreatedAt,
          expiresAt: resetTokenExpiresAt,
          sourcePortal
        }
      }
    })
    .eq('id', data.id)
    .select('id,user_id,email,status,otp_verified_at,used_at,attempts,reset_token_expires_at,reset_token_used_at')
    .single();

  if (updated.error) throw mapSupabaseError(updated.error);

  logInfo('password_reset.otp_verified', {
    requestedEmail,
    normalizedEmail: email,
    sourcePortal,
    otpRecordEmail: updated.data.email,
    userId: updated.data.user_id || target?.user?.id || null,
    requestId: updated.data.id,
    otpVerified: true
  });
  logInfo('otp_verified', {
    requestedEmail,
    normalizedEmail: email,
    sourcePortal,
    otpRecordEmail: updated.data.email,
    userId: updated.data.user_id || target?.user?.id || null,
    requestId: updated.data.id,
    otpVerified: true
  });

  logInfo('password_reset.reset_token_created', {
    requestedEmail,
    normalizedEmail: email,
    otpRecordEmail: data.email,
    userId: data.user_id || target?.user?.id || null,
    resetTokenCreated: true,
    expiresAt: resetTokenExpiresAt,
    usedAt: null,
    requestId: updated.data.id,
    sourcePortal
  });

  return {
    verified: true,
    resetToken,
    resetTokenExpiresAt,
    request: updated.data,
    requestedEmail,
    normalizedEmail: email,
    otpRecordEmail: updated.data.email,
    userId: updated.data.user_id || target?.user?.id || null,
    message: 'OTP verified. You can now change your password.'
  };
}

export async function resetPasswordWithOtp(body) {
  const requestedEmail = String(body.identifier || body.email || '').trim();
  const email = normalizeEmail(requestedEmail);
  const sourcePortal = String(body.sourcePortal || body.source_portal || 'finance').trim() || 'finance';
  const resetToken = String(body.resetToken || body.reset_token || body.otp || '').trim();
  const password = String(body.password || '');

  if (!isLikelyEmail(email) || !resetToken || !validateStrongPassword(password)) {
    const error = new Error('Verify the OTP first and enter a valid new password.');
    error.statusCode = 400;
    throw error;
  }

  logInfo('password_reset.reset_started', {
    requestedEmail,
    normalizedEmail: email,
    sourcePortal,
    resetTokenProvided: Boolean(resetToken)
  });

  const target = await resolvePasswordResetTarget(email, sourcePortal).catch(() => null);

  const latestVerified = async () => {
    const byEmail = await getSupabase()
      .from('password_reset_requests')
      .select('*')
      .ilike('email', email)
      .eq('status', 'verified')
      .order('otp_verified_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byEmail.error) return byEmail;
    if (byEmail.data) return byEmail;

    if (target?.user?.id) {
      return getSupabase()
        .from('password_reset_requests')
        .select('*')
        .eq('user_id', target.user.id)
        .eq('status', 'verified')
        .order('otp_verified_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    }

    return byEmail;
  };

  const { data, error } = await latestVerified();

  if (error) throw mapSupabaseError(error);

  if (
    !data ||
    !data.reset_token_hash ||
    !data.reset_token_expires_at ||
    data.reset_token_used_at ||
    new Date(data.reset_token_expires_at).getTime() < Date.now() ||
    (
      data.reset_token_hash !== hashResetToken(email, resetToken) &&
      data.reset_token_hash !== hashResetToken(data.email || email, resetToken)
    )
  ) {
    const invalid = new Error('Invalid or expired OTP.');
    invalid.statusCode = 400;
    throw invalid;
  }

  if (target?.user?.id && data.user_id && data.user_id !== target.user.id) {
    const invalid = new Error('Invalid or expired OTP.');
    invalid.statusCode = 400;
    throw invalid;
  }

  let user = target?.user || null;
  if (!user && data.user_id) {
    const userResult = await getSupabase().auth.admin.getUserById(data.user_id);
    if (!userResult.error && userResult.data?.user) {
      user = userResult.data.user;
    }
  }

  if (!user && email.includes('@')) {
    user = await findAuthUserByEmail(email);
  }

  if (!user) {
    const missing = new Error('Account was not found.');
    missing.statusCode = 404;
    throw missing;
  }

  const updateUser = await getSupabase().auth.admin.updateUserById(user.id, { password });
  if (updateUser.error) throw mapSupabaseError(updateUser.error);

  const usedAt = new Date().toISOString();
  const updated = await getSupabase()
    .from('password_reset_requests')
    .update({
      status: 'completed',
      used_at: usedAt,
      reset_token_used_at: usedAt,
      provider_response: {
        ...(data.provider_response || {}),
        resetVerification: {
          used: true,
          usedAt
        },
        passwordUpdate: {
          updated: true,
          updatedAt: usedAt,
          sourcePortal,
          userId: user.id || null
        }
      }
    })
    .eq('id', data.id)
    .select('id,user_id,email,status,used_at,reset_token_used_at')
    .single();

  if (updated.error) throw mapSupabaseError(updated.error);

  logInfo('password_reset.password_updated', {
    requestedEmail,
    normalizedEmail: email,
    otpRecordEmail: data.email,
    userId: user.id || data.user_id || target?.user?.id || null,
    sourcePortal,
    passwordUpdated: true,
    usedAt,
    requestId: updated.data.id
  });
  logInfo('reset_password_success', {
    requestedEmail,
    normalizedEmail: email,
    otpRecordEmail: data.email,
    userId: user.id || data.user_id || target?.user?.id || null,
    sourcePortal,
    passwordUpdated: true,
    usedAt,
    requestId: updated.data.id
  });

  return {
    updated: true,
    passwordUpdated: true,
    usedAt,
    request: updated.data,
    requestedEmail,
    normalizedEmail: email,
    otpRecordEmail: updated.data.email,
    userId: user.id || data.user_id || target?.user?.id || null,
    resetTokenUsedAt: updated.data.reset_token_used_at,
    otpUsedAt: updated.data.used_at,
    message: 'Password updated. You can sign in now.'
  };
}

export async function findAgentForAuthUser(user) {
  const userEmail = normalizeEmail(user?.email);
  let { data, error } = await getSupabase()
    .from('agents')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) throw mapSupabaseError(error);
  if (data) {
    await syncAuthUserPhoneFromProfile(user, data.phone, data.full_name || data.agent_name);
    return data;
  }
  if (!userEmail) return null;

  const byEmail = await getSupabase()
    .from('agents')
    .select('*')
    .ilike('email', userEmail)
    .maybeSingle();

  if (byEmail.error) throw mapSupabaseError(byEmail.error);
  if (!byEmail.data) return null;

  if (!byEmail.data.auth_user_id) {
    const linked = await getSupabase()
      .from('agents')
      .update({ auth_user_id: user.id })
      .eq('id', byEmail.data.id)
      .select()
      .single();

    if (linked.error) throw mapSupabaseError(linked.error);
    await syncAuthUserPhoneFromProfile(user, linked.data.phone, linked.data.full_name || linked.data.agent_name);
    return linked.data;
  }

  await syncAuthUserPhoneFromProfile(user, byEmail.data.phone, byEmail.data.full_name || byEmail.data.agent_name);
  return byEmail.data;
}

export async function getAgentPortal(user) {
  const agent = await findAgentForAuthUser(user);

  if (!agent) {
    const error = new Error('Agent profile is not connected yet. Ask admin to approve or link this email.');
    error.statusCode = 403;
    throw error;
  }

  if (agent.status !== 'active') {
    const error = new Error('Your agent account is waiting for admin approval.');
    error.statusCode = 403;
    throw error;
  }

  const agentCode = agent.agent_code || agent.agent_id;
  const agentName = agent.full_name || agent.agent_name;
  const agentIds = [agent.id, agentCode, agent.agent_id, agent.email]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  const customerRequest = getSupabase()
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  const commissionRequest = getSupabase()
    .from('commissions')
    .select('*')
    .order('earned_at', { ascending: false })
    .limit(100);
  const notificationRequest = getSupabase()
    .from('agent_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  const productRequest = getSupabase()
    .from('inventory_products')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  const [customersResult, commissionsResult, notificationsResult, productsResult, tasksResult] = await Promise.all([
    agentCode ? customerRequest.eq('agent_id', agentCode) : customerRequest.eq('agent_name', agentName),
    agentCode ? commissionRequest.eq('agent_code', agentCode) : commissionRequest.eq('agent_name', agentName),
    agentCode ? notificationRequest.eq('agent_code', agentCode) : notificationRequest.eq('agent_name', agentName),
    productRequest,
    getSupabase()
      .from('agent_tasks')
      .select('*')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(100)
  ]);

  [customersResult, commissionsResult, notificationsResult, productsResult, tasksResult].forEach(({ error }) => {
    if (error) throw mapSupabaseError(error);
  });

  const customers = customersResult.data || [];
  const commissions = commissionsResult.data || [];
  const tasks = tasksResult.data || [];
  const products = (productsResult.data || []).filter((product) => {
    const productAgentId = String(product.assigned_agent_id || '').trim().toLowerCase();
    const productAgentCode = String(product.assigned_agent_code || '').trim().toLowerCase();
    const productAssignedIds = [productAgentId, productAgentCode].filter(Boolean);
    return productAssignedIds.some((value) => agentIds.includes(value));
  });
  const assignedBalance = customers
    .filter((customer) => customer.status !== 'rejected' && customer.application_status !== 'rejected')
    .reduce((total, customer) => total + derivedCustomerBalance(customer), 0);
  const paidCommissions = commissions
    .filter((commission) => commission.status === 'paid')
    .reduce((total, commission) => total + Number(commission.amount || 0), 0);
  const pendingCommissions = commissions
    .filter((commission) => commission.status !== 'paid')
    .reduce((total, commission) => total + Number(commission.amount || 0), 0);

  return {
    agent: {
      id: agent.id,
      code: agentCode || '',
      name: user?.user_metadata?.full_name || agentName || '',
      profileName: agentName || '',
      email: agent.email || '',
      phone: agent.phone || '',
      region: agent.region || '',
      status: agent.status || 'active'
    },
    summary: {
      assignedCustomers: customers.length,
      overdueCustomers: customers.filter((customer) => Number(customer.overdue_days || 0) > 0 || customer.status === 'defaulted').length,
      assignedBalance,
      paidCommissions,
      pendingCommissions,
      openTasks: tasks.filter((task) => task.status === 'open').length
    },
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.customer_name,
      phone: customer.customer_phone || '',
      email: customer.email || '',
      alternatePhones: customer.alternate_phones || '',
      alternateEmails: customer.alternate_emails || '',
      nextOfKinName: customer.next_of_kin_name || '',
      nextOfKinPhone: customer.next_of_kin_phone || '',
      productType: customer.product_type || 'product',
      productModel: customer.product_model || customer.bike_model || '',
      serialNumber: customer.serial_number || '',
      chassisNumber: customer.chassis_number || '',
      totalPayable: Number(customer.total_payable || 0),
      paidAmount: Number(customer.paid_amount || 0),
      balance: derivedCustomerBalance(customer),
      dueDate: customer.due_date || '',
      status: mapDisplayStatus(customer.status, 'Active'),
      overdueDays: Number(customer.overdue_days || 0)
    })),
    products: products.map((product) => ({
      id: product.id,
      productType: normalizeDashboardProductType(product.product_type || product.productType || 'bike') || 'bike',
      productModel: product.product_model || '',
      totalPayable: Number(product.total_payable || 0),
      serialNumber: product.serial_number || '',
      chassisNumber: product.chassis_number || '',
      branch: product.branch || '',
      status: product.status || 'assigned',
      assignedCustomerId: product.assigned_customer_id || null,
      assignedAgentId: product.assigned_agent_id || null,
      assignedAgentCode: product.assigned_agent_code || null
    })),
    commissions: commissions.map((commission) => ({
      id: commission.id,
      customerName: commission.customer_name || '',
      productType: commission.product_type || 'product',
      productModel: commission.product_model || '',
      amount: Number(commission.amount || 0),
      status: mapDisplayStatus(commission.status),
      earnedAt: formatDate(commission.earned_at)
    })),
    notifications: (notificationsResult.data || []).map((notification) => ({
      id: notification.id,
      title: notification.customer_name || 'Agent notification',
      message: notification.message,
      status: notification.status,
      date: formatDate(notification.created_at)
    })),
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      note: task.note || '',
      status: task.status,
      dueLabel: task.due_label || '',
      createdAt: formatDate(task.created_at)
    }))
  };
}

export async function createAgentCustomerMessage(user, customerId, body) {
  const agent = await findAgentForAuthUser(user);
  if (!agent) {
    const error = new Error('Agent profile is not connected yet.');
    error.statusCode = 403;
    throw error;
  }

  if (agent.status !== 'active') {
    const error = new Error('Your agent account is waiting for admin approval.');
    error.statusCode = 403;
    throw error;
  }

  const message = nonEmpty(body.message);
  if (!message || message.length > 700) {
    const error = new Error('Enter a message up to 700 characters.');
    error.statusCode = 400;
    throw error;
  }

  const agentCode = agent.agent_code || agent.agent_id;
  let customerRequest = getSupabase()
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .limit(1);

  customerRequest = agentCode
    ? customerRequest.eq('agent_id', agentCode)
    : customerRequest.eq('agent_name', agent.full_name || agent.agent_name);

  const customer = await customerRequest.maybeSingle();
  if (customer.error) throw mapSupabaseError(customer.error);
  if (!customer.data) {
    const error = new Error('Customer was not found for this agent.');
    error.statusCode = 404;
    throw error;
  }

  const title = nonEmpty(body.title) || `Message from ${agent.full_name || agent.agent_name || 'your agent'}`;
  const notification = await getSupabase()
    .from('customer_notifications')
    .insert({
      customer_id: customer.data.id,
      title,
      message,
      type: 'agent_message',
      status: 'unread',
      source_portal: 'agent'
    })
    .select()
    .single();

  if (notification.error) throw mapSupabaseError(notification.error);

  const agentMessageResult = await getSupabase().from('agent_notifications').insert({
    type: 'customer_message_sent',
    customer_id: customer.data.id,
    customer_name: customer.data.customer_name,
    customer_phone: customer.data.customer_phone,
    agent_id: agent.id,
    agent_name: agent.full_name || agent.agent_name,
    agent_code: agentCode || null,
    message: `Message sent to ${customer.data.customer_name}.`,
    status: 'read',
    source_portal: 'agent'
  });

  if (agentMessageResult.error) {
    console.warn('[agent-message-notification-failed]', agentMessageResult.error.message || agentMessageResult.error);
  }

  return { notification: notification.data };
}

export async function resendNextOfKinAcceptance(user, customerId) {
  const agent = await findAgentForAuthUser(user);
  if (!agent) {
    const error = new Error('Agent profile is not connected yet.');
    error.statusCode = 403;
    throw error;
  }

  if (agent.status !== 'active') {
    const error = new Error('Your agent account is waiting for admin approval.');
    error.statusCode = 403;
    throw error;
  }

  const agentCode = agent.agent_code || agent.agent_id;
  let customerRequest = getSupabase()
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .limit(1);

  customerRequest = agentCode
    ? customerRequest.eq('agent_id', agentCode)
    : customerRequest.eq('agent_name', agent.full_name || agent.agent_name);

  const customer = await customerRequest.maybeSingle();
  if (customer.error) throw mapSupabaseError(customer.error);
  if (!customer.data) {
    const error = new Error('Customer was not found for this agent.');
    error.statusCode = 404;
    throw error;
  }

  const nextOfKinPhone = nonEmpty(customer.data.next_of_kin_phone);
  if (!nextOfKinPhone) {
    const error = new Error('This customer does not have a next-of-kin phone number yet.');
    error.statusCode = 400;
    throw error;
  }

  if (customer.data.next_of_kin_otp_status === 'verified') {
    const error = new Error('Next-of-kin has already accepted this application.');
    error.statusCode = 409;
    throw error;
  }

  const nextOfKinOtp = createOtp();
  const nextOfKinOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const otpUpdate = await getSupabase()
    .from('customers')
    .update({
      next_of_kin_otp_hash: hashOtp(nextOfKinPhone, nextOfKinOtp),
      next_of_kin_otp_expires_at: nextOfKinOtpExpiresAt,
      next_of_kin_otp_sent_at: null,
      next_of_kin_otp_status: 'sent'
    })
    .eq('id', customer.data.id)
    .select()
    .single();

  if (otpUpdate.error) throw mapSupabaseError(otpUpdate.error);

  const otpDelivery = await sendNextOfKinAcceptanceSms({
    phone: nextOfKinPhone,
    otp: nextOfKinOtp,
    customerId: customer.data.id,
    customerName: customer.data.customer_name || customer.data.customerName || 'Customer'
  }).catch((deliveryError) => ({
    configured: true,
    delivered: false,
    sent: false,
    providerAccepted: false,
    provider: 'africastalking',
    error: deliveryError.message
  }));

  const sentAt = new Date().toISOString();
  const otpAccepted = Boolean(otpDelivery.providerAccepted ?? otpDelivery.sent ?? otpDelivery.delivered);
  const statusUpdate = await getSupabase()
    .from('customers')
    .update({
      next_of_kin_otp_sent_at: otpAccepted ? sentAt : null,
      next_of_kin_otp_status: otpAccepted ? 'sent' : 'failed'
    })
    .eq('id', customer.data.id)
    .select()
    .single();

  if (statusUpdate.error) throw mapSupabaseError(statusUpdate.error);

  const notificationResult = await getSupabase().from('agent_notifications').insert({
    agent_name: agent.full_name || agent.agent_name,
    agent_code: agentCode || null,
    customer_id: customer.data.id,
    customer_name: customer.data.customer_name || customer.data.customerName || 'Customer',
    message: otpAccepted
      ? `Next-of-kin acceptance SMS resent for ${customer.data.customer_name || 'customer'}.`
      : `Next-of-kin SMS resend failed for ${customer.data.customer_name || 'customer'}.`,
    status: otpAccepted ? 'read' : 'queued',
    source_portal: 'agent'
  });

  if (notificationResult.error) {
    console.warn('[next-of-kin-resend-notification-failed]', notificationResult.error.message || notificationResult.error);
  }

  return {
    customer: statusUpdate.data,
    sent: otpAccepted,
    providerAccepted: otpAccepted,
    delivered: Boolean(otpDelivery.delivered),
    otpDelivery,
    message: otpAccepted
      ? 'Next-of-kin acceptance SMS resent.'
      : 'Next-of-kin SMS resend attempted but delivery failed.'
  };
}

export async function createAgentCustomer(user, body) {
  const agent = await findAgentForAuthUser(user);
  if (!agent) {
    const error = new Error('Agent profile is not connected yet.');
    error.statusCode = 403;
    throw error;
  }

  const customerName = nonEmpty(body.customerName);
  const customerPhone = nonEmpty(body.customerPhone);
  const nationalId = nonEmpty(body.nationalId);
  const dateOfBirth = nonEmpty(body.dateOfBirth || body.date_of_birth);
  const gender = nonEmpty(body.gender);
  const location = nonEmpty(body.location);
  const occupation = nonEmpty(body.occupation);
  const passportPhotoUrl = nonEmpty(body.passportPhotoUrl || body.passport_photo_url);
  const idFrontUrl = nonEmpty(body.idFrontUrl || body.id_front_url);
  const idBackUrl = nonEmpty(body.idBackUrl || body.id_back_url);
  const nextOfKinName = nonEmpty(body.nextOfKinName || body.next_of_kin_name);
  const nextOfKinPhone = nonEmpty(body.nextOfKinPhone || body.next_of_kin_phone);
  const nextOfKinRelationship = nonEmpty(body.nextOfKinRelationship || body.next_of_kin_relationship);
  const nextOfKinNationalId = nonEmpty(body.nextOfKinNationalId || body.next_of_kin_national_id);
  const nextOfKinGender = nonEmpty(body.nextOfKinGender || body.next_of_kin_gender);
  const nextOfKinLocation = nonEmpty(body.nextOfKinLocation || body.next_of_kin_location);
  const nextOfKinOccupation = nonEmpty(body.nextOfKinOccupation || body.next_of_kin_occupation);
  const nextOfKinPassportPhotoUrl = nonEmpty(body.nextOfKinPassportPhotoUrl || body.next_of_kin_passport_photo_url);
  const nextOfKinIdFrontUrl = nonEmpty(body.nextOfKinIdFrontUrl || body.next_of_kin_id_front_url);
  const nextOfKinIdBackUrl = nonEmpty(body.nextOfKinIdBackUrl || body.next_of_kin_id_back_url);
  const productId = nonEmpty(body.productId || body.product_id);
  if (!productId) {
    const error = new Error('Select an inventory item added by admin before submitting the registration.');
    error.statusCode = 400;
    throw error;
  }

  const productResult = await getSupabase()
    .from('inventory_products')
    .select('*')
    .eq('id', productId)
    .maybeSingle();
  if (productResult.error) throw mapSupabaseError(productResult.error);
  if (!productResult.data) {
    const error = new Error('Selected inventory item was not found.');
    error.statusCode = 404;
    throw error;
  }

  const assignedProduct = productResult.data;
  let honorRegistration = null;
  const productType = assignedProduct.product_type || 'product';
  const productModel = nonEmpty(
    assignedProduct.product_model ||
    assignedProduct.bike_model ||
    (productType === 'phone' ? 'Phone' : 'Bike')
  );
  const serialNumber = productType === 'phone'
    ? nonEmpty(assignedProduct.imei_1 || assignedProduct.imei1 || assignedProduct.serial_number || assignedProduct.serialNumber || assignedProduct.locker_id || assignedProduct.id)
    : nonEmpty(assignedProduct.serial_number || assignedProduct.serialNumber);
  const chassisNumber = productType === 'phone'
    ? nonEmpty(assignedProduct.imei_2 || assignedProduct.imei2 || assignedProduct.chassis_number || assignedProduct.chassisNumber)
    : nonEmpty(assignedProduct.chassis_number || assignedProduct.chassisNumber);
  const primaryInventoryIdentifier = serialNumber || chassisNumber;
  const inventoryTotalPayable = Number(assignedProduct.total_payable || assignedProduct.totalPayable || 0);
  const requestedTotalPayable = Number(body.totalPayable || body.total_payable || 0);
  const totalPayable = Number.isFinite(inventoryTotalPayable) && inventoryTotalPayable > 0
    ? inventoryTotalPayable
    : requestedTotalPayable;
  const depositAmount = Number(body.depositAmount || body.paidAmount || 0);
  const dailyInstallment = Number(body.dailyInstallment || 0);
  const required = [
    ['customer name', customerName],
    ['customer phone', customerPhone],
    ['national ID', nationalId],
    ['date of birth', dateOfBirth],
    ['gender', gender],
    ['location', location],
    ['occupation', occupation],
    ['customer passport photo', passportPhotoUrl],
    ['customer ID front photo', idFrontUrl],
    ['customer ID back photo', idBackUrl],
    ['next-of-kin name', nextOfKinName],
    ['next-of-kin phone', nextOfKinPhone],
    ['next-of-kin relationship', nextOfKinRelationship],
    ['next-of-kin national ID', nextOfKinNationalId],
    ['next-of-kin gender', nextOfKinGender],
    ['next-of-kin location', nextOfKinLocation],
    ['next-of-kin occupation', nextOfKinOccupation],
    ['next-of-kin passport photo', nextOfKinPassportPhotoUrl],
    ['next-of-kin ID front photo', nextOfKinIdFrontUrl],
    ['next-of-kin ID back photo', nextOfKinIdBackUrl],
    ['assigned inventory item', productId],
    ['inventory product model', productModel],
    ['inventory identifier', primaryInventoryIdentifier]
  ];
  const missing = required.filter(([, value]) => !value).map(([label]) => label);

  if (missing.length > 0) {
    const error = new Error(`Complete required fields: ${missing.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(totalPayable) || totalPayable <= 0 || !Number.isFinite(dailyInstallment) || dailyInstallment <= 0 || !Number.isFinite(depositAmount) || depositAmount <= 0 || depositAmount > totalPayable) {
    const error = new Error('Enter valid deposit amount and daily installment, and make sure the selected inventory item has a total payable amount.');
    error.statusCode = 400;
    throw error;
  }
  const dueDate = calculatePaygoDueDate(totalPayable, dailyInstallment, new Date());
  const totalInstallments = calculatePaygoInstallmentDays(totalPayable, dailyInstallment);

  const agentCode = agent.agent_code || agent.agent_id;
  const nextOfKinOtp = nextOfKinPhone ? createOtp() : '';
  const nextOfKinOtpExpiresAt = nextOfKinOtp ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null;
  let nextOfKinOtpDelivery = { configured: false, delivered: false, provider: 'africastalking' };
  const duplicateCheck = nationalId
    ? await getSupabase()
        .from('customers')
        .select('id')
        .eq('national_id', nationalId)
        .limit(1)
    : { data: [] };

  if (duplicateCheck.error) throw mapSupabaseError(duplicateCheck.error);
  const duplicateNationalId = Boolean(duplicateCheck.data?.length);

  if (assignedProduct) {
    const productAgentCode = assignedProduct.assigned_agent_code || '';
    const productAgentId = assignedProduct.assigned_agent_id || '';
    if ((productAgentCode && productAgentCode !== agentCode) || (productAgentId && productAgentId !== agent.id)) {
      const error = new Error('This inventory item is assigned to another agent.');
      error.statusCode = 403;
      throw error;
    }
    if (assignedProduct.assigned_customer_id || ['reserved', 'sold'].includes(assignedProduct.status)) {
      const error = new Error('This inventory item is already reserved or sold.');
      error.statusCode = 409;
      throw error;
    }
  }

  const { data, error } = await getSupabase()
    .from('customers')
    .insert({
      customer_name: customerName,
      customer_phone: customerPhone,
      national_id: nationalId,
      email: normalizeEmail(body.email) || null,
      alternate_phones: nonEmpty(body.alternatePhones || body.alternate_phones) || null,
      alternate_emails: nonEmpty(body.alternateEmails || body.alternate_emails) || null,
      date_of_birth: dateOfBirth,
      gender,
      location,
      occupation,
      passport_photo_url: passportPhotoUrl,
      id_front_url: idFrontUrl,
      id_back_url: idBackUrl,
      next_of_kin_name: nextOfKinName,
      next_of_kin_phone: nextOfKinPhone,
      next_of_kin_relationship: nextOfKinRelationship,
      next_of_kin_national_id: nextOfKinNationalId,
      next_of_kin_gender: nextOfKinGender,
      next_of_kin_location: nextOfKinLocation,
      next_of_kin_occupation: nextOfKinOccupation,
      next_of_kin_passport_photo_url: nextOfKinPassportPhotoUrl,
      next_of_kin_id_front_url: nextOfKinIdFrontUrl,
      next_of_kin_id_back_url: nextOfKinIdBackUrl,
      next_of_kin_otp_hash: nextOfKinOtp ? hashOtp(nextOfKinPhone, nextOfKinOtp) : null,
      next_of_kin_otp_expires_at: nextOfKinOtpExpiresAt,
      next_of_kin_otp_sent_at: null,
      next_of_kin_otp_status: nextOfKinOtp ? 'not_sent' : 'not_sent',
      product_type: productType,
      product_model: productModel,
      bike_model: productType === 'bike' ? productModel : null,
      serial_number: serialNumber,
      chassis_number: chassisNumber || null,
      agent_name: agent.full_name || agent.agent_name,
      agent_id: agentCode,
      total_payable: totalPayable,
      paid_amount: 0,
      balance: totalPayable,
      due_date: dueDate,
      daily_installment: dailyInstallment,
      paygo_total_installments: totalInstallments,
      paygo_next_due_at: dueDate ? `${dueDate}T00:00:00.000Z` : null,
      application_status: 'pending_screening',
      status: nextOfKinOtp ? 'next_of_kin_pending' : 'pending_screening',
      source_portal: 'agent'
    })
    .select()
    .single();

  if (error) throw mapSupabaseError(error);
  const application = await getSupabase()
    .from('customer_applications')
    .insert({
      customer_id: data.id,
      product_id: assignedProduct?.id || null,
      agent_id: agentCode,
      agent_name: agent.full_name || agent.agent_name,
      national_id: nationalId || null,
      status: 'pending_screening',
      duplicate_national_id: duplicateNationalId,
      source_portal: 'agent'
    })
    .select()
    .single();

  if (application.error) throw mapSupabaseError(application.error);

  if (assignedProduct) {
    const reserveProduct = await getSupabase()
      .from('inventory_products')
      .update({
        assigned_customer_id: data.id,
        status: 'reserved'
      })
      .eq('id', assignedProduct.id)
      .is('assigned_customer_id', null)
      .select()
      .maybeSingle();
    if (reserveProduct.error) throw mapSupabaseError(reserveProduct.error);
    if (!reserveProduct.data) {
      const error = new Error('This bike was just reserved by another customer. Choose another assigned bike.');
      error.statusCode = 409;
      throw error;
    }

    // Send the next-of-kin OTP as soon as the customer and inventory reservation
    // are durable. Device-provider registration can be slow and must not delay OTP delivery.
    if (nextOfKinOtp) {
      nextOfKinOtpDelivery = await sendNextOfKinAcceptanceSms({
        phone: nextOfKinPhone,
        otp: nextOfKinOtp,
        customerId: data.id,
        customerName
      }).catch((deliveryError) => ({
        configured: true,
        delivered: false,
        sent: false,
        providerAccepted: false,
        provider: 'africastalking',
        error: deliveryError.message
      }));

      const sentAt = new Date().toISOString();
      const nextOfKinAccepted = Boolean(nextOfKinOtpDelivery.providerAccepted ?? nextOfKinOtpDelivery.sent ?? nextOfKinOtpDelivery.delivered);
      const updateOtpDelivery = await getSupabase()
        .from('customers')
        .update({
          next_of_kin_otp_sent_at: nextOfKinAccepted ? sentAt : null,
          next_of_kin_otp_status: nextOfKinAccepted ? 'sent' : 'failed'
        })
        .eq('id', data.id);
      if (updateOtpDelivery.error) throw mapSupabaseError(updateOtpDelivery.error);
    }

    honorRegistration = await syncPhoneLockerForCustomer({
      ...data,
      serial_number: reserveProduct.data.imei_1 || reserveProduct.data.serial_number || data.serial_number,
      chassis_number: reserveProduct.data.imei_2 || reserveProduct.data.chassis_number || data.chassis_number,
      product_type: reserveProduct.data.product_type || data.product_type,
      product_model: reserveProduct.data.product_model || data.product_model
    }, {
      action: 'register',
      sourcePortal: 'agent_customer_registration',
      accountReference: data.national_id || data.id || '',
      reason: 'Customer account created and product reserved.'
    });
  }

  if (nextOfKinOtp && !assignedProduct) {
    nextOfKinOtpDelivery = await sendNextOfKinAcceptanceSms({
      phone: nextOfKinPhone,
      otp: nextOfKinOtp,
      customerId: data.id,
      customerName
    }).catch((deliveryError) => ({
      configured: true,
      delivered: false,
      sent: false,
      providerAccepted: false,
      provider: 'africastalking',
      error: deliveryError.message
    }));

    const sentAt = new Date().toISOString();
    const nextOfKinAccepted = Boolean(nextOfKinOtpDelivery.providerAccepted ?? nextOfKinOtpDelivery.sent ?? nextOfKinOtpDelivery.delivered);
    const updateOtpDelivery = await getSupabase()
      .from('customers')
      .update({
        next_of_kin_otp_sent_at: nextOfKinAccepted ? sentAt : null,
        next_of_kin_otp_status: nextOfKinAccepted ? 'sent' : 'failed'
      })
      .eq('id', data.id)
      .select()
      .single();

    if (updateOtpDelivery.error) throw mapSupabaseError(updateOtpDelivery.error);
    data.next_of_kin_otp_sent_at = updateOtpDelivery.data.next_of_kin_otp_sent_at;
    data.next_of_kin_otp_status = updateOtpDelivery.data.next_of_kin_otp_status;
  }

  let paymentRequest = null;

  if (isNextOfKinVerified(data)) {
    paymentRequest = await startCustomerCheckoutRequest(data, {
      amount: depositAmount,
      phone: customerPhone,
      sourcePortal: 'agent',
      narration: 'SALAMA LOCK Paygo Deposit'
    });
  }

  if (!nextOfKinOtp) {
    await createScreeningNotification({ customer: data, agent, duplicateNationalId, agentCode });
  }

  return {
    success: true,
    customerId: data.id,
    deviceId: honorRegistration ? (honorRegistration.payload?.registeredIds?.[0] || primaryInventoryIdentifier || data.serial_number || data.id) : null,
    honorTaskId: honorRegistration ? (honorRegistration.honorTaskId || honorRegistration.requestId || null) : null,
    lockStatus: honorRegistration ? (honorRegistration.success ? 'SYNCED' : 'FAILED') : null,
    customer: data,
    paymentRequest,
    nextOfKinOtpRequired: Boolean(nextOfKinOtp),
    nextOfKinSmsSent: Boolean(nextOfKinOtpDelivery.providerAccepted ?? nextOfKinOtpDelivery.sent ?? nextOfKinOtpDelivery.delivered),
    requiresNextOfKinResend: Boolean(nextOfKinOtp) && !Boolean(nextOfKinOtpDelivery.providerAccepted ?? nextOfKinOtpDelivery.sent ?? nextOfKinOtpDelivery.delivered),
    otpDelivery: nextOfKinOtpDelivery,
    honorRegistration: honorRegistration ? {
      success: honorRegistration.success,
      customerId: data.id,
      deviceId: honorRegistration.payload?.registeredIds?.[0] || primaryInventoryIdentifier || data.serial_number || data.id,
      honorTaskId: honorRegistration.honorTaskId || honorRegistration.requestId || null,
      lockStatus: honorRegistration.success ? 'SYNCED' : 'FAILED'
    } : null
  };
}

async function createScreeningNotification({ customer, agent, duplicateNationalId, agentCode }) {
  await getSupabase()
    .from('finance_notifications')
    .insert({
      type: duplicateNationalId ? 'screening_duplicate' : 'screening_auto_approved',
      title: duplicateNationalId ? 'Duplicate national ID rejected' : 'Customer automatically approved',
      message: `${customer.customer_name} was submitted by ${agent.full_name || agent.agent_name || 'agent'} and screened automatically.`,
      issue: duplicateNationalId ? 'National ID already exists in customer records.' : 'Next-of-kin OTP was verified and the activation OTP was sent to the customer.',
      follow_up: duplicateNationalId ? 'Review the rejected application in Admin portal.' : 'Track activation, deposit payment, and repayment progress.',
      customer_id: customer.id,
      customer_name: customer.customer_name,
      customer_phone: customer.customer_phone,
      agent_name: agent.full_name || agent.agent_name,
      agent_code: agentCode,
      severity: duplicateNationalId ? 'critical' : 'info',
      source_portal: 'agent'
    });
}

export async function markApplicationProductSold({ application, customer, sourcePortal = 'screening' }) {
  if (!application?.product_id || !application?.customer_id) return { product: null };

  const currentProduct = await getSupabase()
    .from('inventory_products')
    .select('*')
    .eq('id', application.product_id)
    .maybeSingle();

  if (currentProduct.error) throw mapSupabaseError(currentProduct.error);
  if (!currentProduct.data) return { product: null };

  const alreadySold = currentProduct.data.status === 'sold' && currentProduct.data.assigned_customer_id === application.customer_id;
  const product = alreadySold
    ? currentProduct.data
    : await getSupabase()
      .from('inventory_products')
      .update({
        assigned_customer_id: application.customer_id,
        status: 'sold'
      })
      .eq('id', application.product_id)
      .select()
      .maybeSingle()
      .then((result) => {
        if (result.error) throw mapSupabaseError(result.error);
        return result.data;
      });

  if (!product || alreadySold) return { product };

  const customerName = customer?.customer_name || application.customers?.customer_name || 'Customer';
  const customerPhone = customer?.customer_phone || application.customers?.customer_phone || '';
  const agentName = application.agent_name || customer?.agent_name || 'Agent';
  const serial = product.serial_number || product.chassis_number || 'no serial';
  const model = product.product_model || 'bike';

  await syncPhoneLockerForCustomer({
    ...(customer || {}),
    serial_number: product.serial_number || customer?.serial_number || '',
    chassis_number: product.chassis_number || customer?.chassis_number || '',
    product_type: product.product_type || customer?.product_type || 'phone',
    product_model: product.product_model || customer?.product_model || customer?.bike_model || model
  }, {
    action: 'register',
    sourcePortal,
    accountReference: customer?.national_id || customer?.id || application?.customer_id || '',
    reason: 'Application approved and product sold to customer.'
  }).catch((error) => {
    console.warn('[phone-locker-approval-sync-failed]', application.customer_id, error?.message || error);
  });

  await getSupabase()
    .from('finance_notifications')
    .insert({
      type: 'product_sold',
      title: 'Assigned bike sold',
      message: `${model} ${serial} was sold to ${customerName} by ${agentName}.`,
      issue: 'Inventory moved from assigned/reserved to sold after customer approval.',
      follow_up: 'Finance should track deposit, repayment, and agent commission against this sold bike.',
      customer_id: application.customer_id,
      customer_name: customerName,
      customer_phone: customerPhone,
      agent_name: agentName,
      agent_code: application.agent_id || customer?.agent_id || null,
      balance: Number(customer?.balance || application.customers?.balance || 0),
      source_portal: sourcePortal,
      severity: 'success',
      status: 'unread'
    });

  return { product };
}

function activationSmsWasAccepted(result) {
  return Boolean(result?.customer?.providerAccepted ?? result?.customer?.sent ?? result?.customer?.delivered);
}

async function completeNextOfKinAcceptance({ customerId, otp, agent, trustedPhoneAcceptance = false }) {
  const customerQuery = getSupabase()
    .from('customers')
    .select('*')
    .eq('id', customerId);

  if (!agent) {
    const customerResult = await customerQuery.maybeSingle();
    if (customerResult.error) throw mapSupabaseError(customerResult.error);
    if (!customerResult.data) {
      const error = new Error('Next-of-kin request was not found.');
      error.statusCode = 404;
      throw error;
    }
    const foundAgent = customerResult.data.agent_id
      ? await getSupabase().from('agents').select('*').eq('agent_code', customerResult.data.agent_id).maybeSingle()
      : { data: null };
    if (foundAgent.error) throw mapSupabaseError(foundAgent.error);
    agent = foundAgent.data || {
      agent_code: customerResult.data.agent_id,
      agent_id: customerResult.data.agent_id,
      full_name: customerResult.data.agent_name,
      agent_name: customerResult.data.agent_name
    };
    return completeNextOfKinAcceptance({ customerId, otp, agent, trustedPhoneAcceptance });
  }

  if (agent.agent_code || agent.agent_id) {
    customerQuery.eq('agent_id', agent.agent_code || agent.agent_id);
  }

  const customerResult = await customerQuery.maybeSingle();

  if (customerResult.error) throw mapSupabaseError(customerResult.error);
  if (!customerResult.data) {
    const error = new Error('Next-of-kin request was not found.');
    error.statusCode = 404;
    throw error;
  }
  const customer = customerResult.data;
  const phone = customer.next_of_kin_phone || '';

  if (customer.next_of_kin_otp_status === 'verified') {
    return { customer, application: null, alreadyVerified: true };
  }

  if (
    !trustedPhoneAcceptance &&
    (
      !customer.next_of_kin_otp_hash ||
      customer.next_of_kin_otp_hash !== hashOtp(phone, otp) ||
      new Date(customer.next_of_kin_otp_expires_at).getTime() < Date.now()
    )
  ) {
    const invalid = new Error('Invalid or expired next-of-kin OTP.');
    invalid.statusCode = 400;
    throw invalid;
  }

  const verifiedAt = new Date().toISOString();
  const applicationResult = await getSupabase()
    .from('customer_applications')
    .select('*')
    .eq('customer_id', customerId)
    .maybeSingle();

  if (applicationResult.error) throw mapSupabaseError(applicationResult.error);

  let applicationData = applicationResult.data;
  if (!applicationData) {
    const createdApplication = await getSupabase()
      .from('customer_applications')
      .insert({
        customer_id: customerId,
        agent_id: customer.agent_id || null,
        agent_name: customer.agent_name || null,
        national_id: customer.national_id || null,
        product_id: null,
        status: 'pending_screening',
        duplicate_national_id: false,
        verification: {},
        source_portal: trustedPhoneAcceptance ? 'next_of_kin_phone' : 'next_of_kin_link'
      })
      .select()
      .single();

    if (createdApplication.error) throw mapSupabaseError(createdApplication.error);
    applicationData = createdApplication.data;
  }

  const duplicateNationalId = Boolean(applicationData.duplicate_national_id);
  const automatedReason = duplicateNationalId
    ? 'Automatic screening rejected this application because the national ID already exists.'
    : 'Automatic screening approved this application after next-of-kin OTP verification.';
  const activationOtp = duplicateNationalId ? '' : createOtp();
  const activationExpiresAt = activationOtp ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null;
  const smsAction = duplicateNationalId ? 'reject' : 'approve';
  const smsResult = await sendScreeningSms({
    action: smsAction,
    customer,
    agent,
    reason: automatedReason,
    activationOtp
  }).catch((smsError) => ({
    error: smsError.message,
    provider: 'africastalking'
  }));

  if (activationOtp && !activationSmsWasAccepted(smsResult)) {
    const error = new Error('Customer activation OTP could not be sent. Check Africa\'s Talking SMS settings before approving this application.');
    error.statusCode = 502;
    throw error;
  }

  const updateCustomer = await getSupabase()
    .from('customers')
    .update({
      next_of_kin_otp_status: 'verified',
      next_of_kin_otp_verified_at: verifiedAt,
      next_of_kin_verified_at: verifiedAt,
      application_status: duplicateNationalId ? 'rejected' : 'active',
      status: duplicateNationalId ? 'rejected' : 'active',
      screening_reason: automatedReason,
      screened_at: verifiedAt,
      customer_activation_otp_hash: activationOtp ? hashOtp(customer.id, activationOtp) : customer.customer_activation_otp_hash,
      customer_activation_otp_expires_at: activationExpiresAt || customer.customer_activation_otp_expires_at,
      customer_activation_otp_sent_at: activationOtp ? verifiedAt : customer.customer_activation_otp_sent_at,
      customer_activation_otp_status: activationOtp ? 'sent' : customer.customer_activation_otp_status
    })
    .eq('id', customerId)
    .select()
    .single();

  if (updateCustomer.error) throw mapSupabaseError(updateCustomer.error);

  if (!duplicateNationalId) {
    await markApplicationProductSold({
      application: applicationData,
      customer: updateCustomer.data,
      sourcePortal: 'next_of_kin_automation'
    });
  }

  const application = await getSupabase()
    .from('customer_applications')
    .update({
      status: duplicateNationalId ? 'rejected' : 'approved',
      review_reason: automatedReason,
      reviewed_at: verifiedAt,
      verification: {
        ...(applicationResult.data.verification || {}),
        nextOfKinOtpVerified: true,
        nextOfKinOtpVerifiedAt: verifiedAt,
        nextOfKinAcceptanceSource: trustedPhoneAcceptance ? 'phone_reply' : 'otp'
      }
    })
    .eq('customer_id', customerId)
    .select()
    .single();

  if (application.error) throw mapSupabaseError(application.error);

  await createScreeningNotification({
    customer: updateCustomer.data,
    agent,
    duplicateNationalId,
    agentCode: agent.agent_code || agent.agent_id
  });

  return { customer: updateCustomer.data, application: application.data, sms: smsResult };
}

export async function acceptNextOfKinOtp(customerId, body) {
  const otp = String(body.otp || '').trim();
  if (!/^\d{6}$/.test(otp)) {
    const error = new Error('Enter the 6-digit next-of-kin OTP.');
    error.statusCode = 400;
    throw error;
  }

  return completeNextOfKinAcceptance({ customerId, otp, agent: null });
}

export async function acceptNextOfKinByPhone(phone) {
  const candidates = buildPhoneCandidates(phone);
  if (candidates.length === 0) {
    const error = new Error('Next-of-kin phone is required.');
    error.statusCode = 400;
    throw error;
  }

  const now = new Date().toISOString();

  for (const candidate of candidates) {
    const result = await getSupabase()
      .from('customers')
      .select('*')
      .eq('next_of_kin_phone', candidate)
      .eq('next_of_kin_otp_status', 'sent')
      .gt('next_of_kin_otp_expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error) throw mapSupabaseError(result.error);
    if (result.data) {
      return completeNextOfKinAcceptance({ customerId: result.data.id, otp: '', agent: null, trustedPhoneAcceptance: true });
    }
  }

  const candidatesResult = await getSupabase()
    .from('customers')
    .select('*')
    .eq('next_of_kin_otp_status', 'sent')
    .gt('next_of_kin_otp_expires_at', now)
    .order('created_at', { ascending: false })
    .limit(500);

  if (candidatesResult.error) throw mapSupabaseError(candidatesResult.error);

  const normalized = String(phone || '').replace(/\D/g, '');
  const customer = (candidatesResult.data || []).find((item) => {
    const candidate = String(item.next_of_kin_phone || '').replace(/\D/g, '');
    return candidate && (
      normalized.endsWith(candidate) ||
      candidate.endsWith(normalized) ||
      normalized.endsWith(candidate.slice(-9)) ||
      candidate.endsWith(normalized.slice(-9))
    );
  });

  if (!customer) {
    const error = new Error('No pending next-of-kin request was found for this phone.');
    error.statusCode = 404;
    throw error;
  }

  return completeNextOfKinAcceptance({ customerId: customer.id, otp: '', agent: null, trustedPhoneAcceptance: true });
}

export async function verifyNextOfKinOtp(user, customerId, body) {
  const agent = await findAgentForAuthUser(user);
  if (!agent) {
    const error = new Error('Agent profile is not connected yet.');
    error.statusCode = 403;
    throw error;
  }

  const otp = String(body.otp || '').trim();
  if (!/^\d{6}$/.test(otp)) {
    const error = new Error('Enter the 6-digit next-of-kin OTP.');
    error.statusCode = 400;
    throw error;
  }

  return completeNextOfKinAcceptance({ customerId, otp, agent });
}

export async function createAgentCustomerDepositRequest(user, customerId, body) {
  const agent = await findAgentForAuthUser(user);
  if (!agent) {
    const error = new Error('Agent profile is not connected yet.');
    error.statusCode = 403;
    throw error;
  }

  const amount = Number(body.amount || 0);
  if (!amount || amount <= 0) {
    const error = new Error('Enter a valid deposit amount.');
    error.statusCode = 400;
    throw error;
  }

  const agentCode = agent.agent_code || agent.agent_id;
  const agentName = agent.full_name || agent.agent_name;
  let customerRequest = getSupabase()
    .from('customers')
    .select('*')
    .eq('id', customerId);

  customerRequest = agentCode ? customerRequest.eq('agent_id', agentCode) : customerRequest.eq('agent_name', agentName);
  const { data: customer, error } = await customerRequest.single();

  if (error) throw mapSupabaseError(error);
  if (customer.status === 'rejected' || customer.application_status === 'rejected') {
    const rejected = new Error('This customer application was rejected and cannot receive a deposit prompt.');
    rejected.statusCode = 409;
    throw rejected;
  }

  if (!isNextOfKinVerified(customer)) {
    const pending = new Error('Next-of-kin acceptance is required before the deposit can be prompted.');
    pending.statusCode = 409;
    throw pending;
  }

  const phone = String(body.phone || customer.customer_phone || '').trim();
  if (!phone) {
    const missingPhone = new Error('Enter the customer payment phone number.');
    missingPhone.statusCode = 400;
    throw missingPhone;
  }

  const request = await startCustomerCheckoutRequest(customer, {
    amount,
    phone,
    sourcePortal: 'agent',
    narration: 'SALAMA LOCK Paygo Deposit'
  });

  await getSupabase()
    .from('agent_notifications')
    .insert({
      agent_id: agent.id,
      agent_code: agentCode,
      agent_name: agentName,
      customer_id: customer.id,
      customer_name: customer.customer_name,
      message: `Deposit prompt for KES ${amount.toLocaleString('en-KE')} was sent to ${phone}.`,
      status: 'queued',
      source_portal: 'agent'
    });

  return { paymentRequest: request };
}

export async function createAgentTask(user, body) {
  const agent = await findAgentForAuthUser(user);
  if (!agent) {
    const error = new Error('Agent profile is not connected yet.');
    error.statusCode = 403;
    throw error;
  }

  const title = nonEmpty(body.title);
  const note = nonEmpty(body.note);
  if (!title || !note) {
    const error = new Error('Complete required fields: task title, task note.');
    error.statusCode = 400;
    throw error;
  }

  const { data, error } = await getSupabase()
    .from('agent_tasks')
    .insert({
      agent_id: agent.id,
      customer_id: body.customerId || null,
      title,
      note,
      due_label: body.dueLabel || 'Today',
      status: 'open'
    })
    .select()
    .single();

  if (error) throw mapSupabaseError(error);
  return { task: data };
}

export async function completeAgentTask(user, taskId) {
  const agent = await findAgentForAuthUser(user);
  if (!agent) {
    const error = new Error('Agent profile is not connected yet.');
    error.statusCode = 403;
    throw error;
  }

  const { data, error } = await getSupabase()
    .from('agent_tasks')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('agent_id', agent.id)
    .select()
    .single();

  if (error) throw mapSupabaseError(error);
  return { task: data };
}

async function findExistingManualPayment(paymentId, receipt) {
  const id = nonEmpty(paymentId);
  const paymentReceipt = nonEmpty(receipt);

  if (id) {
    const byId = await getSupabase()
      .from('payments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (byId.error) throw mapSupabaseError(byId.error);
    if (byId.data) return byId.data;
  }

  if (paymentReceipt) {
    const byReceipt = await getSupabase()
      .from('payments')
      .select('*')
      .eq('receipt', paymentReceipt)
      .maybeSingle();
    if (byReceipt.error) throw mapSupabaseError(byReceipt.error);
    if (byReceipt.data) return byReceipt.data;
  }

  return null;
}

async function findRecentEquivalentManualPayment(record) {
  if (!record?.customer_id) return null;

  const recent = await getSupabase()
    .from('payments')
    .select('*')
    .eq('customer_id', record.customer_id)
    .gte('created_at', new Date(Date.now() - (2 * 60 * 1000)).toISOString())
    .order('created_at', { ascending: false })
    .limit(20);

  if (recent.error) throw mapSupabaseError(recent.error);

  const targetDate = String(record.date || '').slice(0, 10);
  const targetStatus = String(record.status || '').toLowerCase();
  const targetDeposit = Number(record.deposit_credit || 0);
  const targetPaygo = Number(record.paygo_payment || 0);
  const targetAmount = financialPaymentAmount(record);

  return (recent.data || []).find((payment) => {
    const source = String(payment.source_portal || '').toLowerCase();
    const method = String(payment.method || '').toLowerCase();
    const receipt = String(payment.receipt || '').toUpperCase();
    const isManual = method === 'manual' || source.includes('manual');
    const hasGeneratedReference = receipt.startsWith('SALAMA LOCK-CM-') || receipt.startsWith('MAN-');

    return isManual &&
      hasGeneratedReference &&
      String(payment.status || '').toLowerCase() === targetStatus &&
      String(payment.date || '').slice(0, 10) === targetDate &&
      Number(payment.deposit_credit || 0) === targetDeposit &&
      Number(payment.paygo_payment || 0) === targetPaygo &&
      financialPaymentAmount(payment) === targetAmount;
  }) || null;
}

export async function createManualPayment(body) {
  let depositCredit = parseMoneyValue(body.depositCredit || body.deposit_credit || 0);
  let paygoPayment = parseMoneyValue(body.paygoPayment || body.paygo_payment || 0);
  const amount = depositCredit + paygoPayment;
  const totalPayableInput = parseMoneyValue(body.totalPayable || body.total_payable || 0);
  const customerNameInput = nonEmpty(body.customerName || body.customer_name);
  const customerPhoneInput = nonEmpty(body.customerPhone || body.customer_phone);
  const serialNumberInput = nonEmpty(body.serialNumber || body.serial_number);
  const chassisNumberInput = nonEmpty(body.chassisNumber || body.chassis_number);
  const productTypeInput = normalizeInventoryProductType(body.productType || body.product_type || body.assetType || body.asset_type);
  const productModelInput = nonEmpty(body.productModel || body.product_model || body.bikeModel || body.bike_model || body.itemName || body.item_name);
  const agentNameInput = nonEmpty(body.agentName || body.agent_name);
  const agentIdInput = nonEmpty(body.agentId || body.agent_id);
  const recordStatus = String(body.status || 'paid').trim().toLowerCase();
  const sourcePortal = nonEmpty(body.sourcePortal || body.source_portal) || 'finance';
  const paidAt = nonEmpty(body.date || body.paidAt || body.paid_at || '') || new Date().toISOString();
  const receipt = nonEmpty(body.receipt || body.receiptNumber || body.receipt_number) || `MAN-${Date.now()}`;
  const paymentId = nonEmpty(body.id || body.paymentId || body.payment_id) || `MAN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('Enter a valid payment amount.');
    error.statusCode = 400;
    throw error;
  }

  const existingManualPayment = await findExistingManualPayment(paymentId, receipt);
  if (existingManualPayment) {
    logInfo('payment.manual_duplicate_ignored', {
      paymentId: existingManualPayment.id,
      receipt: existingManualPayment.receipt || receipt
    });
    return { payment: existingManualPayment, duplicate: true };
  }

  const customer = await findCustomerForManualPayment(body).catch((error) => {
    console.warn('[manual-payment-customer-lookup-failed]', error?.message || error);
    return null;
  });

  if (customer && !isNextOfKinVerified(customer)) {
    const blocked = new Error('Next-of-kin acceptance is required before recording a customer payment.');
    blocked.statusCode = 409;
    throw blocked;
  }

  if (
    customer &&
    depositCredit <= 0 &&
    paygoPayment > 0 &&
    await shouldRecordPaymentAsDeposit(customer, customer.id)
  ) {
    logInfo('payment.manual_first_payment_reclassified_as_deposit', {
      customerId: customer.id,
      customerName: customer.customer_name || '',
      amount: paygoPayment,
      receipt
    });
    depositCredit = paygoPayment;
    paygoPayment = 0;
  }

  const product = await findInventoryProductByIdentifiers([
    serialNumberInput,
    chassisNumberInput,
    customer?.serial_number,
    customer?.chassis_number,
    customer?.bike_model
  ], productTypeInput === 'product' ? null : productTypeInput).catch((error) => {
    console.warn('[manual-payment-product-lookup-failed]', error?.message || error);
    return null;
  });

  const agent = await findAgentByNameOrCode(agentNameInput, agentIdInput).catch((error) => {
    console.warn('[manual-payment-agent-lookup-failed]', error?.message || error);
    return null;
  });

  const inferredProductType = normalizeInventoryProductType(
    body.productType ||
    body.product_type ||
    product?.product_type ||
    customer?.product_type ||
    (digitCount(serialNumberInput || chassisNumberInput) === 15 ? 'phone' : 'bike')
  );
  const productType = inferredProductType === 'product' ? 'bike' : inferredProductType;
  const productModel = nonEmpty(
    productModelInput ||
    product?.product_model ||
    customer?.product_model ||
    customer?.bike_model ||
    (productType === 'phone' ? 'Phone' : 'Bike')
  );
  const customerName = nonEmpty(customerNameInput || customer?.customer_name || 'Customer');
  const customerPhone = nonEmpty(customerPhoneInput || customer?.customer_phone || '');
  const agentName = nonEmpty(agent?.full_name || agent?.agent_name || agentNameInput || customer?.agent_name || 'Finance');
  const agentId = nonEmpty(agent?.agent_code || agent?.id || agentIdInput || customer?.agent_id || agentName);
  const serialNumber = nonEmpty(
    serialNumberInput ||
    product?.serial_number ||
    product?.imei_1 ||
    customer?.serial_number ||
    (productType === 'phone' ? chassisNumberInput : '')
  );
  const chassisNumber = nonEmpty(
    chassisNumberInput ||
    product?.chassis_number ||
    product?.imei_2 ||
    customer?.chassis_number
  ) || null;
  const totalPayable = Number.isFinite(totalPayableInput) && totalPayableInput > 0
    ? totalPayableInput
    : Number(customer?.total_payable || 0) > 0
      ? Number(customer.total_payable || 0)
      : amount;
  const paidAmount = Number.isFinite(parseMoneyValue(body.paidAmount || body.paid_amount))
    ? parseMoneyValue(body.paidAmount || body.paid_amount)
    : amount;
  const dueDate = nonEmpty(body.dueDate || body.due_date || customer?.due_date || '') || null;
  const computedDueDate = calculatePaygoDueDate(totalPayable, customer?.daily_installment || body.dailyInstallment || body.daily_installment || 0, paidAt);
  const customerId = customer?.id || null;
  const nextPaidAmount = customer ? Number(customer.paid_amount || 0) + paidAmount : paidAmount;
  const nextBalance = customer ? Math.max(Number(totalPayable || 0) - nextPaidAmount, 0) : Math.max(Number(totalPayable || 0) - paidAmount, 0);
  const customerStatus = customer ? (nextBalance <= 0 ? 'paid' : 'active') : (recordStatus === 'unpaid' ? 'active' : 'paid');
  const shouldApplyPayment = recordStatus !== 'unpaid' && customer && paidAmount > 0;

  const record = {
    id: paymentId,
    customer_id: customerId,
    customer_name: customerName,
    customer_phone: customerPhone,
    product_type: productType,
    product_model: productModel,
    agent_name: agentName,
    agent_id: agentId,
    bike_model: productType === 'bike' ? productModel : null,
    serial_number: serialNumber,
    chassis_number: chassisNumber,
    total_payable: Number(totalPayable || 0),
    paid_amount: paidAmount,
    balance: customer ? nextBalance : Math.max(Number(totalPayable || 0) - paidAmount, 0),
    daily_target: resolveCustomerDailyInstallment(customer, body.dailyInstallment || body.daily_installment),
    daily_installment: resolveCustomerDailyInstallment(customer, body.dailyInstallment || body.daily_installment),
    due_date: computedDueDate || dueDate || customer?.paygo_next_due_at?.slice?.(0, 10) || customer?.paygo_usage_ends_at?.slice?.(0, 10) || null,
    registration_status: body.registrationStatus || body.registration_status || 'registered',
    deposit_credit: depositCredit,
    paygo_payment: paygoPayment,
    date: paidAt,
    receipt,
    method: body.method || 'manual',
    status: recordStatus === 'unpaid' ? 'unpaid' : 'paid',
    payment_status: recordStatus === 'unpaid' ? 'unpaid' : 'paid',
    reconciliation_status: recordStatus === 'unpaid' ? 'manual_review' : 'matched',
    provider_account_reference: customer?.national_id || customer?.id || customerId || null,
    provider_payer_phone: customerPhone || null,
    source_portal: sourcePortal
  };

  const recentDuplicate = await findRecentEquivalentManualPayment(record);
  if (recentDuplicate) {
    logInfo('payment.manual_recent_duplicate_ignored', {
      paymentId: recentDuplicate.id,
      receipt: recentDuplicate.receipt || receipt,
      customerId
    });
    return { payment: recentDuplicate, duplicate: true };
  }

  const { data, error } = await getSupabase()
    .from('payments')
    .insert(record)
    .select()
    .single();

  if (error) {
    if (isUniqueConstraintError(error)) {
      const duplicatePayment = await findExistingManualPayment(paymentId, receipt);
      if (duplicatePayment) return { payment: duplicatePayment, duplicate: true };
    }
    throw mapSupabaseError(error);
  }

  if (shouldApplyPayment) {
    const updateCustomer = await getSupabase()
      .from('customers')
      .update({
        paid_amount: nextPaidAmount,
        balance: nextBalance,
        last_payment_date: paidAt.slice(0, 10),
        status: customerStatus,
        overdue_days: nextBalance <= 0 ? 0 : Number(customer?.overdue_days || 0)
      })
      .eq('id', customerId)
      .select()
      .single();

    if (updateCustomer.error) throw mapSupabaseError(updateCustomer.error);

    const paymentCustomer = updateCustomer.data || {
      ...customer,
      paid_amount: nextPaidAmount,
      balance: nextBalance,
      last_payment_date: paidAt.slice(0, 10),
      status: customerStatus,
      overdue_days: nextBalance <= 0 ? 0 : Number(customer?.overdue_days || 0)
    };
    let confirmedCustomer = paymentCustomer;
    try {
      const reconciliation = await reconcileCustomerPaygoAndLocker(customerId, {
        customer: paymentCustomer,
        payment: data,
        now: paidAt,
        sourcePortal,
        reason: 'Manual payment recorded in finance.',
        accountReference: paymentCustomer.national_id || paymentCustomer.id || customerId
      });
      confirmedCustomer = reconciliation.customer || paymentCustomer;
    } catch (lockerError) {
      console.warn('[manual-payment-locker-sync-failed]', customerId, lockerError?.message || lockerError);
    }
    const confirmedPaidAmount = Number(confirmedCustomer.paid_amount ?? nextPaidAmount);
    const confirmedBalance = Number(confirmedCustomer.balance ?? nextBalance);
    await syncPaymentFinancialSnapshot(data.id, {
      balance: confirmedBalance,
      totalPayable
    });

    await ensureSaleCommissionForPayment(data).catch((commissionError) => {
      console.warn('[manual-payment-commission-failed]', data.id, commissionError?.message || commissionError);
    });

    await queuePaymentNotifications({
      customer: confirmedCustomer,
      customerId,
      paymentId: data.id,
      amount: paidAmount,
      balance: confirmedBalance,
      repaymentPct: Number(totalPayable || 0) > 0 ? Math.min(100, (confirmedPaidAmount / Number(totalPayable || 0)) * 100) : 0,
      receipt,
      payerPhone: customerPhone,
      sourcePortal,
      accountReference: paymentAccountReference(confirmedCustomer) || customerId,
      paidAt,
      financeType: 'payment_confirmed',
      financeTitle: 'Payment confirmed',
      financeMessage: {
        title: 'Payment confirmed',
        message: `${confirmedCustomer.customer_name || customerName} paid KES ${formatKes(paidAmount)}.`
      },
      financeIssue: 'Manual payment was recorded in finance.',
      financeFollowUp: 'Review reconciliation only if the amount or account looks unusual.',
      financeSourcePortal: sourcePortal
    });

  }

  await logPaymentEvent('manual_payment_recorded', {
    paymentId: data.id,
    customerId,
    customerName,
    amount: paidAmount,
    totalPayable,
    balance: nextBalance,
    status: recordStatus,
    sourcePortal
  });

  return { payment: data, duplicate: false };
}

export async function listCustomers(query = {}) {
  const productType = normalizeDashboardProductType(query.productType || query.product_type || query.type);
  const buildRequest = () => {
    let request = getSupabase()
      .from('customers')
      .select('*')
      .order('customer_name', { ascending: true });
    if (productType === 'phone') request = request.eq('product_type', 'phone');
    if (productType === 'bike') request = request.in('product_type', ['bike', 'product']);
    return request;
  };
  const { data, error } = await readPagedRows(buildRequest, query);

  if (error) throw mapSupabaseError(error);
  const customers = data || [];
  if (customers.length === 0) return { customers };

  const paymentRows = await readPagedRows(
    () => getSupabase()
      .from('payments')
      .select('id,customer_id,status,payment_status,receipt,provider_transaction_id,provider_reference,deposit_credit,paygo_payment,paid_amount,date,provider_paid_at,created_at,ledger_state,revision_of,revision_number,correction_reason'),
    { limit: 5000 }
  );
  if (paymentRows.error) throw mapSupabaseError(paymentRows.error);

  const paymentsByCustomer = groupPaymentsByCustomer(
    dedupeFinancialPayments(paymentRows.data || []).filter(isSuccessfulFinancialPayment)
  );
  const now = new Date();

  return {
    customers: customers.map((customer) => {
      const arrears = customerArrearsSummary(customer, paymentsByCustomer, now);
      return {
        ...customer,
        overdue_days: arrears.overdueDays,
        overdue_amount: arrears.overdueAmount
      };
    })
  };
}

export async function listCustomerPaymentRecords(query = {}) {
  const buildRequest = () => {
    let request = getSupabase()
      .from('payments')
      .select('*')
      .order('date', { ascending: false });
    if (query.agentName) request = request.ilike('agent_name', query.agentName);
    if (query.agentId) request = request.ilike('agent_id', query.agentId);
    return request;
  };

  const { data, error } = await readPagedRows(buildRequest, query);

  if (error) throw mapSupabaseError(error);

  const payments = dedupeFinancialPayments(data || []);
  const customerIds = [...new Set(payments.map((payment) => nonEmpty(payment.customer_id)).filter(Boolean))];
  if (customerIds.length === 0) return { payments };

  const customersResult = await getSupabase()
    .from('customers')
    .select('id,total_payable,paid_amount,balance,daily_installment,overdue_days,due_date,last_payment_date,paygo_next_due_at,paygo_schedule_status,status')
    .in('id', customerIds);

  if (customersResult.error) throw mapSupabaseError(customersResult.error);
  const customerById = new Map((customersResult.data || []).map((customer) => [customer.id, customer]));
  const paymentsByCustomer = groupPaymentsByCustomer(payments.filter(isSuccessfulFinancialPayment));
  const now = new Date();

  return {
    payments: payments.map((payment) => {
      const customer = customerById.get(payment.customer_id);
      if (!customer) return payment;
      const repaymentDueAt = resolveCustomerRepaymentDueAt(customer);
      const arrears = customerArrearsSummary(customer, paymentsByCustomer, now);
      const overdueDays = arrears.overdueDays;

      return {
        ...payment,
        total_payable: Number(customer.total_payable || 0),
        paid_amount: financialPaymentAmount(payment),
        customer_paid_amount: Number(customer.paid_amount || 0),
        balance: derivedCustomerBalance(customer),
        daily_target: Number(customer.daily_installment || 0),
        daily_installment: Number(customer.daily_installment || 0),
        overdue_days: overdueDays,
        overdue_amount: arrears.overdueAmount,
        due_date: repaymentDueAt ? String(repaymentDueAt).slice(0, 10) : (payment.due_date || ''),
        paygo_next_due_at: repaymentDueAt || payment.paygo_next_due_at || '',
        last_payment_date: customer.last_payment_date || payment.last_payment_date || '',
        paygo_state: customer.paygo_schedule_status || customer.status || payment.paygo_state || '',
        customer_status: customer.status || ''
      };
    })
  };
}

export async function listInventory(query = {}) {
  const productType = normalizeInventoryProductType(query.productType || query.product_type || query.type);
  let request = getSupabase()
    .from(inventorySourceForType(productType))
    .select('*')
    .order('created_at', { ascending: false });

  if (productType === 'phone') request = request.eq('product_type', 'phone');
  if (productType === 'bike') request = request.in('product_type', ['bike', 'product']);
  if (query.status) request = request.eq('status', query.status);
  if (query.agentCode) request = request.eq('assigned_agent_code', query.agentCode);

  const { data, error } = await applyRange(request, query, 500);

  if (error) throw mapSupabaseError(error);
  return { products: data || [] };
}

export async function listCommissions(query = {}) {
  const productType = normalizeDashboardProductType(query.productType || query.product_type || query.type);
  const requestedLimit = normalizeLimit(query.limit, 500, 5000);
  const requestedOffset = normalizeOffset(query.offset);
  if (normalizeOffset(query.offset) === 0) {
    await ensureMissingSaleCommissions({ productType }).catch((error) => {
      logWarn('commissions.sale_backfill_failed', {
        productType: productType || 'all',
        error
      });
    });
  }

  const buildRequest = () => getSupabase()
    .from('commissions')
    .select('*')
    .order('earned_at', { ascending: false });
  const { data: storedCommissions, error } = await readPagedRows(buildRequest, { limit: 5000 }, 5000);

  if (error) throw mapSupabaseError(error);
  const commissionRecords = storedCommissions || [];
  const needsClassificationFallback = commissionRecords.some((commission) =>
    !['bike', 'phone'].includes(normalizeDashboardProductType(inferProductType(commission)))
  );
  let data = mergeDashboardCommissionRecords(commissionRecords, [])
    .filter((commission) => commissionMatchesProductScope(commission, productType));

  if ((data.length === 0 || needsClassificationFallback) && requestedOffset === 0) {
    const [paymentResult, customerResult] = await Promise.all([
      readPagedRows(
        () => getSupabase()
        .from('payments')
        .select('id,receipt,customer_id,customer_name,agent_name,agent_id,bike_model,serial_number,chassis_number,product_type,product_model,deposit_credit,paygo_payment,paid_amount,date,created_at,status,payment_status,reconciliation_status,provider_reference,provider_transaction_id')
        .order('date', { ascending: false }),
        { limit: 5000 }
      ),
      readPagedRows(
        () => getSupabase()
          .from('customers')
          .select('id,customer_name,agent_name,agent_id,bike_model,serial_number,chassis_number,product_type,product_model')
          .order('created_at', { ascending: false }),
        { limit: 5000 }
      )
    ]);
    if (paymentResult.error) throw mapSupabaseError(paymentResult.error);
    if (customerResult.error) throw mapSupabaseError(customerResult.error);

    const generated = buildSaleCommissionsFromPayments(paymentResult.data || [], customerResult.data || []);
    data = mergeDashboardCommissionRecords(commissionRecords, generated)
      .filter((commission) => commissionMatchesProductScope(commission, productType));

    if (commissionRecords.length === 0 && generated.length > 0) {
      const inserted = await getSupabase()
        .from('commissions')
        .upsert(generated, { onConflict: 'id' })
        .select()
        .order('earned_at', { ascending: false });

      if (inserted.error) {
        logWarn('commissions.generated_rows_not_persisted', { error: inserted.error });
      } else {
        data = mergeDashboardCommissionRecords(inserted.data || generated, [])
          .filter((commission) => commissionMatchesProductScope(commission, productType));
      }
    }
  }

  return { commissions: data.slice(requestedOffset, requestedOffset + requestedLimit) };
}

export async function payCommission(id) {
  const { data, error } = await getSupabase()
    .from('commissions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw mapSupabaseError(error);
  return queueCommissionPayout(data);
}

export async function markAgentCommissionsPaid(agentKey) {
  const { data, error } = await getSupabase()
    .from('commissions')
    .select('*')
    .or(`agent_code.eq.${agentKey},agent_name.eq.${agentKey}`)
    .not('status', 'in', '(paid,processing)');

  if (error) throw mapSupabaseError(error);

  const queued = [];
  for (const commission of data || []) {
    const result = await queueCommissionPayout(commission, 'FIN-AGENT');
    queued.push(result.commission);
  }

  return { commissions: queued };
}

export async function createAgentNotification(body) {
  let source = body;

  if (body.commissionId || body.commission_id) {
    const commissionId = body.commissionId || body.commission_id;
    const commission = await getSupabase()
      .from('commissions')
      .select('*')
      .eq('id', commissionId)
      .single();

    if (commission.error) throw mapSupabaseError(commission.error);
    source = {
      ...body,
      agent_name: commission.data.agent_name,
      agent_code: commission.data.agent_code,
      agent_phone: commission.data.agent_phone,
      customer_name: commission.data.customer_name,
      message: body.message || `Follow up ${commission.data.customer_name || 'customer account'}.`
    };
  }

  const record = {
    agent_name: source.agentName || source.agent_name,
    agent_code: source.agentCode || source.agent_code,
    agent_phone: source.agentPhone || source.agent_phone,
    customer_name: source.customerName || source.customer_name,
    message: source.message,
    source_portal: 'finance',
    created_at: source.createdAt || source.created_at || new Date().toISOString()
  };

  const { data, error } = await getSupabase()
    .from('agent_notifications')
    .insert(record)
    .select()
    .single();

  if (error) throw mapSupabaseError(error);

  if (body.commissionId || body.commission_id) {
    await getSupabase()
      .from('commissions')
      .update({ follow_up_sent_at: record.created_at })
      .eq('id', body.commissionId || body.commission_id);
  }

  return { notification: data };
}

export async function listReconciliation(query = {}) {
  const productType = normalizeDashboardProductType(query.productType || query.product_type || query.type);
  const request = getSupabase()
    .from('reconciliation')
    .select('*')
    .order('date', { ascending: false });
  const { data, error } = await applyRange(request, query);

  if (error) throw mapSupabaseError(error);
  const records = data || [];
  if (!productType || records.length === 0) {
    return { records };
  }

  const paymentIds = [...new Set(records.map((record) => record.payment_id).filter(Boolean))];
  if (paymentIds.length === 0) {
    return { records: [] };
  }

  const paymentLookup = await getSupabase()
    .from('payments')
    .select('id,product_type')
    .in('id', paymentIds);

  if (paymentLookup.error) throw mapSupabaseError(paymentLookup.error);

  const productTypeByPaymentId = new Map((paymentLookup.data || []).map((payment) => [payment.id, normalizeDashboardProductType(payment.product_type)]));
  return {
    records: records.filter((record) => productTypeByPaymentId.get(record.payment_id) === productType)
  };
}

export async function listFinanceNotifications(query = {}) {
  const request = getSupabase()
    .from('finance_notifications')
    .select('*')
    .neq('status', 'dismissed')
    .order('created_at', { ascending: false });
  const { data, error } = await applyRange(request, query, 200);

  if (error) throw mapSupabaseError(error);
  return { notifications: data || [] };
}

export async function updateFinanceNotificationsStatus({ ids = [], status }) {
  const cleanIds = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
  if (cleanIds.length === 0 || !['unread', 'read', 'dismissed'].includes(status)) {
    const error = new Error('Choose notifications and a valid status.');
    error.statusCode = 400;
    throw error;
  }

  const { data, error } = await getSupabase()
    .from('finance_notifications')
    .update({ status })
    .in('id', cleanIds)
    .select('id,status');

  if (error) throw mapSupabaseError(error);
  return { updated: data || [] };
}

function daysBetween(dateValue, now = new Date()) {
  if (!dateValue) return 0;
  const currentNow = now instanceof Date ? now : new Date(now);
  const safeNow = Number.isNaN(currentNow.getTime()) ? new Date() : currentNow;
  const today = new Date(`${safeNow.toISOString().slice(0, 10)}T12:00:00.000Z`);
  const target = new Date(`${String(dateValue).slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(target.getTime())) return 0;
  return Math.floor((today - target) / (24 * 60 * 60 * 1000));
}

function resolveCustomerRepaymentDueAt(customer = {}) {
  return resolveRepaymentDueAt(customer);
}

function customerReminderAmount(customer, overdueDays = 0) {
  const dailyInstallment = Number(customer.daily_installment || 0);
  const balance = derivedCustomerBalance(customer);
  const missedDays = Math.max(1, Number(overdueDays || 0));
  if (dailyInstallment > 0 && balance > 0) return Math.min(dailyInstallment * missedDays, balance);
  return balance;
}

async function hasFinanceNotificationToday(type, customerId, since) {
  const result = await getSupabase()
    .from('finance_notifications')
    .select('id')
    .eq('type', type)
    .eq('customer_id', customerId)
    .gte('created_at', since)
    .limit(1);

  if (result.error) throw mapSupabaseError(result.error);
  return Boolean(result.data?.length);
}

async function insertCustomerNotificationOnce({ customerId, title, message, type, since }) {
  const existing = await getSupabase()
    .from('customer_notifications')
    .select('id')
    .eq('customer_id', customerId)
    .eq('type', type)
    .gte('created_at', since)
    .limit(1);

  if (existing.error) throw mapSupabaseError(existing.error);
  if (existing.data?.length) return null;

  const inserted = await getSupabase()
    .from('customer_notifications')
    .insert({ customer_id: customerId, title, message, type, status: 'unread', source_portal: 'backend' })
    .select()
    .single();

  if (inserted.error) throw mapSupabaseError(inserted.error);
  return inserted.data;
}

async function insertAgentNotificationOnce({ customer, message, since }) {
  const existing = await getSupabase()
    .from('agent_notifications')
    .select('id')
    .eq('agent_code', customer.agent_id || '')
    .eq('customer_name', customer.customer_name || '')
    .eq('message', message)
    .gte('created_at', since)
    .limit(1);

  if (existing.error) throw mapSupabaseError(existing.error);
  if (existing.data?.length) return null;

  const inserted = await getSupabase()
    .from('agent_notifications')
    .insert({
      agent_name: customer.agent_name || null,
      agent_code: customer.agent_id || null,
      customer_name: customer.customer_name,
      message,
      status: 'queued',
      source_portal: 'backend'
    })
    .select()
    .single();

  if (inserted.error) throw mapSupabaseError(inserted.error);
  return inserted.data;
}

async function createFinanceFollowUpNotification({ customer, type, title, message, issue, followUp, severity, amount, overdueDays, since }) {
  if (await hasFinanceNotificationToday(type, customer.id, since)) return null;

  const inserted = await getSupabase()
    .from('finance_notifications')
    .insert({
      type,
      title,
      message,
      issue,
      follow_up: followUp,
      customer_id: customer.id,
      customer_name: customer.customer_name,
      customer_phone: customer.customer_phone,
      agent_name: customer.agent_name,
      agent_code: customer.agent_id,
      amount,
      balance: derivedCustomerBalance(customer),
      overdue_days: overdueDays,
      source_portal: 'backend',
      severity,
      status: 'unread'
    })
    .select()
    .single();

  if (inserted.error) throw mapSupabaseError(inserted.error);
  return inserted.data;
}

export async function runAutomatedFollowUps({ dryRun = false } = {}) {
  const now = new Date();
  const lock = await claimSchedulerLock('automated_follow_ups', {
    ttlSeconds: 1800,
    metadata: { dryRun }
  });

  if (!lock.acquired) {
    return {
      checked: 0,
      customerNotifications: 0,
      agentNotifications: 0,
      financeNotifications: 0,
      smsSent: 0,
      smsFailed: 0,
      statusUpdates: 0,
      expiredCustomerOtps: 0,
      expiredNextOfKinOtps: 0,
      stalePaymentRequests: 0,
      dryRun,
      skipped: true,
      reason: 'lock_unavailable'
    };
  }

  try {
  const today = now.toISOString().slice(0, 10);
  const since = `${today}T00:00:00.000Z`;
  const stalePaymentCutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const staleOtpCutoff = now.toISOString();
  const reminderIntervalDays = await resolveReminderIntervalDays();
  const customers = await getSupabase()
    .from('customers')
    .select('*')
    .in('status', ['active', 'defaulted', 'next_of_kin_pending', 'pending_screening'])
    .limit(1000);

  if (customers.error) throw mapSupabaseError(customers.error);

  const followUpPayments = await readPagedRows(
    () => getSupabase()
      .from('payments')
      .select('id,customer_id,status,payment_status,receipt,provider_transaction_id,provider_reference,deposit_credit,paygo_payment,paid_amount,date,provider_paid_at,created_at,ledger_state,revision_of,revision_number,correction_reason'),
    { limit: 5000 }
  );
  if (followUpPayments.error) throw mapSupabaseError(followUpPayments.error);
  const followUpPaymentsByCustomer = groupPaymentsByCustomer(
    dedupeFinancialPayments(followUpPayments.data || []).filter(isSuccessfulFinancialPayment)
  );

  const summary = {
    checked: customers.data?.length || 0,
    customerNotifications: 0,
    agentNotifications: 0,
    financeNotifications: 0,
    smsSent: 0,
    smsFailed: 0,
    statusUpdates: 0,
    expiredCustomerOtps: 0,
    expiredNextOfKinOtps: 0,
    stalePaymentRequests: 0,
    dryRun
  };
  const overdueSummaries = [];

  if (!dryRun) {
    const [expiredCustomerOtps, expiredNextOfKinOtps, stalePaymentRequests] = await Promise.all([
      getSupabase()
        .from('customers')
        .update({ customer_activation_otp_status: 'expired' })
        .eq('customer_activation_otp_status', 'sent')
        .lt('customer_activation_otp_expires_at', staleOtpCutoff)
        .select('id'),
      getSupabase()
        .from('customers')
        .update({ next_of_kin_otp_status: 'expired' })
        .eq('next_of_kin_otp_status', 'sent')
        .lt('next_of_kin_otp_expires_at', staleOtpCutoff)
        .select('id'),
      getSupabase()
        .from('payment_requests')
        .update({
          status: 'failed',
          failure_reason: 'Payment request expired before provider confirmation.',
          updated_at: now.toISOString()
        })
        .in('status', ['pending', 'processing'])
        .lt('created_at', stalePaymentCutoff)
        .select('id')
    ]);

    [expiredCustomerOtps, expiredNextOfKinOtps, stalePaymentRequests].forEach(({ error }) => {
      if (error) throw mapSupabaseError(error);
    });

    summary.expiredCustomerOtps = expiredCustomerOtps.data?.length || 0;
    summary.expiredNextOfKinOtps = expiredNextOfKinOtps.data?.length || 0;
    summary.stalePaymentRequests = stalePaymentRequests.data?.length || 0;
  }

  for (const customer of customers.data || []) {
    const arrears = customerArrearsSummary(customer, followUpPaymentsByCustomer, now);
    const dueAt = arrears.dueAt || resolveCustomerRepaymentDueAt(customer);
    const overdueDays = arrears.overdueDays;
    const balance = derivedCustomerBalance(customer);
    const amount = arrears.overdueAmount;

    if (customer.status === 'next_of_kin_pending') {
      const type = 'next_of_kin_pending';
      const message = `${customer.customer_name} is waiting for next-of-kin acceptance.`;
      if (!dryRun) {
        const finance = await createFinanceFollowUpNotification({
          customer,
          type,
          title: 'Next-of-kin acceptance pending',
          message,
          issue: 'Customer onboarding cannot continue until next-of-kin accepts.',
          followUp: 'Agent should contact the next-of-kin and confirm they received the reply-by-SMS request.',
          severity: 'warning',
          amount: 0,
          overdueDays: 0,
          since
        });
        if (finance) summary.financeNotifications += 1;
        const agent = await insertAgentNotificationOnce({ customer, message, since });
        if (agent) summary.agentNotifications += 1;
      }
      continue;
    }

    if (customer.status === 'pending_screening') {
      const type = 'screening_pending';
      if (!dryRun) {
        const finance = await createFinanceFollowUpNotification({
          customer,
          type,
          title: 'Screening still pending',
          message: `${customer.customer_name} is still pending automatic screening completion.`,
          issue: 'Automatic screening did not complete as expected.',
          followUp: 'Review KYC, next-of-kin acceptance, and SMS delivery status.',
          severity: 'warning',
          amount: 0,
          overdueDays: 0,
          since
        });
        if (finance) summary.financeNotifications += 1;
      }
      continue;
    }

    if (!dryRun && ['active', 'defaulted'].includes(customer.status) && Number(customer.overdue_days || 0) !== overdueDays) {
      const nextStatus = balance <= 0 ? 'paid' : overdueDays >= 3 ? 'defaulted' : 'active';
      const update = await getSupabase()
        .from('customers')
        .update({ overdue_days: overdueDays, status: nextStatus })
        .eq('id', customer.id);
      if (update.error) throw mapSupabaseError(update.error);
      summary.statusUpdates += 1;
      customer.overdue_days = overdueDays;
      customer.status = nextStatus;

      if (nextStatus === 'defaulted' || nextStatus === 'paid') {
        await syncPhoneLockerForCustomer(customer, {
          action: nextStatus === 'defaulted' ? 'lock' : 'unlock',
          state: nextStatus === 'defaulted' ? 'locked' : 'unlocked',
          sourcePortal: 'follow_up_job',
          accountReference: customer.national_id || customer.id || '',
          reason: nextStatus === 'defaulted'
            ? 'Account moved to defaulted after follow-up review.'
            : 'Account balance settled during follow-up review.'
        }).catch((lockerError) => {
          console.warn('[follow-up-locker-sync-failed]', customer.id, lockerError?.message || lockerError);
        });
      }
    }

    if (balance <= 0 || amount <= 0 || overdueDays < 2) continue;

    overdueSummaries.push({
      customerName: customer.customer_name,
      overdueDays,
      amount
    });

    const notificationType = 'payment_overdue';
    const title = 'Payment overdue';
    const customerMessage = `Your SALAMA LOCK Paygo payment is ${overdueDays} days overdue. Pay overdue amount KES ${amount.toLocaleString('en-KE')}. Current balance: KES ${balance.toLocaleString('en-KE')}.`;
    const agentMessage = `${customer.customer_name} (${customer.customer_phone || 'no phone'}) is ${overdueDays} days overdue. Follow up overdue amount KES ${amount.toLocaleString('en-KE')}. Balance KES ${balance.toLocaleString('en-KE')}.`;

    if (dryRun) continue;

    const customerNotification = await insertCustomerNotificationOnce({
      customerId: customer.id,
      title,
      message: customerMessage,
      type: notificationType,
      since
    });
    if (customerNotification) summary.customerNotifications += 1;

    const financeNotification = await createFinanceFollowUpNotification({
      customer,
      type: notificationType,
      title,
      message: `${customer.customer_name}: ${customerMessage}`,
      issue: overdueDays > 0 ? 'Customer has missed expected repayment.' : 'Customer has repayment due today.',
      followUp: 'Agent should confirm M-PESA prompt, Paybill payment, or customer support action.',
      severity: overdueDays >= 3 ? 'critical' : overdueDays > 0 ? 'warning' : 'info',
      amount,
      overdueDays,
      since
    });
    if (financeNotification) summary.financeNotifications += 1;

    const agentNotification = await insertAgentNotificationOnce({ customer, message: agentMessage, since });
    if (agentNotification) summary.agentNotifications += 1;

    const reminderClaim = await claimReminderSend(customer, {
      now,
      intervalDays: reminderIntervalDays,
      startAfterDays: 2
    });

    if (!reminderClaim.claimed) {
      logInfo('payment_reminder.sms_skipped', {
        customerId: customer.id,
        customerName: customer.customer_name || '',
        reason: reminderClaim.reason,
        overdueDays: reminderClaim.overdueDays,
        intervalDays: reminderIntervalDays
      });
      continue;
    }

    const [customerSms, agentSms] = await Promise.all([
      sendPaymentReminderSms({ customer, amount, dueDate: dueAt, overdueDays }).catch((error) => {
        logError('payment_reminder.sms_failed', {
          customerId: customer.id,
          customerName: customer.customer_name || '',
          error
        });
        return { delivered: false, error: error.message };
      }),
      customer.agent_id
        ? getSupabase().from('agents').select('phone').eq('agent_code', customer.agent_id).maybeSingle()
            .then((agentResult) => agentResult.data?.phone
              ? sendAgentFollowUpSms({
                  agentPhone: agentResult.data.phone,
                  customerId: customer.id,
                  customerName: customer.customer_name,
                  customerPhone: customer.customer_phone,
                  overdueDays,
                  amount,
                  balance,
                  reminderDate: now.toISOString().slice(0, 10)
                })
              : { delivered: false, skipped: true, reason: 'missing_agent_phone' })
            .catch((error) => {
              logError('payment_reminder.agent_sms_lookup_failed', {
                customerId: customer.id,
                customerName: customer.customer_name || '',
                error
              });
              return { delivered: false };
            })
        : Promise.resolve({ delivered: false, skipped: true, reason: 'missing_agent_assignment' })
    ]);

    const smsResults = [customerSms, agentSms];
    summary.smsSent += smsResults.filter((item) => item?.providerAccepted || item?.sent || item?.delivered).length;
    summary.smsFailed += smsResults.filter((item) => item && !item.skipped && !(item.providerAccepted || item.sent || item.delivered)).length;
  }

  if (!dryRun && overdueSummaries.length > 1) {
    const summaryNames = overdueSummaries.map((item) => item.customerName).filter(Boolean);
    const existingSummary = await getSupabase()
      .from('finance_notifications')
      .select('id')
      .eq('type', 'payment_overdue_batch')
      .gte('created_at', since)
      .limit(1);

    if (existingSummary.error) throw mapSupabaseError(existingSummary.error);

    if (!existingSummary.data?.length) {
      const batchNotification = await getSupabase()
        .from('finance_notifications')
        .insert({
          type: 'payment_overdue_batch',
          title: `${summaryNames.length} customers need follow-up`,
          message: `${summaryNames.join(', ')} are overdue and need finance follow-up.`,
          issue: 'Multiple customers missed their scheduled repayment.',
          follow_up: 'Use the finance follow-up action to contact the agent and send customer reminders.',
          customer_name: summaryNames.join(', '),
          amount: overdueSummaries.reduce((total, item) => total + Number(item.amount || 0), 0),
          overdue_days: overdueSummaries.reduce((max, item) => Math.max(max, Number(item.overdueDays || 0)), 0),
          source_portal: 'backend',
          severity: overdueSummaries.some((item) => Number(item.overdueDays || 0) >= 3) ? 'critical' : 'warning',
          status: 'unread'
        })
        .select()
        .single();

      if (batchNotification.error) throw mapSupabaseError(batchNotification.error);
      summary.financeNotifications += 1;
    }
  }

  return summary;
  } finally {
    await releaseSchedulerLock('automated_follow_ups', lock.holderId).catch(() => null);
  }
}

export async function runPhoneFinanceMonitor({ dryRun = false, limit = 1000 } = {}) {
  if (globalThis.__SALAMA_LOCKPhoneMonitorActive) {
    logWarn('phone_monitor.run_skipped_overlap', { dryRun, limit });
    return {
      checked: 0,
      processed: 0,
      locked: 0,
      unlocked: 0,
      skipped: 0,
      failed: 0,
      executionTimeMs: 0,
      dryRun,
      limit: Math.max(1, Math.min(Number(limit) || 1000, 2000)),
      overlapped: true
    };
  }

  const lock = await claimSchedulerLock('phone_finance_monitor', {
    ttlSeconds: 1800,
    metadata: { dryRun, limit }
  });

  if (!lock.acquired) {
    if (lock.error) {
      logWarn('phone_monitor.lock_rpc_error', {
        lockName: 'phone_finance_monitor',
        error: lock.error.message || String(lock.error)
      });
    } else {
      logWarn('phone_monitor.lock_unavailable', {
        lockName: 'phone_finance_monitor',
        holderId: lock.holderId || null,
        currentLockHolderId: lock.record?.holder_id || null,
        currentLockExpiresAt: lock.record?.expires_at || null
      });
    }
    return {
      checked: 0,
      processed: 0,
      locked: 0,
      unlocked: 0,
      skipped: 0,
      failed: 0,
      executionTimeMs: 0,
      dryRun,
      limit: Math.max(1, Math.min(Number(limit) || 1000, 2000)),
      overlapped: true,
      reason: lock.error ? 'lock_rpc_error' : 'lock_unavailable',
      rpcError: lock.error?.message || null,
      currentLockHolderId: lock.record?.holder_id || null,
      currentLockExpiresAt: lock.record?.expires_at || null
    };
  }

  globalThis.__SALAMA_LOCKPhoneMonitorActive = true;
  const startedAt = Date.now();
  const now = new Date();
  const batchSize = Math.max(1, Math.min(Number(limit) || 1000, 2000));
  let summary = {
    checked: 0,
    processed: 0,
    locked: 0,
    unlocked: 0,
    skipped: 0,
    failed: 0,
    executionTimeMs: 0,
    dryRun,
    limit: batchSize
  };

  try {
    console.info('[paygo-scheduler-run-start]', {
      currentServerTime: now.toISOString(),
      dryRun,
      batchSize,
      lockName: 'phone_finance_monitor',
      holderId: lock.holderId || null,
      lockExpiresAt: lock.expiresAt || null
    });
    logInfo('phone_monitor.started', {
      lockName: 'phone_finance_monitor',
      holderId: lock.holderId || null,
      dryRun,
      batchSize
    });

    const result = await getSupabase()
      .from('customers')
      .select('*')
      .eq('product_type', 'phone')
      .order('unlock_until', { ascending: true, nullsFirst: false })
      .order('updated_at', { ascending: true })
      .limit(batchSize);

    if (result.error) throw mapSupabaseError(result.error);

    const processedCustomerIds = new Set();

    for (const customer of result.data || []) {
      if (processedCustomerIds.has(customer.id)) {
        summary.skipped += 1;
        logWarn('phone_monitor.duplicate_customer_skipped', {
          customerId: customer.id,
          customerName: customer.customer_name || ''
        });
        continue;
      }
      processedCustomerIds.add(customer.id);

      summary.checked += 1;
      summary.processed += 1;

      try {
        const payments = await loadCustomerPaymentRows(customer.id);
        const dryRunPaygoState = buildPaygoCustomerState(customer, payments, now);
        const paygoRefresh = dryRun
          ? {
              customer,
              schedule: dryRunPaygoState.schedule,
              deviceAction: dryRunPaygoState.deviceAction,
              deviceState: dryRunPaygoState.deviceState,
              previousUnlockUntil: customer.unlock_until || customer.unlockUntilAt || customer.paygo_usage_ends_at || customer.paygoUsageEndsAt || null,
              patch: {
                unlock_until: dryRunPaygoState.schedule.unlockUntilAt || null
              }
            }
          : await refreshCustomerPaygoState(customer.id, {
              customer,
              payments,
              now
            });

        const action = paygoRefresh.deviceAction;
        const state = paygoRefresh.deviceState;
        const schedulerLog = buildPaygoRuntimeLog({
          customer: paygoRefresh.customer,
          schedule: paygoRefresh.schedule,
          previousUnlockUntil: paygoRefresh.previousUnlockUntil,
          newUnlockUntil: paygoRefresh.patch?.unlock_until || paygoRefresh.customer?.unlock_until || null,
          action,
          deviceState: state,
          source: 'phone_finance_monitor',
          now
        });

        console.info('[paygo-scheduler-customer]', schedulerLog);

        if (dryRun) {
          summary.skipped += 1;
          continue;
        }

        const lockerResult = await syncPhoneLockerForCustomer(paygoRefresh.customer, {
          action,
          state,
          sourcePortal: 'phone_finance_monitor',
          reason: action === 'lock'
            ? 'Unlock expiry reached. Backend monitor triggered a lock.'
            : 'Payment extension is active. Backend monitor confirmed unlock state.',
          accountReference: customer.national_id || customer.id || '',
          notifyDevice: true
        });

        if (lockerResult?.success && action === 'lock') {
          await logDeviceEvent('PAYMENT_EXPIRED', {
            customerId: customer.id,
            deviceId: lockerResult.registeredId || customer.id,
            productId: lockerResult.productId || null,
            honorTaskId: lockerResult.honorTaskId || lockerResult.requestId || null,
            honorResponse: lockerResult.honorLastResponse || lockerResult.response || null,
            state,
            paygo: schedulerLog
          }).catch(() => null);
        }

        console.info('[paygo-scheduler-result]', {
          ...schedulerLog,
          lockerSuccess: Boolean(lockerResult?.success),
          lockerAction: lockerResult?.action || action,
          lockerSkipped: Boolean(lockerResult?.skipped),
          commandSent: Boolean(lockerResult?.commandSent),
          commandStatus: lockerResult?.commandStatus || null,
          skipReason: lockerResult?.skipReason || null,
          confirmedCommand: Boolean(lockerResult?.confirmedCommand),
          recentCommand: Boolean(lockerResult?.recentCommand),
          commandAgeMs: lockerResult?.commandAgeMs ?? null,
          commandCooldownMs: lockerResult?.commandCooldownMs ?? null,
          lockerStatus: lockerResult?.syncStatus || lockerResult?.status || null,
          honorTaskId: lockerResult?.honorTaskId || null,
          providerRequestId: lockerResult?.providerRequestId || lockerResult?.requestId || null,
          providerTaskId: lockerResult?.providerTaskId || lockerResult?.honorTaskId || null,
          providerRequestUrl: lockerResult?.providerRequestUrl || null,
          lastCommandAt: lockerResult?.lastCommandAt || null,
          lastVerifiedAt: lockerResult?.lastVerifiedAt || null,
          honorLockStatus: lockerResult?.providerLockStatus || lockerResult?.finalDeviceState || lockerResult?.honorLockStatus || null,
          providerState: lockerResult?.providerState || null,
          providerLockStatus: lockerResult?.providerLockStatus || lockerResult?.finalDeviceState || null,
          honorResponse: safeJson(lockerResult?.honorLastResponse || lockerResult?.response || null),
          finalDeviceState: lockerResult?.finalDeviceState || lockerResult?.providerLockStatus || lockerResult?.honorLockStatus || state || null
        });

        if (lockerResult?.syncStatus === 'failed' || lockerResult?.commandStatus === 'failed' || lockerResult?.status === 'failed' || lockerResult?.success === false) {
          summary.failed += 1;
        } else if (lockerResult?.action === 'lock' || action === 'lock') {
          summary.locked += 1;
        } else if (lockerResult?.action === 'unlock' || action === 'unlock') {
          summary.unlocked += 1;
        } else {
          summary.skipped += 1;
        }
      } catch (error) {
        summary.failed += 1;
        console.warn('[phone-finance-monitor-failed]', {
          customerId: customer.id,
          customerName: customer.customer_name || '',
          error: error?.message || error
        });
      }
    }

    summary.executionTimeMs = Date.now() - startedAt;
    console.info('[paygo-scheduler-run-complete]', {
      currentServerTime: now.toISOString(),
      dryRun,
      summary
    });
    logInfo('phone_monitor.finished', {
      lockName: 'phone_finance_monitor',
      holderId: lock.holderId || null,
      dryRun,
      processedCustomers: summary.processed,
      customersChecked: summary.checked,
      unlocked: summary.unlocked,
      locked: summary.locked,
      skipped: summary.skipped,
      failed: summary.failed,
      executionTimeMs: summary.executionTimeMs
    });

    return summary;
  } catch (error) {
    summary.failed += 1;
    summary.executionTimeMs = Date.now() - startedAt;
    const errorMessage = error?.message || String(error);
    logError('phone_monitor.failed', {
      lockName: 'phone_finance_monitor',
      holderId: lock.holderId || null,
      dryRun,
      limit: batchSize,
      processedCustomers: summary.processed,
      customersChecked: summary.checked,
      unlocked: summary.unlocked,
      locked: summary.locked,
      skipped: summary.skipped,
      failed: summary.failed,
      executionTimeMs: summary.executionTimeMs,
      error: errorMessage
    });
    console.info('[paygo-scheduler-run-complete]', {
      currentServerTime: now.toISOString(),
      dryRun,
      summary,
      error: errorMessage
    });
    return {
      ...summary,
      reason: 'monitor_failed',
      error: errorMessage
    };
  } finally {
    globalThis.__SALAMA_LOCKPhoneMonitorActive = false;
    const release = await releaseSchedulerLock('phone_finance_monitor', lock.holderId).catch((error) => {
      logWarn('phone_monitor.lock_release_failed', {
        lockName: 'phone_finance_monitor',
        holderId: lock.holderId || null,
        error: error?.message || String(error)
      });
      return { released: false, error };
    });
    if (release?.released) {
      logInfo('phone_monitor.lock_released', {
        lockName: 'phone_finance_monitor',
        holderId: lock.holderId || null
      });
    }
  }
}

export async function getDashboard(query = {}) {
  const supabase = getSupabase();
  const productType = normalizeDashboardProductType(query.productType || query.product_type || query.type);
  await ensureMissingSaleCommissions({ productType }).catch((error) => {
    logWarn('dashboard.sale_commission_backfill_failed', {
      productType: productType || 'all',
      error
    });
  });

  if (productType) {
    const [payments, customers, commissions, reconciliation] = await Promise.all([
      readPagedRows(() => supabase.from('payments').select('id,customer_id,customer_name,customer_phone,agent_name,agent_id,bike_model,product_model,serial_number,chassis_number,product_type,deposit_credit,paygo_payment,paid_amount,amount,date,status,payment_status,method,source_portal,receipt,provider_reference,provider_transaction_id,created_at,ledger_state,revision_of,revision_number,correction_reason').order('date', { ascending: false }), { limit: 5000 }),
      readPagedRows(() => supabase.from('customers').select('id,customer_name,agent_name,agent_id,status,application_status,total_payable,paid_amount,balance,overdue_days,daily_installment,bike_model,product_model,serial_number,chassis_number,product_type,due_date,created_at').order('created_at', { ascending: false }), { limit: 5000 }),
      readPagedRows(() => supabase.from('commissions').select('id,payment_id,amount,status,product_type,product_model,serial_number,chassis_number,earned_at').order('earned_at', { ascending: false }), { limit: 5000 }),
      readPagedRows(() => supabase.from('reconciliation').select('id,payment_id,receipt,customer_name,national_id,provider_amount,system_amount,date,status').order('date', { ascending: false }), { limit: 5000 })
    ]);

    [payments, customers, commissions, reconciliation].forEach(({ error }) => {
      if (error) throw mapSupabaseError(error);
    });

    const resolvedPayments = mergePaymentRowsWithCustomerFallback(payments.data || [], customers.data || []);
    const paymentRecords = resolvedPayments.filter((payment) => recordMatchesScope(payment, productType));
    const filteredCustomers = (customers.data || []).filter((customer) => recordMatchesScope(customer, productType));
    const commissionRecords = commissions.data || [];
    const generatedCommissions = buildSaleCommissionsFromPayments(resolvedPayments, customers.data || [])
      .filter((commission) => commissionMatchesProductScope(commission, productType));
    const filteredCommissions = mergeDashboardCommissionRecords(commissionRecords, generatedCommissions)
      .filter((commission) => commissionMatchesProductScope(commission, productType));
    const filteredReconciliation = reconciliation.data || [];
    const reconciliationPaymentIds = [...new Set(filteredReconciliation.map((record) => record.payment_id).filter(Boolean))];
    let scopedReconciliation = filteredReconciliation;

    if (reconciliationPaymentIds.length > 0) {
      const paymentTypes = await supabase.from('payments').select('id,product_type').in('id', reconciliationPaymentIds);
      if (paymentTypes.error) throw mapSupabaseError(paymentTypes.error);
      const paymentTypeMap = new Map((paymentTypes.data || []).map((payment) => [payment.id, normalizeDashboardProductType(payment.product_type)]));
      scopedReconciliation = filteredReconciliation.filter((record) => {
        const type = paymentTypeMap.get(record.payment_id);
        return type === productType || (productType === 'bike' && type === '');
      });
    } else {
      scopedReconciliation = [];
    }

    return buildDashboard(paymentRecords, filteredCustomers, filteredCommissions, scopedReconciliation);
  }

  const [payments, customers, commissions, reconciliation] = await Promise.all([
    readPagedRows(() => supabase.from('payments').select('id,customer_id,customer_name,customer_phone,agent_name,agent_id,bike_model,product_model,serial_number,chassis_number,product_type,deposit_credit,paygo_payment,paid_amount,amount,date,status,payment_status,method,source_portal,receipt,provider_reference,provider_transaction_id,created_at,ledger_state,revision_of,revision_number,correction_reason').order('date', { ascending: false }), { limit: 5000 }),
    readPagedRows(() => supabase.from('customers').select('id,customer_name,agent_name,agent_id,status,application_status,total_payable,paid_amount,balance,overdue_days,daily_installment,bike_model,product_model,serial_number,chassis_number,product_type,due_date,created_at').order('created_at', { ascending: false }), { limit: 5000 }),
    readPagedRows(() => supabase.from('commissions').select('id,payment_id,amount,status,product_type,product_model,serial_number,chassis_number,earned_at').order('earned_at', { ascending: false }), { limit: 5000 }),
    readPagedRows(() => supabase.from('reconciliation').select('payment_id,receipt,customer_name,national_id,provider_amount,system_amount,date,status').order('date', { ascending: false }), { limit: 5000 })
  ]);

  [payments, customers, commissions, reconciliation].forEach(({ error }) => {
    if (error) throw mapSupabaseError(error);
  });

  const paymentRecords = mergePaymentRowsWithCustomerFallback(payments.data || [], customers.data || []);
  const commissionRecords = commissions.data || [];
  const generatedCommissions = buildSaleCommissionsFromPayments(paymentRecords, customers.data || []);
  const dashboardCommissions = mergeDashboardCommissionRecords(commissionRecords, generatedCommissions);

  return buildDashboard(paymentRecords, customers.data || [], dashboardCommissions, reconciliation.data || []);
}
