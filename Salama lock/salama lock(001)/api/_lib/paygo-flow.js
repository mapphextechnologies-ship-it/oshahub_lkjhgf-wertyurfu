import { computeCustomerArrears, computePaygoSchedule } from '../../src/utils/paygo.js';

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeStateList(...values) {
  for (const value of values) {
    const normalized = normalizeStatus(value);
    if (normalized) return normalized;
  }
  return '';
}

function toIsoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function buildPaygoCustomerState(customer = {}, payments = [], now = new Date()) {
  const schedule = computePaygoSchedule({ customer, payments, now });
  const arrears = computeCustomerArrears({ customer, payments, now });
  const currentStatus = normalizeStatus(customer.status);
  const hasPaid = schedule.totalPaid > 0;
  const nextStatus = hasPaid
    ? (schedule.isComplete ? 'paid' : arrears.overdueDays >= 3 ? 'defaulted' : schedule.isLocked && !arrears.hasArrears ? 'defaulted' : 'active')
    : currentStatus || 'active';
  const deviceState = schedule.isLocked ? 'locked' : 'unlocked';
  const deviceAction = deviceState === 'locked' ? 'lock' : 'unlock';

  return {
    schedule,
    arrears,
    deviceState,
    deviceAction,
    nextStatus,
    patch: {
      paid_amount: schedule.totalPaid,
      balance: schedule.remainingBalance,
      overdue_days: arrears.overdueDays,
      status: nextStatus,
      due_date: arrears.hasArrears && customer.due_date
        ? String(customer.due_date).slice(0, 10)
        : schedule.nextDueAt
          ? schedule.nextDueAt.slice(0, 10)
          : customer.due_date || null,
      last_payment_date: schedule.lastPaymentAt ? schedule.lastPaymentAt.slice(0, 10) : customer.last_payment_date || null,
      paygo_started_at: schedule.startedAt || null,
      paygo_first_payment_at: schedule.firstPaymentAt || null,
      paygo_last_payment_at: schedule.lastPaymentAt || null,
      paygo_next_due_at: schedule.nextDueAt || null,
      paygo_usage_ends_at: schedule.usageEndsAt || null,
      unlock_until: schedule.unlockUntilAt || schedule.usageEndsAt || null,
      paygo_grace_until_at: schedule.graceUntilAt || null,
      paygo_installments_paid: schedule.installmentsPaid,
      paygo_total_installments: schedule.totalInstallments,
      paygo_frequency_hours: schedule.frequencyHours,
      paygo_grace_period_hours: schedule.gracePeriodHours,
      paygo_schedule_status: schedule.scheduleStatus,
      updated_at: toIsoDate(now) || new Date().toISOString()
    }
  };
}

export function resolveHonorSyncDecision({
  profile = {},
  action = '',
  desiredState = ''
} = {}) {
  const expectedAction = normalizeStatus(action);
  const expectedState = normalizeStatus(desiredState || (expectedAction === 'lock' ? 'locked' : expectedAction === 'unlock' ? 'unlocked' : ''));
  const currentAction = normalizeStatus(
    profile.last_command_action ||
    profile.locker_sync_payload?.action ||
    profile.locker_sync_payload?.lastAction ||
    profile.honor_last_response?.action
  );
  const currentState = normalizeStatus(
    profile.device_status ||
    profile.last_known_honor_status ||
    profile.lock_status ||
    profile.honor_lock_status ||
    profile.locker_sync_payload?.deviceStatus ||
    profile.locker_sync_payload?.lockStatus ||
    profile.locker_sync_payload?.honorLockStatus ||
    profile.honor_last_response?.deviceStatus ||
    profile.honor_last_response?.lockStatus ||
    profile.honor_last_response?.honorLockStatus
  );
  const currentSyncStatus = normalizeStatus(profile.locker_sync_status || profile.honor_sync_status || profile.sync_status);

  const matchesDesiredState = Boolean(expectedState && currentState === expectedState);
  const matchesDesiredAction = Boolean(expectedAction && (!currentAction || currentAction === expectedAction));
  const isSynced = currentSyncStatus === 'synced';
  const isPending = currentSyncStatus === 'pending';

  return {
    expectedAction,
    expectedState,
    currentAction,
    currentState,
    currentSyncStatus,
    shouldSkip: Boolean(isSynced && matchesDesiredState && matchesDesiredAction),
    shouldRefresh: Boolean(isPending && matchesDesiredState && matchesDesiredAction),
    shouldRetry: currentSyncStatus === 'failed'
  };
}

function readPhoneLockerCommandTimestamp(profile = {}, action = '') {
  const normalizedAction = normalizeStatus(action);
  if (normalizedAction === 'unlock') {
    return normalizeStateList(
      profile.last_unlock_command_at,
      profile.lastUnlockCommandAt,
      profile.last_command_at,
      profile.lastCommandAt,
      profile.locker_sync_payload?.last_unlock_command_at,
      profile.locker_sync_payload?.lastUnlockCommandAt,
      profile.locker_sync_payload?.last_command_at,
      profile.locker_sync_payload?.lastCommandAt
    );
  }

  if (normalizedAction === 'lock') {
    return normalizeStateList(
      profile.last_lock_command_at,
      profile.lastLockCommandAt,
      profile.last_command_at,
      profile.lastCommandAt,
      profile.locker_sync_payload?.last_lock_command_at,
      profile.locker_sync_payload?.lastLockCommandAt,
      profile.locker_sync_payload?.last_command_at,
      profile.locker_sync_payload?.lastCommandAt
    );
  }

  return normalizeStateList(
    profile.last_command_at,
    profile.lastCommandAt,
    profile.locker_sync_payload?.last_command_at,
    profile.locker_sync_payload?.lastCommandAt
  );
}

