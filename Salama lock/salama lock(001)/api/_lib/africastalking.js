import crypto from 'node:crypto';
import { logError, logInfo, logWarn } from './logging.js';
import { getSmsDeliveryReport, recordSmsDispatch } from './sms-delivery-reports.js';
import { getSupabase, hasSupabaseConfig } from './supabase.js';

const AFRICAS_TALKING_LIVE_URL = 'https://api.africastalking.com/version1/messaging';
const AFRICAS_TALKING_SANDBOX_URL = 'https://api.sandbox.africastalking.com/version1/messaging';
const SMS_DEDUP_LOCKS_TABLE = 'sms_send_locks';
const SMS_COOLDOWN_WINDOW_MS = 24 * 60 * 60 * 1000;
const SMS_DEDUP_MEMORY = new Map();
let smsDedupLocksTableState = 'unknown';
let smsDedupEventColumnsState = 'unknown';

export function resetSmsIdempotencyMemoryForTests() {
  if (isProductionMode()) return false;
  SMS_DEDUP_MEMORY.clear();
  smsDedupLocksTableState = 'unknown';
  smsDedupEventColumnsState = 'unknown';
  return true;
}

function envValue(name) {
  return String(process.env[name] || '').trim();
}

function maskValue(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= 8) return `${text.slice(0, 2)}...`;
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function username() {
  return envValue('AFRICASTALKING_USERNAME') || envValue('AFRICAS_TALKING_USERNAME');
}

function apiKey() {
  return envValue('AFRICASTALKING_API_KEY') || envValue('AFRICAS_TALKING_API_KEY');
}

function senderId() {
  return envValue('AFRICASTALKING_SENDER_ID') || envValue('AFRICAS_TALKING_SENDER_ID');
}

function nextOfKinReplySenderId() {
  return envValue('AFRICASTALKING_NEXT_OF_KIN_SENDER_ID')
    || envValue('AFRICASTALKING_REPLY_SENDER_ID')
    || senderId();
}

function transactionalSenderId() {
  return senderId()
    || envValue('AFRICASTALKING_REPLY_SENDER_ID')
    || envValue('AFRICASTALKING_NEXT_OF_KIN_SENDER_ID');
}

function isProductionMode() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function useSandbox() {
  return ['1', 'true', 'yes', 'sandbox'].includes(
    String(envValue('AFRICASTALKING_SANDBOX') || envValue('AFRICAS_TALKING_SANDBOX')).toLowerCase()
  ) || username() === 'sandbox';
}

function baseUrl() {
  return envValue('AFRICASTALKING_BASE_URL')
    || envValue('AFRICAS_TALKING_BASE_URL')
    || (useSandbox() ? AFRICAS_TALKING_SANDBOX_URL : AFRICAS_TALKING_LIVE_URL);
}

function requestTimeoutMs() {
  const configured = Number(envValue('AFRICASTALKING_TIMEOUT_MS') || envValue('AFRICAS_TALKING_TIMEOUT_MS') || 15000);
  return Number.isFinite(configured) && configured > 0 ? Math.min(Math.trunc(configured), 120000) : 15000;
}

function africasTalkingConfigDiagnostics() {
  const configuredTransactionalSenderId = transactionalSenderId();
  return {
    username: maskValue(username()),
    usernameConfigured: Boolean(username()),
    apiKeyConfigured: Boolean(apiKey()),
    apiKeyLength: apiKey().length,
    senderId: maskValue(senderId()),
    senderIdConfigured: Boolean(senderId()),
    transactionalSenderId: maskValue(configuredTransactionalSenderId),
    transactionalSenderIdConfigured: Boolean(configuredTransactionalSenderId),
    sandbox: useSandbox(),
    baseUrl: baseUrl(),
    timeoutMs: requestTimeoutMs(),
    deliveryReady: Boolean(username() && apiKey() && (useSandbox() || configuredTransactionalSenderId || !isProductionMode())),
    configured: hasAfricasTalkingSmsConfig()
  };
}

export function smsConfigDiagnostics() {
  return {
    provider: 'africastalking',
    configured: hasAfricasTalkingSmsConfig(),
    verifyConfigured: false,
    africasTalking: africasTalkingConfigDiagnostics()
  };
}

export function hasAfricasTalkingSmsConfig() {
  return Boolean(username() && apiKey());
}

export function hasSmsConfig() {
  return hasAfricasTalkingSmsConfig();
}

export function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('254')) return `+${digits}`;
  if (digits.startsWith('0')) return `+254${digits.slice(1)}`;
  if (digits.length === 9) return `+254${digits}`;
  return String(phone || '').trim().startsWith('+') ? String(phone).trim() : `+${digits}`;
}

export function normalizeKenyanPhone(phone) {
  const text = String(phone || '').trim();
  if (!text) return '';
  const compact = text.replace(/[\s()-]+/g, '');
  if (!/^\+?\d+$/.test(compact)) return '';

  const digits = compact.replace(/\D/g, '');
  if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
  if (/^254[17]\d{8}$/.test(digits)) return `+${digits}`;
  return '';
}

function cleanProviderMessageId(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (['none', 'null', 'undefined', 'n/a', 'na'].includes(text.toLowerCase())) return '';
  return text;
}

export function normalizeSmsProviderErrorMessage(message) {
  const rawMessage = String(message || '').trim();
  const normalizedMessage = rawMessage.toLowerCase().replace(/\s+/g, '');

  if (normalizedMessage.includes('userinblacklist') || normalizedMessage.includes('blacklist') || normalizedMessage.includes('optedout') || normalizedMessage.includes('unsubscribed')) {
    return 'The recipient phone number is blacklisted or opted out from Africa\'s Talking SMS. Ask the user to opt back in or use another verified phone number.';
  }

  if (normalizedMessage.includes('invalidphonenumber') || normalizedMessage.includes('invalidphone')) {
    return 'The recipient phone number is invalid. Update the phone number and try again.';
  }

  if (normalizedMessage.includes('invalidsenderid')) {
    return 'Africa\'s Talking rejected the configured sender ID. Confirm SALAMA LOCKPAYGO is approved on the Africa\'s Talking account.';
  }

  if (normalizedMessage.includes('insufficient') && normalizedMessage.includes('credit')) {
    return 'Africa\'s Talking has insufficient SMS balance. Top up the account and try again.';
  }

  return rawMessage || 'SMS delivery failed.';
}

