import crypto from 'node:crypto';
import { getSupabase, hasSupabaseConfig } from './supabase.js';
import { logError, logWarn } from './logging.js';

const PROVIDER = 'africastalking';
const SMS_LOGS_TABLE = 'sms_logs';
const LEGACY_REPORTS_TABLE = 'sms_delivery_reports';
let smsLogsTableState = 'unknown';
let smsDeliveryReportsTableState = 'unknown';

function cleanText(value) {
  return String(value || '').trim();
}

function cleanProviderMessageId(value) {
  const text = cleanText(value);
  if (!text) return '';
  if (['none', 'null', 'undefined', 'n/a', 'na'].includes(text.toLowerCase())) return '';
  return text;
}

function parseNumber(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
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

function markSmsDeliveryReportsTableMissing(error) {
  if (isMissingTable(error, LEGACY_REPORTS_TABLE)) {
    smsDeliveryReportsTableState = 'missing';
    return true;
  }

  return false;
}

function markSmsLogsTableMissing(error) {
  if (isMissingTable(error, SMS_LOGS_TABLE)) {
    smsLogsTableState = 'missing';
    return true;
  }

  return false;
}

function smsDeliveryReportsTableMissing() {
  return smsDeliveryReportsTableState === 'missing';
}

function smsLogsTableMissing() {
  return smsLogsTableState === 'missing';
}

function normalizePhone(phone) {
  const digits = cleanText(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('254')) return `+${digits}`;
  if (digits.startsWith('0')) return `+254${digits.slice(1)}`;
  if (digits.length === 9) return `+254${digits}`;
  return cleanText(phone).startsWith('+') ? cleanText(phone) : `+${digits}`;
}

export function normalizeAfricasTalkingDeliveryStatus(status, { callback = false } = {}) {
  const value = cleanText(status).toLowerCase();
  if (!value) return 'unknown';
  const compact = value.replace(/\s+/g, '');
  // Africa's Talking uses "Success" in two different contexts. In the
  // immediate send response it means the gateway accepted the message. In a
  // delivery-report callback it is the final handset-delivery confirmation.
  if (compact === 'success') return callback ? 'delivered' : 'provider_accepted';
  if (['provider_accepted', 'provideraccepted', 'accepted', 'submitted', 'queued', 'processed'].includes(compact)) return 'provider_accepted';
  if (compact === 'sent') return 'sent';
  if (compact === 'buffered') return 'sent';
  if (compact === 'delivered') return 'delivered';
  if (compact === 'failed') return 'failed';
  if (compact === 'rejected') return 'rejected';
  if (compact === 'expired') return 'expired';
  if (compact.includes('userinblacklist') || compact.includes('blacklist') || compact.includes('optedout') || compact.includes('unsubscribed')) return 'blacklisted';
  if (compact.includes('invalidphonenumber') || compact.includes('invalidphone')) return 'invalid_phone_number';
  return value;
}

function resolvedDeliveryStatus(existingStatus, incomingStatus) {
  const existing = normalizeAfricasTalkingDeliveryStatus(existingStatus);
  const incoming = normalizeAfricasTalkingDeliveryStatus(incomingStatus);
  if (existing === 'delivered' || incoming === 'delivered') return 'delivered';

  const terminalFailures = new Set(['failed', 'rejected', 'expired', 'blacklisted', 'invalid_phone_number']);
  if (terminalFailures.has(incoming)) return incoming;
  if (terminalFailures.has(existing) && ['unknown', 'provider_accepted', 'sent'].includes(incoming)) return existing;
  return incoming === 'unknown' ? existing : incoming;
}

export function mergeSmsDeliveryReportPayload(payload = {}, existing = null, nowIso = new Date().toISOString()) {
  const providerMessageId = cleanProviderMessageId(
    payload.providerMessageId ||
    payload.messageId ||
    payload.id ||
    payload.provider_message_id
  );
  const callbackStatus = normalizeAfricasTalkingDeliveryStatus(
    payload.deliveryStatus ||
    payload.status ||
    payload.delivery_status,
    { callback: true }
  );
  const deliveryStatus = resolvedDeliveryStatus(existing?.deliveryStatus, callbackStatus);
  const providerStatus = cleanText(
    payload.providerStatus ||
    payload.provider_status ||
    payload.status ||
    payload.deliveryStatus ||
    payload.delivery_status
  );
  const providerStatusCode = payload.providerStatusCode != null
    ? payload.providerStatusCode
    : payload.provider_status_code != null
      ? payload.provider_status_code
      : payload.statusCode != null
        ? payload.statusCode
        : payload.status_code;
  const recipientPhone = normalizePhone(
    payload.recipientPhone ||
    payload.phoneNumber ||
    payload.number ||
    payload.msisdn ||
    payload.to ||
    payload.phone ||
    existing?.recipientPhone
  );
  const deliveredAt = payload.deliveredAt != null
    ? payload.deliveredAt
    : payload.delivered_at != null
      ? payload.delivered_at
      : deliveryStatus === 'delivered'
        ? (existing?.deliveredAt || nowIso)
        : existing?.deliveredAt;

  return {
    providerMessageId,
    requestId: payload.requestId || payload.request_id || existing?.requestId || '',
    recipientPhone,
    purpose: payload.purpose || payload.smsPurpose || payload.messagePurpose || existing?.purpose || 'general',
    sourcePortal: payload.sourcePortal || payload.source_portal || existing?.sourcePortal || 'api',
    senderMode: payload.senderMode || payload.sender_mode || existing?.senderMode || '',
    senderId: payload.senderId || payload.sender_id || existing?.senderId || '',
    providerAckStatus: payload.providerAckStatus || payload.provider_ack_status || existing?.providerAckStatus || '',
    providerAckStatusCode: payload.providerAckStatusCode ?? payload.provider_ack_status_code ?? existing?.providerAckStatusCode ?? null,
    providerStatus,
    providerStatusCode,
    networkCode: payload.networkCode || payload.network_code || payload.network || payload.mccmnc || payload.mccMnc || existing?.networkCode || '',
    deliveryStatus,
    deliveryStatusCode: payload.deliveryStatusCode ?? payload.delivery_status_code ?? existing?.deliveryStatusCode ?? null,
    failureReason: payload.failureReason ?? payload.failure_reason ?? existing?.failureReason ?? '',
    deliveredAt,
    rawDeliveryPayload: payload.rawPayload || payload.raw_payload || payload,
    lastReportedAt: payload.lastReportedAt || payload.last_reported_at || nowIso,
    rawPayload: payload.rawPayload || payload.raw_payload || payload
  };
}

function legacyDeliveryStatus(status) {
  const normalized = normalizeAfricasTalkingDeliveryStatus(status);
  if (['provider_accepted', 'sent'].includes(normalized)) return 'submitted';
  if (['blacklisted', 'invalid_phone_number', 'expired'].includes(normalized)) return 'failed';
  if (['submitted', 'queued', 'delivered', 'failed', 'rejected', 'unknown'].includes(normalized)) return normalized;
  return 'unknown';
}

function extractProviderAckStatus(response = {}) {
  const recipient = Array.isArray(response?.SMSMessageData?.Recipients)
    ? response.SMSMessageData.Recipients[0] || {}
    : {};
  const ackStatus = cleanText(recipient.status || response?.SMSMessageData?.Message || response?.message || '');
  const ackStatusCode = parseNumber(recipient.statusCode ?? response?.statusCode ?? response?.code);
  const accepted = ackStatusCode === 100 || ackStatusCode === 101 || ackStatusCode === 102 || ['success', 'queued', 'sent', 'processed'].includes(ackStatus.toLowerCase());

  return {
    ackStatus: ackStatus || 'unknown',
    ackStatusCode,
    accepted,
    providerMessageId: cleanProviderMessageId(recipient.messageId || response?.messageId || response?.id || '')
  };
}

function safeSupabase() {
  if (!hasSupabaseConfig()) return null;

  try {
    return getSupabase();
  } catch (error) {
    logWarn('sms.delivery.supabase_unavailable', { error });
    return null;
  }
}

function reportFromRow(row = {}) {
  if (!row) return null;
  return {
    provider: row.provider || PROVIDER,
    id: row.id || row.provider_message_id || '',
    providerMessageId: row.provider_message_id || '',
    messageId: row.provider_message_id || '',
    requestId: row.request_id || '',
    recipientPhone: row.recipient_phone || '',
    phone: row.recipient_phone || '',
    sourcePortal: row.source_portal || 'api',
    senderMode: row.sender_mode || '',
    senderId: row.sender_id || '',
    purpose: row.purpose || 'general',
    providerAckStatus: row.provider_ack_status || '',
    providerAckStatusCode: row.provider_ack_status_code ?? null,
    providerStatus: row.provider_status || '',
    providerStatusCode: row.provider_status_code ?? null,
    networkCode: row.network_code || '',
    deliveryStatus: row.delivery_status || 'unknown',
    deliveryStatusCode: row.delivery_status_code ?? null,
    failureReason: row.failure_reason || '',
    deliveredAt: row.delivered_at || null,
    lastReportedAt: row.last_reported_at || null,
    rawPayload: row.raw_payload || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function reportFromSmsLogRow(row = {}) {
  if (!row) return null;
  return {
    id: row.id || '',
    provider: row.provider || PROVIDER,
    providerMessageId: row.message_id || '',
    messageId: row.message_id || '',
    requestId: row.request_id || '',
    recipientPhone: row.phone || '',
    phone: row.phone || '',
    sourcePortal: 'api',
    senderMode: row.sender_mode || '',
    senderId: row.sender_id || '',
    purpose: row.purpose || 'general',
    providerAckStatus: row.provider_status || '',
    providerAckStatusCode: row.provider_code ?? null,
    providerStatus: row.provider_status || '',
    providerStatusCode: row.provider_code ?? null,
    networkCode: row.network_code || '',
    deliveryStatus: row.delivery_status || 'unknown',
    deliveryStatusCode: null,
    failureReason: row.failure_reason || '',
    deliveredAt: row.delivered_at || null,
    lastReportedAt: row.updated_at || row.created_at || null,
    rawPayload: row.raw_delivery_payload || row.raw_provider_response || {},
    rawProviderResponse: row.raw_provider_response || {},
    rawDeliveryPayload: row.raw_delivery_payload || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

async function upsertSmsLog(record) {
  const supabase = safeSupabase();
  if (!supabase) return null;
  if (smsLogsTableMissing()) return null;

  const messageId = cleanProviderMessageId(record.providerMessageId);
  const phone = normalizePhone(record.recipientPhone);
  if (!messageId || !phone) return null;

  const deliveryStatus = normalizeAfricasTalkingDeliveryStatus(record.deliveryStatus);
  const payload = {
    request_id: cleanText(record.requestId) || null,
    message_id: messageId,
    phone,
    purpose: cleanText(record.purpose) || 'general',
    sender_mode: cleanText(record.senderMode) || null,
    sender_id: cleanText(record.senderId) || null,
    provider: record.provider || PROVIDER,
    provider_status: cleanText(record.providerStatus || record.providerAckStatus) || null,
    provider_code: parseNumber(record.providerStatusCode ?? record.providerAckStatusCode),
    delivery_status: deliveryStatus,
    failure_reason: cleanText(record.failureReason) || null,
    network_code: cleanText(record.networkCode) || null,
    delivered_at: deliveryStatus === 'delivered'
      ? (record.deliveredAt || new Date().toISOString())
      : null
  };

  const rawProviderResponse = record.rawProviderResponse || record.rawPayload?.response || null;
  if (rawProviderResponse) {
    payload.raw_provider_response = rawProviderResponse;
  }

  const rawDeliveryPayload = record.rawDeliveryPayload || null;
  if (rawDeliveryPayload) {
    payload.raw_delivery_payload = rawDeliveryPayload;
  }

  const { data, error } = await supabase
    .from(SMS_LOGS_TABLE)
    .upsert(payload, { onConflict: 'message_id' })
    .select('*')
    .single();

  if (error) {
    if (markSmsLogsTableMissing(error)) return null;
    logError('sms.logs.upsert_failed', { error, messageId });
    throw error;
  }

  return reportFromSmsLogRow(data);
}

async function upsertReport(record) {
  const smsLogReport = await upsertSmsLog(record);
  if (smsLogReport) return smsLogReport;

  const supabase = safeSupabase();
  if (!supabase) return null;
  if (smsDeliveryReportsTableMissing()) return null;

  const payload = {
    provider: record.provider || PROVIDER,
    provider_message_id: cleanProviderMessageId(record.providerMessageId),
    recipient_phone: normalizePhone(record.recipientPhone),
    purpose: cleanText(record.purpose) || 'general',
    delivery_status: legacyDeliveryStatus(record.deliveryStatus),
    last_reported_at: record.lastReportedAt || new Date().toISOString(),
    raw_payload: record.rawPayload || {}
  };

  if (record.sourcePortal !== undefined && record.sourcePortal !== null && cleanText(record.sourcePortal)) {
    payload.source_portal = cleanText(record.sourcePortal);
  }

  if (record.requestId !== undefined && record.requestId !== null && cleanText(record.requestId)) {
    payload.request_id = cleanText(record.requestId);
  }

  if (record.senderMode !== undefined && record.senderMode !== null && cleanText(record.senderMode)) {
    payload.sender_mode = cleanText(record.senderMode);
  }

  if (record.senderId !== undefined && record.senderId !== null && cleanText(record.senderId)) {
    payload.sender_id = cleanText(record.senderId);
  }

  if (record.providerAckStatus !== undefined && record.providerAckStatus !== null && cleanText(record.providerAckStatus)) {
    payload.provider_ack_status = cleanText(record.providerAckStatus);
  }

  if (record.providerAckStatusCode !== undefined && record.providerAckStatusCode !== null) {
    payload.provider_ack_status_code = parseNumber(record.providerAckStatusCode);
  }

  if (record.providerStatus !== undefined && record.providerStatus !== null && cleanText(record.providerStatus)) {
    payload.provider_status = cleanText(record.providerStatus);
  }

  if (record.providerStatusCode !== undefined && record.providerStatusCode !== null) {
    payload.provider_status_code = parseNumber(record.providerStatusCode);
  }

  if (record.networkCode !== undefined && record.networkCode !== null && cleanText(record.networkCode)) {
    payload.network_code = cleanText(record.networkCode);
  }

  if (record.deliveryStatusCode !== undefined && record.deliveryStatusCode !== null) {
    payload.delivery_status_code = parseNumber(record.deliveryStatusCode);
  }

  if (record.failureReason !== undefined) {
    payload.failure_reason = cleanText(record.failureReason) || null;
  }

  if (record.deliveredAt !== undefined && record.deliveredAt !== null && record.deliveredAt !== '') {
    payload.delivered_at = record.deliveredAt;
  }

  if (!payload.provider_message_id) return null;
  if (!payload.recipient_phone) {
    payload.recipient_phone = normalizePhone(record.providerAckPhone || record.recipientPhone || '');
  }
  if (!payload.recipient_phone) return null;

  let writePayload = payload;
  let lastError = null;
  const optionalColumns = ['request_id', 'sender_mode', 'network_code'];

  for (let attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
    const { data, error } = await supabase
      .from('sms_delivery_reports')
      .upsert(writePayload, { onConflict: 'provider_message_id' })
      .select('*')
      .single();

    if (!error) return reportFromRow(data);

    lastError = error;
    const message = String(error.message || '').toLowerCase();
    const missingColumn = optionalColumns.find((column) => message.includes(column) && writePayload[column] !== undefined);
    if (!missingColumn) break;

    logWarn('sms.delivery.optional_column_missing', {
      providerMessageId: payload.provider_message_id,
      missingColumn
    });
    writePayload = { ...writePayload };
    delete writePayload[missingColumn];
  }

  if (lastError) {
    if (markSmsDeliveryReportsTableMissing(lastError)) {
      return null;
    }

    logError('sms.delivery.upsert_failed', { error: lastError, providerMessageId: payload.provider_message_id });
    throw lastError;
  }

  return null;
}

export async function recordSmsDispatch({
  requestId = '',
  phone,
  response = {},
  sourcePortal = 'api',
  senderMode = '',
  senderId = null,
  purpose = 'general',
  rawPayload = {}
} = {}) {
  const ack = extractProviderAckStatus(response);
  const providerMessageId = ack.providerMessageId || `local_${ack.accepted ? 'accepted' : 'failed'}_${crypto.randomUUID()}`;
  if (!providerMessageId) return null;

  try {
    return await upsertReport({
      providerMessageId,
      requestId,
      recipientPhone: phone,
      sourcePortal,
      senderMode,
      senderId,
      purpose,
      providerAckStatus: ack.ackStatus,
      providerAckStatusCode: ack.ackStatusCode,
      providerStatus: ack.ackStatus,
      providerStatusCode: ack.ackStatusCode,
      deliveryStatus: ack.accepted ? 'provider_accepted' : ack.ackStatus,
      deliveryStatusCode: ack.ackStatusCode,
      failureReason: ack.accepted ? '' : ack.ackStatus,
      rawProviderResponse: rawPayload || response,
      rawPayload: {
        type: 'send_response',
        response: rawPayload || response
      }
    });
  } catch (error) {
    logWarn('sms.delivery.dispatch_record_failed', {
      providerMessageId,
      error
    });
    return null;
  }
}

export async function upsertSmsDeliveryReport(payload = {}) {
  const providerMessageId = cleanProviderMessageId(
    payload.providerMessageId ||
    payload.messageId ||
    payload.id ||
    payload.provider_message_id
  );

  const existing = providerMessageId
    ? await getSmsDeliveryReport(providerMessageId).catch(() => null)
    : null;

  return upsertReport(mergeSmsDeliveryReportPayload(payload, existing));
}

export async function getSmsDeliveryReport(messageId) {
  const supabase = safeSupabase();
  const providerMessageId = cleanProviderMessageId(messageId);
  if (!supabase || !providerMessageId) return null;

  if (!smsLogsTableMissing()) {
    const smsLog = await supabase
      .from(SMS_LOGS_TABLE)
      .select('*')
      .eq('message_id', providerMessageId)
      .maybeSingle();

    if (smsLog.error) {
      if (!markSmsLogsTableMissing(smsLog.error)) {
        logError('sms.logs.lookup_failed', { error: smsLog.error, providerMessageId });
        throw smsLog.error;
      }
    } else if (smsLog.data) {
      return reportFromSmsLogRow(smsLog.data);
    }
  }

  if (smsDeliveryReportsTableMissing()) return null;

  const { data, error } = await supabase
    .from(LEGACY_REPORTS_TABLE)
    .select('*')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();

  if (error) {
    if (markSmsDeliveryReportsTableMissing(error)) {
      return null;
    }

    logError('sms.delivery.lookup_failed', { error, providerMessageId });
    throw error;
  }

  return reportFromRow(data);
}

export async function listSmsDeliveryReports({ limit = 50, phone = '', messageId = '', status = '', date = '' } = {}) {
  const supabase = safeSupabase();
  if (!supabase) return [];

  const normalizedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const normalizedPhone = normalizePhone(phone);
  const normalizedMessageId = cleanProviderMessageId(messageId);
  const normalizedStatus = normalizeAfricasTalkingDeliveryStatus(status);
  const normalizedDate = cleanText(date);

  if (!smsLogsTableMissing()) {
    let request = supabase
      .from(SMS_LOGS_TABLE)
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(normalizedLimit);

    if (normalizedPhone) request = request.eq('phone', normalizedPhone);
    if (normalizedMessageId) request = request.eq('message_id', normalizedMessageId);
    if (cleanText(status)) request = request.eq('delivery_status', normalizedStatus);
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      request = request.gte('created_at', `${normalizedDate}T00:00:00.000Z`).lt('created_at', `${normalizedDate}T23:59:59.999Z`);
    }

    const { data, error } = await request;
    if (error) {
      if (!markSmsLogsTableMissing(error)) {
        logError('sms.logs.list_failed', { error });
        throw error;
      }
    } else {
      return (data || []).map(reportFromSmsLogRow).filter(Boolean);
    }
  }

  if (smsDeliveryReportsTableMissing()) return [];

  const { data, error } = await supabase
    .from(LEGACY_REPORTS_TABLE)
    .select('*')
    .order('last_reported_at', { ascending: false })
    .limit(normalizedLimit);

  if (error) {
    if (markSmsDeliveryReportsTableMissing(error)) {
      return [];
    }

    logError('sms.delivery.list_failed', { error });
    throw error;
  }

  return (data || []).map(reportFromRow).filter(Boolean);
}

export function summarizeSmsDeliveryReports(reports = []) {
  const counts = {
    provider_accepted: 0,
    sent: 0,
    submitted: 0,
    queued: 0,
    delivered: 0,
    failed: 0,
    rejected: 0,
    expired: 0,
    blacklisted: 0,
    invalid_phone_number: 0,
    unknown: 0
  };

  for (const report of reports || []) {
    const status = normalizeAfricasTalkingDeliveryStatus(report?.deliveryStatus || report?.delivery_status || report?.status);
    if (counts[status] === undefined) {
      counts.unknown += 1;
      continue;
    }
    counts[status] += 1;
  }

  return counts;
}