function readPhoneLockerCurrentState(profile = {}) {
  return normalizeStateList(
    profile.provider_lock_status,
    profile.final_device_state,
    profile.device_status,
    profile.last_known_honor_status,
    profile.lock_status,
    profile.honor_lock_status,
    profile.locker_sync_payload?.providerLockStatus,
    profile.locker_sync_payload?.finalDeviceState,
    profile.locker_sync_payload?.deviceStatus,
    profile.locker_sync_payload?.lockStatus,
    profile.locker_sync_payload?.honorLockStatus,
    profile.honor_last_response?.stateInfo,
    profile.honor_last_response?.state,
    profile.honor_last_response?.lockStatus,
    profile.honor_last_response?.deviceStatus
  );
}

function readPhoneLockerCommandStatus(profile = {}) {
  return normalizeStateList(
    profile.command_status,
    profile.commandStatus,
    profile.last_command_status,
    profile.lastCommandStatus,
    profile.locker_sync_payload?.commandStatus,
    profile.locker_sync_payload?.command_status,
    profile.honor_last_response?.commandStatus,
    profile.honor_last_response?.command_status
  );
}

export function resolveLockerCommandDecision({
  profile = {},
  action = '',
  desiredState = '',
  currentState = '',
  useProfileState = true,
  forceCommand = false,
  forceUnlock = false
} = {}) {
  const expectedAction = normalizeStatus(action);
  const expectedState = normalizeStatus(
    desiredState || (expectedAction === 'lock' ? 'locked' : expectedAction === 'unlock' ? 'unlocked' : '')
  );
  const resolvedCurrentState = normalizeStatus(useProfileState ? (currentState || readPhoneLockerCurrentState(profile)) : currentState);
  const commandStatus = normalizeStatus(readPhoneLockerCommandStatus(profile));
  const commandAt = readPhoneLockerCommandTimestamp(profile, expectedAction);
  const configuredCommandCooldownMs = Number(process.env.PHONE_LOCKER_COMMAND_COOLDOWN_MS);
  const commandCooldownMs = Number.isFinite(configuredCommandCooldownMs) && configuredCommandCooldownMs >= 0
    ? configuredCommandCooldownMs
    : 300000;
  const commandAgeMs = commandAt ? Date.now() - Date.parse(commandAt) : NaN;
  const lastVerifiedAt = normalizeStateList(
    profile.last_verified_at,
    profile.lastVerifiedAt,
    profile.locker_sync_payload?.last_verified_at,
    profile.locker_sync_payload?.lastVerifiedAt,
    profile.honor_last_response?.lastVerifiedAt
  );
  const isPendingState = resolvedCurrentState === 'pending';
  const recentCommand = Boolean(
    commandAt &&
    Number.isFinite(commandAgeMs) &&
    commandCooldownMs > 0 &&
    commandAgeMs < commandCooldownMs
  );
  const recentCommandWithKnownState = Boolean(
    recentCommand &&
    resolvedCurrentState &&
    resolvedCurrentState !== 'unknown'
  );
  const matchesDesiredFinalState = Boolean(
    expectedState &&
    resolvedCurrentState &&
    resolvedCurrentState === expectedState &&
    ['locked', 'unlocked', 'registered', 'synced'].includes(resolvedCurrentState)
  );
  const confirmedCommand = Boolean(
    expectedAction &&
    expectedState &&
    commandAt &&
    lastVerifiedAt &&
    commandStatus === 'success' &&
    resolvedCurrentState === expectedState
  );
  const unlockBypass = expectedAction === 'unlock' && Boolean(forceUnlock);
  const shouldSkip = Boolean(
    !forceCommand &&
    !unlockBypass &&
    (confirmedCommand || isPendingState || recentCommandWithKnownState || matchesDesiredFinalState)
  );

  return {
    expectedAction,
    expectedState,
    currentState: resolvedCurrentState || 'unknown',
    commandStatus,
    commandAt: commandAt || '',
    commandAgeMs: Number.isFinite(commandAgeMs) ? commandAgeMs : null,
    commandCooldownMs,
    lastVerifiedAt: lastVerifiedAt || '',
    confirmedCommand,
    recentCommand,
    forceUnlock: unlockBypass,
    shouldSkip,
    skipReason: shouldSkip
      ? confirmedCommand
        ? 'confirmed-command-already-matched'
        : isPendingState
          ? 'provider-state-pending'
          : matchesDesiredFinalState
            ? 'provider-state-matched'
          : recentCommandWithKnownState
            ? 'recent-command-cooldown'
            : 'state-mismatch'
      : unlockBypass
        ? 'force-unlock'
        : matchesDesiredFinalState
          ? 'provider-state-matched'
          : isPendingState
            ? 'provider-state-pending'
            : recentCommandWithKnownState
              ? 'recent-command-cooldown'
            : 'state-mismatch'
  };
}