export function publicAppBaseUrl() {
  let configured = String(
    process.env.PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    process.env.VERCEL_BRANCH_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '');
  if (!configured) return 'https://www.SALAMA LOCKpay.com';
  configured = configured.replace(/^(https?:)\/+/i, '$1//');
  configured = configured.replace(/^\/+/, '');
  return configured.startsWith('http') ? configured : `https://${configured}`;
}

function normalizeSmsMessage(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function smsDedupWindowMs(purpose = 'general') {
  void purpose;
  return SMS_COOLDOWN_WINDOW_MS;
}

function smsDedupePhone(phone) {
  return normalizeKenyanPhone(phone) || normalizePhone(phone) || String(phone || '').trim();
}

function resolveSmsEventId({ phone, purpose, message, eventId, dedupeKey, requestId } = {}) {
  const explicitEventId = normalizeSmsMessage(eventId) || normalizeSmsMessage(dedupeKey);
  if (explicitEventId) return explicitEventId;
  const normalizedRequestId = normalizeSmsMessage(requestId);
  if (normalizedRequestId) return `${String(purpose || 'general').trim().toLowerCase() || 'general'}:${normalizedRequestId}`;
  return `content:${sha256Hex([
    smsDedupePhone(phone),
    String(purpose || 'general').trim().toLowerCase() || 'general',
    normalizeSmsMessage(message)
  ].join('|'))}`;
}

export function buildSmsDedupeKey({ phone, purpose, message, eventId, dedupeKey, requestId } = {}) {
  const stableKey = resolveSmsEventId({ phone, purpose, message, eventId, dedupeKey, requestId });
  return sha256Hex([
    String(purpose || 'general').trim().toLowerCase() || 'general',
    stableKey
  ].join('|'));
}

function isMissingTable(error, tableName) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const table = String(tableName || '').toLowerCase();
  return code === '42P01'
    || code === 'PGRST205'
    || (message.includes('does not exist') && (!table || message.includes(table)))
    || (message.includes('schema cache') && message.includes('table') && (!table || message.includes(table)));
}

function markSmsDedupLocksTableMissing(error) {
  if (isMissingTable(error, SMS_DEDUP_LOCKS_TABLE)) {
    smsDedupLocksTableState = 'missing';
    return true;
  }

  return false;
}

function isMissingSmsEventColumn(error) {
  const message = String(error?.message || '').toLowerCase();
  return ['event_id', 'event_type', 'customer_id', 'phone_number', 'cooldown_until']
    .some((column) => message.includes(column))
    && (message.includes('column') || message.includes('schema cache'));
}

function duplicateLockFromMemory(entry = {}) {
  return {
    acquired: false,
    skipped: true,
    duplicate: true,
    lock: entry
  };
}

function activeMemoryLock(entry, nowMs) {
  if (!entry) return false;
  const status = String(entry.status || '').trim().toLowerCase();
  const expiresAtMs = Number(entry.expiresAtMs || new Date(entry.expiresAt || 0).getTime());
  return ['processing', 'sent'].includes(status)
    && (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0 || expiresAtMs > nowMs);
}

function getLocalSmsLock(dedupeKey) {
  return SMS_DEDUP_MEMORY.get(dedupeKey) || null;
}

function recentMemoryContentLock(lock, nowMs = Date.now()) {
  const cutoff = nowMs - SMS_COOLDOWN_WINDOW_MS;
  for (const entry of SMS_DEDUP_MEMORY.values()) {
    if (entry.dedupeKey === lock.dedupeKey) continue;
    if (entry.recipientPhone !== lock.recipientPhone || entry.messageHash !== lock.messageHash) continue;
    if (!['processing', 'sent'].includes(String(entry.status || '').trim().toLowerCase())) continue;
    const createdAtMs = Number(entry.createdAtMs || new Date(entry.createdAt || 0).getTime());
    if (Number.isFinite(createdAtMs) && createdAtMs >= cutoff) return entry;
  }
  return null;
}

function setLocalSmsLock(dedupeKey, entry) {
  SMS_DEDUP_MEMORY.set(dedupeKey, entry);
  return entry;
}

function canUseProductionLocalLock(lock = {}) {
  // Password-reset OTPs are already persisted and rate-limited in
  // password_reset_requests before the SMS provider is called. Allowing this
  // narrow fallback keeps account recovery available while the shared SMS
  // ledger migration is being applied, without weakening payment/event SMS
  // idempotency.
  return String(lock.purpose || '').trim().toLowerCase() === 'otp'
    && Boolean(lock.requestId);
}

function acquireLocalSmsLock(lock, unavailableReason = 'local_lock') {
  if (isProductionMode() && !canUseProductionLocalLock(lock)) {
    return {
      acquired: false,
      skipped: true,
      duplicate: false,
      reason: 'idempotency_store_unavailable',
      unavailableReason,
      lock
    };
  }

  const localLock = getLocalSmsLock(lock.dedupeKey);
  if (activeMemoryLock(localLock, Date.now())) {
    return { ...duplicateLockFromMemory(localLock), reason: 'duplicate_event' };
  }
  const contentLock = recentMemoryContentLock(lock);
  if (contentLock) {
    setLocalSmsLock(lock.dedupeKey, { ...lock, status: 'failed', errorMessage: 'duplicate_content_24h' });
    return { ...duplicateLockFromMemory(contentLock), reason: 'duplicate_content_24h' };
  }

  return {
    acquired: true,
    skipped: false,
    reason: unavailableReason,
    lock: setLocalSmsLock(lock.dedupeKey, { ...lock, status: 'processing' })
  };
}

