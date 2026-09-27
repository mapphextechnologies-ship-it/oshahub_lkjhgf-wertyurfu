import { getSupabase } from './supabase.js';
import { logInfo, logWarn } from './logging.js';

function parsePositiveInteger(value, fallback = 3, max = 30) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.trunc(parsed), max);
}

function utcDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function resolveNow(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function daysBetween(dateValue, now = new Date()) {
  if (!dateValue) return 0;
  const safeNow = resolveNow(now);
  const today = new Date(`${utcDay(safeNow)}T12:00:00.000Z`);
  const target = new Date(`${String(dateValue).slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(target.getTime())) return 0;
  return Math.floor((today - target) / (24 * 60 * 60 * 1000));
}

export function resolveRepaymentDueAt(customer = {}) {
  const paygoDueAt = customer.paygo_next_due_at || customer.paygoNextDueAt || '';
  const arrearsDueAt = customer.due_date || customer.dueDate || '';
  if (arrearsDueAt && Number(customer.overdue_days ?? customer.overdueDays ?? 0) > 0) {
    return arrearsDueAt;
  }
  const scheduleStatus = String(customer.paygo_schedule_status || customer.paygoScheduleStatus || '')
    .trim()
    .toLowerCase();

  if (paygoDueAt && ['active', 'due', 'locked', 'paid'].includes(scheduleStatus)) {
    return paygoDueAt;
  }

  const lastPaymentAt = customer.last_payment_date || customer.lastPaymentDate || '';
  const nextDailyDueAt = lastPaymentAt ? addDays(lastPaymentAt, 1) : null;
  return nextDailyDueAt || paygoDueAt || customer.due_date || customer.dueDate || '';
}

export async function resolveReminderIntervalDays() {
  const envValue = String(
    process.env.PAYMENT_REMINDER_INTERVAL_DAYS ||
    process.env.REMINDER_INTERVAL_DAYS ||
    ''
  ).trim();

  const envDays = parsePositiveInteger(envValue, 0);
  if (envDays > 0) return envDays;

  try {
    const { data, error } = await getSupabase()
      .from('system_settings')
      .select('settings_json')
      .eq('section', 'reminders')
      .maybeSingle();

    if (!error && data?.settings_json && typeof data.settings_json === 'object') {
      const settings = data.settings_json;
      const configured = parsePositiveInteger(
        settings.reminderDaysBeforeDueDate ||
        settings.reminder_interval_days ||
        settings.reminderIntervalDays ||
        settings.paymentReminderIntervalDays,
        0
      );
      if (configured > 0) return configured;
    }
  } catch {
    // Fall back to the default below.
  }

  return 3;
}

function buildReminderContext(customer = {}, now = new Date(), intervalDays = 3, startAfterDays = 2) {
  const safeNow = resolveNow(now);
  const dueAt = resolveRepaymentDueAt(customer);
  const overdueDays = Math.max(0, daysBetween(dueAt, safeNow));
  const lastReminderSentAt = customer.last_reminder_sent_at ? new Date(customer.last_reminder_sent_at) : null;
  const nextReminderDue = customer.next_reminder_due ? new Date(customer.next_reminder_due) : null;
  const today = utcDay(safeNow);
  const lastReminderDay = lastReminderSentAt ? utcDay(lastReminderSentAt) : null;
  const minimumOverdueDays = Math.max(1, parsePositiveInteger(startAfterDays, 2, 30));
  const eligibleByAge = overdueDays >= minimumOverdueDays;
  const eligibleBySchedule = !nextReminderDue || Number.isNaN(nextReminderDue.getTime()) || nextReminderDue.getTime() <= safeNow.getTime();

  if (!customer?.id) {
    return {
      eligible: false,
      reason: 'missing_customer',
      overdueDays,
      intervalDays,
      startAfterDays: minimumOverdueDays
    };
  }

  if (Number(customer.balance || 0) <= 0 || String(customer.status || '').toLowerCase() === 'paid') {
    return {
      eligible: false,
      reason: 'account_settled',
      overdueDays,
      intervalDays,
      startAfterDays: minimumOverdueDays
    };
  }

  if (!eligibleByAge) {
    return {
      eligible: false,
      reason: 'too_soon',
      overdueDays,
      intervalDays,
      startAfterDays: minimumOverdueDays
    };
  }

  if (lastReminderDay === today) {
    return {
      eligible: false,
      reason: 'already_sent_today',
      overdueDays,
      intervalDays,
      startAfterDays: minimumOverdueDays
    };
  }

  if (!eligibleBySchedule) {
    return {
      eligible: false,
      reason: 'not_due_yet',
      overdueDays,
      intervalDays,
      startAfterDays: minimumOverdueDays,
      nextReminderDue: nextReminderDue?.toISOString() || null
    };
  }

  return {
    eligible: true,
    reason: 'due',
    overdueDays,
    intervalDays,
    startAfterDays: minimumOverdueDays,
    lastReminderSentAt: lastReminderSentAt?.toISOString() || null,
    nextReminderDue: nextReminderDue?.toISOString() || null,
    nextReminderScheduledFor: addDays(safeNow, intervalDays),
    reminderCount: Number(customer.reminder_count || 0)
  };
}

export async function claimReminderSend(customer, {
  now = new Date(),
  intervalDays = 3,
  startAfterDays = 2
} = {}) {
  const safeNow = resolveNow(now);
  const context = buildReminderContext(customer, safeNow, intervalDays, startAfterDays);
  const nowIso = safeNow.toISOString();
  const nextReminderDue = context.nextReminderScheduledFor || addDays(safeNow, intervalDays);

  if (!context.eligible) {
    logWarn('payment_reminder.skipped', {
      customerId: customer?.id || null,
      customerName: customer?.customer_name || null,
      reason: context.reason,
      overdueDays: context.overdueDays,
      intervalDays
    });
    return { claimed: false, ...context };
  }

  const claim = await getSupabase()
    .from('customers')
    .update({
      last_reminder_sent_at: nowIso,
      next_reminder_due: nextReminderDue,
      reminder_count: Number(customer.reminder_count || 0) + 1,
      updated_at: nowIso
    })
    .eq('id', customer.id)
    .or(`next_reminder_due.is.null,next_reminder_due.lte.${nowIso}`)
    .select('id,last_reminder_sent_at,next_reminder_due,reminder_count')
    .maybeSingle();

  if (claim.error) {
    logWarn('payment_reminder.claim_failed', {
      customerId: customer?.id || null,
      customerName: customer?.customer_name || null,
      reason: claim.error.message || String(claim.error)
    });
    return { claimed: false, ...context, error: claim.error };
  }

  if (!claim.data) {
    logWarn('payment_reminder.duplicate_prevented', {
      customerId: customer?.id || null,
      customerName: customer?.customer_name || null,
      reason: 'already_claimed',
      overdueDays: context.overdueDays,
      intervalDays
    });
    return { claimed: false, ...context, reason: 'already_claimed' };
  }

  logInfo('payment_reminder.claimed', {
    customerId: customer?.id || null,
    customerName: customer?.customer_name || null,
    lastReminderSentAt: claim.data.last_reminder_sent_at,
    nextReminderDue: claim.data.next_reminder_due,
    reminderCount: claim.data.reminder_count
  });

  return {
    claimed: true,
    ...context,
    nextReminderDue: claim.data.next_reminder_due,
    reminderCount: claim.data.reminder_count
  };
}