function createSmsLockEntry({
  phone,
  purpose,
  message,
  eventId = '',
  dedupeKey = '',
  customerId = '',
  requestId = '',
  sourcePortal = 'api',
  senderMode = '',
  senderId = null,
  status = 'processing',
  expiresAtMs,
  providerMessageId = null,
  providerStatus = null,
  providerCode = null,
  providerResponse = {},
  errorMessage = ''
} = {}) {
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const normalizedPhone = smsDedupePhone(phone);
  const normalizedPurpose = String(purpose || 'general').trim().toLowerCase() || 'general';
  const normalizedMessage = normalizeSmsMessage(message);
  const normalizedEventId = resolveSmsEventId({
    phone: normalizedPhone,
    purpose: normalizedPurpose,
    message: normalizedMessage,
    eventId,
    dedupeKey,
    requestId
  });
  const dedupeKeyValue = buildSmsDedupeKey({
    phone: normalizedPhone,
    purpose: normalizedPurpose,
    message: normalizedMessage,
    eventId: normalizedEventId
  });
  const messageHash = sha256Hex(normalizedMessage);
  const lock = {
    dedupeKey: dedupeKeyValue,
    eventId: normalizedEventId,
    eventType: normalizedPurpose,
    customerId: String(customerId || '').trim() || null,
    messageHash,
    recipientPhone: normalizedPhone,
    purpose: normalizedPurpose,
    requestId: String(requestId || '').trim() || null,
    sourcePortal: String(sourcePortal || 'api').trim() || 'api',
    senderMode: String(senderMode || '').trim() || null,
    senderId: senderId ? String(senderId).trim() : null,
    status,
    lockedAt: nowIso,
    lockedAtMs: nowMs,
    expiresAtMs: Number(expiresAtMs) || nowMs,
    expiresAt: new Date(Number(expiresAtMs) || nowMs).toISOString(),
    sentAt: providerMessageId ? nowIso : null,
    providerMessageId: providerMessageId || null,
    providerStatus: providerStatus || null,
    providerCode: providerCode ?? null,
    providerResponse: providerResponse || {},
    errorMessage: errorMessage || '',
    createdAt: nowIso,
    createdAtMs: nowMs,
    updatedAt: nowIso
  };

  return lock;
}

function dedupeWindowForLock(lock) {
  return smsDedupWindowMs(lock.purpose);
}

function isUniqueViolation(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '23505'
    || message.includes('duplicate key')
    || message.includes('unique constraint')
    || message.includes('sms_send_locks_pkey')
    || message.includes('sms_send_locks_dedupe_key_key');
}

async function acquireSmsDedupLock({
  phone,
  purpose = 'general',
  message,
  eventId = '',
  dedupeKey = '',
  customerId = '',
  requestId = '',
  sourcePortal = 'api',
  senderMode = '',
  senderId = null
} = {}) {
  const lock = createSmsLockEntry({
    phone,
    purpose,
    message,
    eventId,
    dedupeKey,
    customerId,
    requestId,
    sourcePortal,
    senderMode,
    senderId,
    expiresAtMs: Date.now() + smsDedupWindowMs(purpose)
  });

  if (!lock.recipientPhone || !normalizeSmsMessage(message)) {
    return { acquired: false, skipped: false, reason: 'missing_dedup_inputs', lock };
  }

  if (!hasSupabaseConfig() || smsDedupLocksTableState === 'missing') {
    return acquireLocalSmsLock(lock, smsDedupLocksTableState === 'missing' ? 'dedupe_table_missing' : 'local_lock');
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (error) {
    if (markSmsDedupLocksTableMissing(error)) {
      return acquireLocalSmsLock(lock, 'dedupe_table_missing');
    }
    throw error;
  }

  const insertPayload = {
    dedupe_key: lock.dedupeKey,
    recipient_phone: lock.recipientPhone,
    purpose: lock.purpose,
    message_hash: lock.messageHash,
    request_id: lock.requestId || lock.eventId,
    source_portal: lock.sourcePortal,
    sender_mode: lock.senderMode,
    sender_id: lock.senderId,
    status: 'processing',
    locked_at: lock.lockedAt,
    expires_at: lock.expiresAt,
    created_at: lock.createdAt,
    updated_at: lock.updatedAt
  };

  const eventInsertPayload = {
    ...insertPayload,
    customer_id: lock.customerId,
    phone_number: lock.recipientPhone,
    event_type: lock.eventType,
    event_id: lock.eventId,
    cooldown_until: lock.expiresAt
  };

  let inserted = await supabase
    .from(SMS_DEDUP_LOCKS_TABLE)
    .insert(smsDedupEventColumnsState === 'legacy' ? insertPayload : eventInsertPayload)
    .select('*')
    .maybeSingle();

  if (inserted.error && isMissingSmsEventColumn(inserted.error) && smsDedupEventColumnsState !== 'legacy') {
    smsDedupEventColumnsState = 'legacy';
    inserted = await supabase
      .from(SMS_DEDUP_LOCKS_TABLE)
      .insert(insertPayload)
      .select('*')
      .maybeSingle();
  } else if (smsDedupEventColumnsState !== 'legacy' && (!inserted.error || isUniqueViolation(inserted.error))) {
    smsDedupEventColumnsState = 'extended';
  }

  if (!inserted.error && inserted.data) {
    const recentContent = await supabase
      .from(SMS_DEDUP_LOCKS_TABLE)
      .select('dedupe_key,recipient_phone,purpose,message_hash,status,created_at,provider_message_id')
      .eq('recipient_phone', lock.recipientPhone)
      .eq('message_hash', lock.messageHash)
      .in('status', ['processing', 'sent'])
      .gte('created_at', new Date(Date.now() - SMS_COOLDOWN_WINDOW_MS).toISOString())
      .order('created_at', { ascending: true })
      .order('dedupe_key', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (recentContent.error) throw recentContent.error;
    if (recentContent.data && recentContent.data.dedupe_key !== lock.dedupeKey) {
      await supabase
        .from(SMS_DEDUP_LOCKS_TABLE)
        .update({
          status: 'failed',
          error_message: 'duplicate_content_24h',
          updated_at: new Date().toISOString()
        })
        .eq('dedupe_key', lock.dedupeKey);
      return {
        acquired: false,
        skipped: true,
        duplicate: true,
        reason: 'duplicate_content_24h',
        lock: {
          ...lock,
          ...inserted.data,
          dedupeKey: lock.dedupeKey
        }
      };
    }

    return {
      acquired: true,
      skipped: false,
      reason: 'database_lock',
      lock: {
        ...lock,
        ...inserted.data,
        dedupeKey: lock.dedupeKey
      }
    };
  }

  if (!isUniqueViolation(inserted.error)) {
    if (markSmsDedupLocksTableMissing(inserted.error)) {
      return acquireLocalSmsLock(lock, 'dedupe_table_missing');
    }
    throw inserted.error;
  }

  const existing = await supabase
    .from(SMS_DEDUP_LOCKS_TABLE)
    .select('*')
    .eq('dedupe_key', lock.dedupeKey)
    .maybeSingle();

  if (existing.error) {
    if (markSmsDedupLocksTableMissing(existing.error)) {
      return acquireLocalSmsLock(lock, 'dedupe_table_missing');
    }
    throw existing.error;
  }

  const existingLock = existing.data;
  const existingStatus = String(existingLock?.status || '').trim().toLowerCase();
  const existingExpiry = new Date(existingLock?.expires_at || 0).getTime();
  const retryable = existingStatus === 'failed'
    || (Number.isFinite(existingExpiry) && existingExpiry > 0 && existingExpiry <= Date.now());

  if (existingLock && retryable) {
    const retryPayload = smsDedupEventColumnsState === 'legacy' ? insertPayload : eventInsertPayload;
    const retried = await supabase
      .from(SMS_DEDUP_LOCKS_TABLE)
      .update({
        ...retryPayload,
        status: 'processing',
        provider_message_id: null,
        provider_status: null,
        provider_code: null,
        provider_response: {},
        error_message: null,
        sent_at: null,
        locked_at: lock.lockedAt,
        expires_at: lock.expiresAt,
        updated_at: lock.updatedAt
      })
      .eq('dedupe_key', lock.dedupeKey)
      .eq('status', existingLock.status)
      .select('*')
      .maybeSingle();

    if (retried.error) throw retried.error;
    if (retried.data) {
      return {
        acquired: true,
        skipped: false,
        duplicate: false,
        reason: existingStatus === 'failed' ? 'retry_failed_event' : 'retry_expired_event',
        lock: { ...lock, ...retried.data, dedupeKey: lock.dedupeKey }
      };
    }
  }

  return {
    acquired: false,
    skipped: true,
    duplicate: true,
    reason: 'duplicate_event',
    lock: {
      ...lock,
      ...(existingLock || {}),
      dedupeKey: lock.dedupeKey
    }
  };
}

async function finalizeSmsDedupLock(lock, updates = {}) {
  if (!lock?.dedupeKey) return null;
  const nowIso = new Date().toISOString();
  const payload = {
    status: updates.status || lock.status || 'processing',
    provider_message_id: updates.providerMessageId ?? lock.providerMessageId ?? null,
    provider_status: updates.providerStatus ?? lock.providerStatus ?? null,
    provider_code: updates.providerCode ?? lock.providerCode ?? null,
    provider_response: updates.providerResponse ?? lock.providerResponse ?? {},
    error_message: updates.errorMessage ?? lock.errorMessage ?? null,
    sent_at: updates.sentAt ?? lock.sentAt ?? null,
    updated_at: nowIso
  };

  if (hasSupabaseConfig() && smsDedupLocksTableState !== 'missing') {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from(SMS_DEDUP_LOCKS_TABLE)
        .update(payload)
        .eq('dedupe_key', lock.dedupeKey)
        .select('*')
        .maybeSingle();

      if (!error && data) return data;
      if (error && markSmsDedupLocksTableMissing(error)) {
        smsDedupLocksTableState = 'missing';
      } else if (error) {
        throw error;
      }
    } catch (error) {
      if (!markSmsDedupLocksTableMissing(error)) {
        logWarn('sms.dedup_lock.finalize_failed', {
          dedupeKey: lock.dedupeKey,
          error
        });
        return null;
      }
    }
  }

  const current = SMS_DEDUP_MEMORY.get(lock.dedupeKey);
  if (current) {
    const next = {
      ...current,
      ...payload,
      providerMessageId: payload.provider_message_id ?? current.providerMessageId ?? null,
      providerStatus: payload.provider_status ?? current.providerStatus ?? null,
      providerCode: payload.provider_code ?? current.providerCode ?? null,
      providerResponse: payload.provider_response ?? current.providerResponse ?? {},
      errorMessage: payload.error_message ?? current.errorMessage ?? null,
      sentAt: payload.sent_at ?? current.sentAt ?? null,
      status: payload.status || current.status || 'processing',
      updatedAt: nowIso
    };
    SMS_DEDUP_MEMORY.set(lock.dedupeKey, next);
    return next;
  }

  return null;
}

function portalUrl(portal) {
  const baseUrl = publicAppBaseUrl();
  const key = String(portal || '').toLowerCase();
  if (key === 'agent') return `${baseUrl}/#/agent`;
  if (key === 'customer') return `${baseUrl}/#/customer`;
  if (key === 'admin') return `${baseUrl}/#/admin`;
  return `${baseUrl}/#/login`;
}

function smsDayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(safeDate);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function deliveryFromResponse(data) {
  // Africa's Talking's send response confirms gateway acceptance only.
  // Final handset delivery arrives later through the delivery report callback.
  const recipients = data?.SMSMessageData?.Recipients || [];
  if (!Array.isArray(recipients) || recipients.length === 0) return false;
  return recipients.some((item) => {
    const status = String(item.status || '').toLowerCase();
    const statusCode = Number(item.statusCode || 0);
    return status === 'success'
      || status === 'processed'
      || status === 'sent'
      || status === 'queued'
      || status === 'delivered'
      || statusCode === 100
      || statusCode === 101
      || statusCode === 102;
  });
}

function senderRejected(data) {
  const recipients = Array.isArray(data?.SMSMessageData?.Recipients) ? data.SMSMessageData.Recipients : [];
  const rejectionFromRecipients = recipients.some((item) => {
    const status = String(item?.status || '').toLowerCase().replace(/\s+/g, '');
    const statusCode = Number(item?.statusCode || 0);
    return statusCode === 402 || status.includes('invalidsenderid');
  });

  if (rejectionFromRecipients) return true;

  return String(data?.SMSMessageData?.Message || data?.message || '').toLowerCase().includes('invalidsenderid');
}

function assertTransactionalSms(message) {
  const text = String(message || '').trim();
  if (!text) {
    const error = new Error('Transactional SMS message is required.');
    error.statusCode = 400;
    throw error;
  }

  const promotionalTerms = [
    /\bpromo(?:tion|tional)?\b/i,
    /\boffer\b/i,
    /\bsale\b/i,
    /\bdiscount\b/i,
    /\bdeal\b/i,
    /\bbuy now\b/i,
    /\blimited time\b/i,
    /\bcampaign\b/i,
    /\badvert/i,
    /\bmarketing\b/i,
    /\bwin\b/i,
    /\bfree gift\b/i
  ];

  if (promotionalTerms.some((pattern) => pattern.test(text))) {
    const error = new Error('Blocked non-transactional SMS content. SALAMA LOCKPAYGO sender ID is for OTPs, account updates, payment notices, and service reminders only.');
    error.statusCode = 400;
    throw error;
  }
}

async function sendSmsRequest({ phone, message, useSender = true, from, purpose = 'general' }) {
  const body = new URLSearchParams({
    username: username(),
    to: phone,
    message: String(message || '')
  });

  if (from) {
    body.set('from', from);
  } else if (useSender && senderId()) {
    body.set('from', senderId());
  }

  const url = baseUrl();
  const timeoutMs = requestTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  logInfo('sms.provider.request', {
    provider: 'africastalking',
    url,
    timeoutMs,
    purpose,
    to: phone,
    from: body.get('from') || null,
    senderIdConfigured: Boolean(senderId()),
    sandbox: useSandbox()
  });

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: apiKey(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body,
      signal: controller.signal
    });
  } catch (error) {
    logError('sms.provider.request_failed', {
      provider: 'africastalking',
      url,
      timeoutMs,
      to: phone,
      error
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const rawBody = await response.text().catch(() => '');
  const data = rawBody ? (() => {
    try {
      return JSON.parse(rawBody);
    } catch {
      return { raw: rawBody };
    }
  })() : {};

  logInfo('sms.provider.response', {
    provider: 'africastalking',
    url,
    status: response.status,
    ok: response.ok,
    to: phone,
    body: data
  });

  return { response, data, rawBody };
}

export async function sendSms({
  to,
  message,
  from,
  purpose = 'general',
  senderMode = 'configured',
  requestId = '',
  sourcePortal = 'api',
  eventId = '',
  dedupeKey = '',
  customerId = ''
}) {
  const resolvedEventId = resolveSmsEventId({
    phone: to,
    purpose,
    message,
    eventId,
    dedupeKey,
    requestId
  });
  logInfo('sms.requested', {
    provider: 'africastalking',
    eventId: resolvedEventId,
    eventType: purpose,
    customerId: customerId || null,
    requestId: requestId || null,
    to: smsDedupePhone(to),
    sourcePortal
  });

  if (!hasAfricasTalkingSmsConfig()) {
    logWarn('sms.provider.misconfigured', {
      provider: 'africastalking',
      eventId: resolvedEventId,
      customerId: customerId || null,
      diagnostics: africasTalkingConfigDiagnostics()
    });
    return { configured: false, sent: false, providerAccepted: false, delivered: false, provider: 'africastalking', reason: 'sms_not_configured', purpose, eventId: resolvedEventId, customerId: customerId || null };
  }

  assertTransactionalSms(message);

  const phone = normalizeKenyanPhone(to);
  if (!phone) {
    logWarn('sms.provider.invalid_phone', { provider: 'africastalking', eventId: resolvedEventId, customerId: customerId || null, to });
    return { configured: true, sent: false, providerAccepted: false, delivered: false, provider: 'africastalking', reason: 'invalid_phone', purpose, eventId: resolvedEventId, customerId: customerId || null };
  }

  const explicitSender = String(from || '').trim();
  const useConfiguredSender = String(senderMode || '').trim().toLowerCase() !== 'default';
  const normalizedSenderMode = useConfiguredSender ? 'configured' : 'default';
  const configuredSender = explicitSender || (useConfiguredSender ? transactionalSenderId() : '');

  if (!configuredSender && !useSandbox() && isProductionMode() && useConfiguredSender) {
    const error = new Error(
      'Africa\'s Talking production SMS requires an approved sender ID or shortcode. Set AFRICASTALKING_SENDER_ID, AFRICASTALKING_REPLY_SENDER_ID, or AFRICASTALKING_NEXT_OF_KIN_SENDER_ID to a whitelisted sender. The default sender is only reliable for test SMSes in Kenya and mostly Airtel numbers.'
    );
    error.statusCode = 500;
    error.provider = 'africastalking';
    error.providerCode = 'missing_sender_id';
    error.providerResponse = {
      message: 'Missing approved sender ID for production delivery.'
    };
    logError('sms.provider.sender_missing', {
      provider: 'africastalking',
      to: phone,
      sandbox: useSandbox(),
      senderIdConfigured: Boolean(senderId()),
      replySenderIdConfigured: Boolean(envValue('AFRICASTALKING_REPLY_SENDER_ID')),
      nextOfKinSenderIdConfigured: Boolean(envValue('AFRICASTALKING_NEXT_OF_KIN_SENDER_ID'))
    });
    throw error;
  }

  const senderToUse = configuredSender || null;
  const dedupeAttempt = await acquireSmsDedupLock({
    phone,
    purpose,
    message,
    eventId: resolvedEventId,
    dedupeKey,
    customerId,
    requestId,
    sourcePortal,
    senderMode: normalizedSenderMode,
    senderId: senderToUse
  });

  if (dedupeAttempt.skipped) {
    logWarn('sms.skipped', {
      provider: 'africastalking',
      requestId: requestId || null,
      eventId: resolvedEventId,
      eventType: purpose,
      customerId: customerId || null,
      purpose,
      to: phone,
      senderMode: normalizedSenderMode,
      senderId: senderToUse || null,
      dedupeKey: dedupeAttempt.lock?.dedupeKey || null,
      reason: dedupeAttempt.reason || 'duplicate_event'
    });

    return {
      configured: true,
      sent: false,
      providerAccepted: false,
      delivered: false,
      provider: 'africastalking',
      reason: dedupeAttempt.duplicate ? 'duplicate_sms' : (dedupeAttempt.reason || 'sms_skipped'),
      duplicate: Boolean(dedupeAttempt.duplicate),
      duplicateReason: dedupeAttempt.duplicate ? (dedupeAttempt.reason || 'duplicate_event') : null,
      purpose,
      senderMode: normalizedSenderMode,
      senderId: senderToUse || null,
      dedupeKey: dedupeAttempt.lock?.dedupeKey || null,
      messageHash: dedupeAttempt.lock?.messageHash || null,
      eventId: resolvedEventId,
      customerId: customerId || null
    };
  }

  const dedupeLock = dedupeAttempt.lock;
  logInfo('sms_send_start', {
    provider: 'africastalking',
    requestId: requestId || null,
    eventId: resolvedEventId,
    eventType: purpose,
    customerId: customerId || null,
    purpose,
    to: phone,
    senderMode: normalizedSenderMode,
    senderId: senderToUse || null
  });

  let response;
  let data;
  let rawBody;

  try {
    ({ response, data, rawBody } = await sendSmsRequest({
      phone,
      message,
      useSender: Boolean(senderToUse),
      from: senderToUse,
      purpose
    }));

    if ((explicitSender || (useConfiguredSender && senderId())) && senderRejected(data)) {
      const error = new Error('Africa\'s Talking rejected the configured transactional sender ID. SMS was not sent without SALAMA LOCKPAYGO.');
      error.statusCode = 502;
      error.providerResponse = data;
      error.providerCode = data?.SMSMessageData?.Recipients?.[0]?.statusCode || data?.code || null;
      logError('sms.provider.sender_rejected', {
        provider: 'africastalking',
        to: phone,
        responseStatus: response.status,
        providerCode: error.providerCode,
        response: data
      });
      throw error;
    }

    if (!response.ok) {
      const error = new Error(data.message || data.errorMessage || data.raw || 'Africa\'s Talking SMS request failed.');
      error.statusCode = 502;
      error.providerResponse = data;
      error.providerCode = data?.SMSMessageData?.Recipients?.[0]?.statusCode || data?.code || null;
      logError('sms.provider.request_failed_response', {
        provider: 'africastalking',
        to: phone,
        responseStatus: response.status,
        providerCode: error.providerCode,
        response: data,
        rawBody
      });
      throw error;
    }

    const providerAccepted = deliveryFromResponse(data);
    const recipient = Array.isArray(data?.SMSMessageData?.Recipients) ? data.SMSMessageData.Recipients[0] || {} : {};
    const providerMessageId = cleanProviderMessageId(recipient.messageId);
    const result = {
      configured: true,
      sent: providerAccepted,
      providerAccepted,
      gatewayAccepted: providerAccepted,
      delivered: false,
      deliveryStatus: providerAccepted ? 'provider_accepted' : 'failed',
      provider: 'africastalking',
      transactional: true,
      senderIdUsed: Boolean(senderToUse),
      senderMode: normalizedSenderMode,
      senderId: senderToUse || null,
      purpose,
      eventId: resolvedEventId,
      customerId: customerId || null,
      response: data,
      providerStatus: recipient.status || null,
      providerCode: recipient.statusCode ?? null,
      providerMessageId: providerMessageId || null,
      sid: providerMessageId || null,
      dedupeKey: dedupeLock.dedupeKey,
      duplicate: false
    };

    const dispatchReport = await recordSmsDispatch({
      requestId: requestId || resolvedEventId,
      phone,
      response: data,
      sourcePortal,
      senderMode: normalizedSenderMode,
      senderId: senderToUse,
      purpose,
      rawPayload: data
    });

    logInfo('sms_provider_response', {
      provider: 'africastalking',
      requestId: requestId || null,
      eventId: resolvedEventId,
      eventType: purpose,
      customerId: customerId || null,
      purpose,
      to: phone,
      senderMode: normalizedSenderMode,
      senderId: senderToUse || null,
      httpStatus: response.status,
      providerAccepted,
      providerStatus: result.providerStatus,
      providerCode: result.providerCode,
      providerMessageId: result.providerMessageId,
      deliveryStatus: dispatchReport?.deliveryStatus || result.deliveryStatus
    });

    const lockStatus = providerAccepted ? 'sent' : 'failed';
    await finalizeSmsDedupLock(dedupeLock, {
      status: lockStatus,
      providerMessageId: providerMessageId || null,
      providerStatus: result.providerStatus || null,
      providerCode: result.providerCode ?? null,
      providerResponse: data,
      errorMessage: providerAccepted ? '' : (data?.message || data?.errorMessage || data?.raw || 'SMS provider rejected the message.'),
      sentAt: providerAccepted ? new Date().toISOString() : null
    });

    if (!providerAccepted) {
      logWarn('sms.provider.no_delivery', {
        provider: 'africastalking',
        to: phone,
        responseStatus: response.status,
        response: data,
        rawBody
      });
    }

    logInfo('sms.sent', {
      provider: 'africastalking',
      eventId: resolvedEventId,
      eventType: purpose,
      customerId: customerId || null,
      requestId: requestId || null,
      to: phone,
      providerAccepted,
      providerMessageId: providerMessageId || null
    });

    return result;
  } catch (error) {
    await finalizeSmsDedupLock(dedupeLock, {
      status: 'failed',
      errorMessage: error.message || String(error),
      providerResponse: error.providerResponse || {},
      providerStatus: error.providerStatus || null,
      providerCode: error.providerCode ?? null
    }).catch(() => null);
    logError('sms.failed', {
      provider: 'africastalking',
      eventId: resolvedEventId,
      eventType: purpose,
      customerId: customerId || null,
      requestId: requestId || null,
      to: phone,
      error: error.message || String(error)
    });
    throw error;
  }
}

export async function getSmsStatus(messageId) {
  if (!messageId) return null;
  const report = await getSmsDeliveryReport(messageId).catch((error) => {
    logWarn('sms.provider.status_lookup_failed', {
      provider: 'africastalking',
      messageId,
      error
    });
    return null;
  });

  if (!report) return null;

  return {
    provider: report.provider,
    providerMessageId: report.providerMessageId,
    recipientPhone: report.recipientPhone,
    purpose: report.purpose,
    providerAckStatus: report.providerAckStatus,
    providerAckStatusCode: report.providerAckStatusCode,
    deliveryStatus: report.deliveryStatus,
    deliveryStatusCode: report.deliveryStatusCode,
    failureReason: report.failureReason,
    deliveredAt: report.deliveredAt,
    lastReportedAt: report.lastReportedAt,
    rawPayload: report.rawPayload
  };
}

export async function sendOtpSms({ phone, otp, senderMode = 'configured', requestId = '', sourcePortal = 'api', customerId = '', eventId = '' }) {
  return sendSms({
    to: phone,
    purpose: 'otp',
    message: `Your SALAMA LOCK Paygo verification code is ${otp}. Valid for 10 minutes. Do not share this code.`,
    senderMode,
    requestId,
    sourcePortal,
    customerId,
    eventId: eventId || `otp:${sha256Hex(`${sourcePortal}|${requestId || customerId || phone}|${otp}`).slice(0, 32)}`
  });
}

function buildNextOfKinAcceptanceLink({ customerId, otp }) {
  const link = new URL('/api/k', publicAppBaseUrl());
  if (customerId) link.searchParams.set('c', customerId);
  if (otp) link.searchParams.set('o', otp);
  return link.toString();
}

function buildNextOfKinAcceptanceMessage({ customerName, customerId, otp }) {
  const acceptLink = customerId && otp ? buildNextOfKinAcceptanceLink({ customerId, otp }) : '';
  return acceptLink
    ? `SALAMA LOCK: ${customerName || 'A customer'} named you next-of-kin. Accept in 10 min: ${acceptLink}. Ignore if this is not you.`
    : `SALAMA LOCK: ${customerName || 'A customer'} named you next-of-kin. Contact SALAMA LOCK if this is not you.`;
}

export async function sendNextOfKinAcceptanceSms({ phone, customerName, customerId, otp }) {
  return sendSms({
    to: phone,
    from: nextOfKinReplySenderId(),
    purpose: 'next_of_kin_acceptance',
    message: buildNextOfKinAcceptanceMessage({ customerName, customerId, otp }),
    customerId,
    eventId: `next_of_kin_acceptance:${sha256Hex(`${customerId || phone}|${otp || 'request'}`).slice(0, 32)}`
  });
}

export async function sendScreeningSms({ action, customer, agent, reason, activationOtp }) {
  const customerName = customer?.customer_name || 'Customer';
  const customerId = customer?.id || '';
  const customerPhone = customer?.customer_phone || '';
  const agentPhone = agent?.phone || '';

  if (action === 'approve') {
    const customerMessage = activationOtp
      ? `SALAMA LOCK Paygo account update: ${customerName}, your account has been approved. Open ${portalUrl('customer')} and enter OTP ${activationOtp} to activate your account. Valid for 10 minutes.`
      : `SALAMA LOCK Paygo account update: ${customerName}, your account has been approved and activated. You can now log in at ${portalUrl('customer')}.`;

    const [customerResult, agentResult] = await Promise.all([
      sendSms({
        to: customerPhone,
        purpose: 'screening_approval_customer',
        message: customerMessage,
        customerId,
        eventId: `screening:${customerId}:approve:customer`
      }),
      sendSms({
        to: agentPhone,
        purpose: 'screening_approval_agent',
        message: `SALAMA LOCK Paygo account update: customer ${customerName} (Ref: ${customerId}) has been approved and can now log in.`,
        customerId,
        eventId: `screening:${customerId}:approve:agent:${agent?.id || agentPhone}`
      })
    ]);

    return { customer: customerResult, agent: agentResult };
  }

  if (action === 'reject') {
    return {
      agent: await sendSms({
        to: agentPhone,
        purpose: 'screening_rejection_agent',
        message: `Application for ${customerName} (Ref: ${customerId}) has been rejected. Reason: ${reason || 'Not specified'}. Contact admin for more details.`,
        customerId,
        eventId: `screening:${customerId}:reject:agent:${agent?.id || agentPhone}`
      })
    };
  }

  return {
    agent: await sendSms({
      to: agentPhone,
      purpose: 'screening_follow_up_agent',
      message: `Action required for ${customerName} (Ref: ${customerId}). Admin needs: ${reason || 'more information'}. Please update the application and resubmit.`,
      customerId,
      eventId: `screening:${customerId}:follow_up:${sha256Hex(normalizeSmsMessage(reason || 'more information'))}`
    })
  };
}

export async function sendPaymentConfirmedSms({ customer, paymentId, amount, receipt, balance, repaymentPct, accountReference, payerPhone }) {
  const accountText = accountReference ? ` on account ${accountReference}` : '';
  const unlockText = customer?.product_type === 'phone' && Number(balance || 0) <= 0
    ? ' Your phone has been unlocked.'
    : '';
  const recipientPhone = customer?.customer_phone || payerPhone || '';
  const customerName = customer?.customer_name || customer?.name || 'Customer';
  const transactionEventId = receipt || paymentId;
  return sendSms({
    to: recipientPhone,
    purpose: 'payment_confirmation',
    message: `Payment confirmed for ${customerName}! KES ${Number(amount || 0).toLocaleString('en-KE')} received for your SALAMA LOCK Paygo account${accountText}. Ref: ${receipt || 'pending'}. New balance: KES ${Number(balance || 0).toLocaleString('en-KE')}. Progress: ${Math.round(Number(repaymentPct || 0))}% paid.${unlockText}`,
    customerId: customer?.id || customer?.customer_id || '',
    eventId: `payment_confirmation:${transactionEventId || sha256Hex(`${recipientPhone}|${amount}|${accountReference}`)}`
  });
}

export async function sendPaymentReminderSms({ customer, amount, dueDate, overdueDays }) {
  const overdue = Number(overdueDays || 0);
  const customerId = customer?.id || customer?.customer_id || '';
  const reminderDay = smsDayKey();
  const amountText = Number(amount || 0).toLocaleString('en-KE');
  const balanceText = Number(customer?.balance || 0).toLocaleString('en-KE');
  const message = overdue >= 2
    ? `SALAMA LOCK Paygo overdue notice: your daily payment is ${overdue} days overdue. Overdue amount: KES ${amountText}. Current balance: KES ${balanceText}. Pay now through M-PESA or your customer portal to keep your account active.`
    : `SALAMA LOCK Paygo reminder: your payment of KES ${amountText} is due${dueDate ? ` on ${dueDate}` : ''}. Pay through your customer portal to keep your account active.`;

  return sendSms({
    to: customer?.customer_phone,
    purpose: 'payment_reminder',
    message,
    customerId,
    eventId: overdue >= 2
      ? `payment_reminder:${customerId || customer?.customer_phone}:overdue:${overdue}:${reminderDay}`
      : `payment_reminder:${customerId || customer?.customer_phone}:${dueDate || reminderDay}`
  });
}

export async function sendAgentFollowUpSms({ agentPhone, customerId, customerName, customerPhone, overdueDays, amount, balance, reminderDate }) {
  const overdueText = Number(overdueDays || 0) > 0 ? `, ${Number(overdueDays || 0)} days overdue` : '';
  const amountText = Number(amount || 0) > 0 ? ` Overdue amount: KES ${Number(amount || 0).toLocaleString('en-KE')}.` : '';
  const balanceText = Number(balance || 0) > 0 ? ` Balance: KES ${Number(balance || 0).toLocaleString('en-KE')}.` : '';
  return sendSms({
    to: agentPhone,
    purpose: 'agent_follow_up',
    message: `SALAMA LOCK Paygo follow-up: ${customerName || 'Customer'} (${customerPhone || 'no phone'}) needs payment follow-up${overdueText}.${amountText}${balanceText} Check your agent portal.`,
    customerId,
    eventId: `agent_follow_up:${customerId || customerPhone}:${reminderDate || smsDayKey()}`
  });
}

export async function sendAccountApprovedSms({ phone, name, portal, accountId = '' }) {
  const portalName = portal || 'portal';
  return sendSms({
    to: phone,
    purpose: 'account_approved',
    message: `SALAMA LOCK Paygo account update: ${name || 'there'}, your ${portalName} account has been approved and activated. You can now log in at ${portalUrl(portalName)}.`,
    customerId: accountId,
    eventId: `account_approved:${portalName}:${accountId || phone}`
  });
}

export async function sendCommissionPaidSms({ commission }) {
  return sendSms({
    to: commission?.agent_phone,
    purpose: 'commission_paid',
    message: `Your commission of KES ${Number(commission?.amount || 0).toLocaleString('en-KE')} for customer ${commission?.customer_name || 'customer'} has been processed. Ref: ${commission?.id || commission?.payout_reference || 'commission'}. Check your SALAMA LOCK Paygo portal for details.`,
    customerId: commission?.customer_id || null,
    eventId: `commission_paid:${commission?.payout_reference || commission?.id || sha256Hex(`${commission?.agent_phone}|${commission?.amount}`)}`
  });
}

export async function sendPhoneLockedSms({ customer, product, overdueDays, balance }) {
  const identifier = product?.locker_id || product?.imei_1 || product?.serial_number || customer?.serial_number || customer?.chassis_number || customer?.id || 'your phone';
  logInfo('phone_lock_sms.skipped', {
    customerId: customer?.id || null,
    productId: product?.id || null,
    identifier,
    overdueDays: Number(overdueDays || 0),
    balance: Number(balance || 0),
    reason: 'lock_sms_disabled',
    eventId: `phone_locked:${customer?.id || product?.id || identifier}`
  });
  return {
    sent: false,
    providerAccepted: false,
    skipped: true,
    reason: 'lock_sms_disabled',
    purpose: 'phone_locked',
    customerId: customer?.id || null,
    productId: product?.id || null
  };
}
