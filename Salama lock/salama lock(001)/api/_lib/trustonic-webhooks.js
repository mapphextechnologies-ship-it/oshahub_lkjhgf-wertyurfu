import crypto from 'node:crypto';
import { getSupabase } from './supabase.js';
import { claimSchedulerLock, releaseSchedulerLock } from './scheduler-locks.js';
import { logError, logInfo, logWarn } from './logging.js';

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
const DEFAULT_RELAY_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_ATTEMPTS = 8;
const PERMANENT_HTTP_STATUSES = new Set([400, 401, 403, 404, 405, 410, 411, 413, 414, 415, 422]);
const FORWARDED_HEADER_NAMES = new Set([
  'x-event-id',
  'x-request-id',
  'x-signature',
  'x-tenant-id',
  'x-trustonic-event-id',
  'x-trustonic-signature',
  'x-trustonic-timestamp',
  'x-webhook-id',
  'x-webhook-signature',
  'x-webhook-timestamp'
]);

function envValue(env, ...names) {
  return names.map((name) => String(env?.[name] || '').trim()).find(Boolean) || '';
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || '').trim(), 'utf8');
  const right = Buffer.from(String(rightValue || '').trim(), 'utf8');
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function bearerToken(req) {
  const authorization = String(req?.headers?.authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

function queryCredential(req) {
  try {
    const params = new URL(req?.url || '/', 'https://local.vercel.app').searchParams;
    return params.get('token') || params.get('secret') || '';
  } catch {
    return '';
  }
}

export function authorizeTrustonicWebhook(req, env = process.env) {
  const expected = envValue(env, 'TRUSTONIC_WEBHOOK_SECRET', 'TRUSTONIC_WEBHOOK_TOKEN');
  if (!expected) return { configured: false, authorized: false };

  const candidates = [
    bearerToken(req),
    req?.headers?.['x-trustonic-webhook-secret'],
    req?.headers?.['x-webhook-secret'],
    queryCredential(req)
  ];

  return {
    configured: true,
    authorized: candidates.some((candidate) => safeEqual(candidate, expected))
  };
}

export function readRawJson(req, { maxBytes = DEFAULT_MAX_BODY_BYTES } = {}) {
  if (req?.body !== undefined && req?.body !== null) {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(rawBody, 'utf8') > maxBytes) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      return Promise.reject(error);
    }

    try {
      return Promise.resolve({ rawBody, payload: typeof req.body === 'string' ? JSON.parse(req.body) : req.body });
    } catch (cause) {
      const error = new Error('Request body must be valid JSON.');
      error.statusCode = 400;
      error.cause = cause;
      return Promise.reject(error);
    }
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    req.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        const error = new Error('Request body is too large.');
        error.statusCode = 413;
        finish(reject, error);
        req.destroy?.(error);
        return;
      }
      chunks.push(buffer);
    });

    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      if (!rawBody.trim()) {
        const error = new Error('Request body is required.');
        error.statusCode = 400;
        finish(reject, error);
        return;
      }

      try {
        finish(resolve, { rawBody, payload: JSON.parse(rawBody) });
      } catch (cause) {
        const error = new Error('Request body must be valid JSON.');
        error.statusCode = 400;
        error.cause = cause;
        finish(reject, error);
      }
    });

    req.on('error', (error) => finish(reject, error));
  });
}

function firstValue(source, names) {
  for (const name of names) {
    const value = source?.[name];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

export function selectTrustonicHeaders(headers = {}) {
  const selected = {};
  for (const [rawName, rawValue] of Object.entries(headers || {})) {
    const name = String(rawName || '').toLowerCase();
    if (!FORWARDED_HEADER_NAMES.has(name)) continue;
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value !== undefined && value !== null && String(value).trim()) selected[name] = String(value).trim();
  }
  return selected;
}

export function identifyTrustonicEvent({ payload, rawBody, headers = {} } = {}) {
  const selectedHeaders = selectTrustonicHeaders(headers);
  const tenantId = firstValue(selectedHeaders, ['x-tenant-id']) || firstValue(payload, [
    'tenantId', 'tenant_id', 'tenant'
  ]);
  const externalEventId = firstValue(selectedHeaders, [
    'x-trustonic-event-id', 'x-event-id', 'x-webhook-id', 'x-request-id'
  ]) || firstValue(payload, [
    'eventId', 'event_id', 'notificationId', 'notification_id', 'requestId', 'request_id'
  ]);
  const eventType = firstValue(payload, [
    'eventType', 'event_type', 'notificationType', 'notification_type', 'type', 'action'
  ]) || 'unknown';
  const fingerprintSource = externalEventId
    ? `${tenantId || 'unknown'}:${externalEventId}`
    : `${tenantId || 'unknown'}:${String(rawBody || JSON.stringify(payload || {}))}`;

  return {
    eventKey: crypto.createHash('sha256').update(fingerprintSource).digest('hex'),
    externalEventId: externalEventId || null,
    tenantId: tenantId || null,
    eventType,
    sourceHeaders: selectedHeaders
  };
}

function databaseSetupError(error) {
  if (error?.code !== '42P01' && !String(error?.message || '').includes('trustonic_webhook_events')) return error;
  const setupError = new Error('Trustonic webhook storage is not installed. Run supabase_trustonic_webhook_gateway.sql in Supabase.');
  setupError.statusCode = 503;
  setupError.cause = error;
  return setupError;
}

export async function storeTrustonicWebhookEvent({ payload, rawBody, headers = {} }, { supabase = getSupabase() } = {}) {
  const identity = identifyTrustonicEvent({ payload, rawBody, headers });
  const row = {
    event_key: identity.eventKey,
    external_event_id: identity.externalEventId,
    tenant_id: identity.tenantId,
    event_type: identity.eventType,
    payload,
    raw_body: rawBody,
    source_headers: identity.sourceHeaders,
    status: 'pending',
    next_attempt_at: new Date().toISOString()
  };

  const inserted = await supabase
    .from('trustonic_webhook_events')
    .insert(row)
    .select('id,event_key,status,attempt_count,created_at,delivered_at')
    .single();

  if (!inserted.error) return { event: inserted.data, duplicate: false };
  if (inserted.error.code !== '23505') throw databaseSetupError(inserted.error);

  const existing = await supabase
    .from('trustonic_webhook_events')
    .select('id,event_key,status,attempt_count,created_at,delivered_at')
    .eq('event_key', identity.eventKey)
    .maybeSingle();

  if (existing.error) throw databaseSetupError(existing.error);
  return { event: existing.data, duplicate: true };
}

export function getMomaniWebhookConfig(env = process.env) {
  const rawUrl = envValue(env, 'MOMANI_TRUSTONIC_WEBHOOK_URL', 'MOMANI_WEBHOOK_URL');
  if (!rawUrl) {
    const error = new Error('Set MOMANI_TRUSTONIC_WEBHOOK_URL before enabling webhook delivery.');
    error.code = 'MOMANI_WEBHOOK_NOT_CONFIGURED';
    throw error;
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch (cause) {
    const error = new Error('MOMANI_TRUSTONIC_WEBHOOK_URL must be a valid URL.');
    error.code = 'MOMANI_WEBHOOK_CONFIG_INVALID';
    error.cause = cause;
    throw error;
  }

  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    const error = new Error('MOMANI_TRUSTONIC_WEBHOOK_URL must use HTTPS.');
    error.code = 'MOMANI_WEBHOOK_CONFIG_INVALID';
    throw error;
  }

  const authMode = envValue(env, 'MOMANI_TRUSTONIC_WEBHOOK_AUTH_MODE').toLowerCase() || 'bearer';
  if (!['bearer', 'header', 'query', 'none'].includes(authMode)) {
    const error = new Error('MOMANI_TRUSTONIC_WEBHOOK_AUTH_MODE must be bearer, header, query, or none.');
    error.code = 'MOMANI_WEBHOOK_CONFIG_INVALID';
    throw error;
  }

  const token = envValue(env, 'MOMANI_TRUSTONIC_WEBHOOK_TOKEN', 'MOMANI_WEBHOOK_TOKEN');
  if (authMode !== 'none' && !token && !url.searchParams.has('token')) {
    const error = new Error('Set MOMANI_TRUSTONIC_WEBHOOK_TOKEN for authenticated webhook delivery.');
    error.code = 'MOMANI_WEBHOOK_CONFIG_INVALID';
    throw error;
  }

  return {
    url,
    authMode,
    token,
    tokenParameter: envValue(env, 'MOMANI_TRUSTONIC_WEBHOOK_TOKEN_PARAM') || 'token',
    tokenHeader: envValue(env, 'MOMANI_TRUSTONIC_WEBHOOK_TOKEN_HEADER') || 'x-webhook-secret',
    timeoutMs: clampInteger(env?.MOMANI_TRUSTONIC_WEBHOOK_TIMEOUT_MS, DEFAULT_RELAY_TIMEOUT_MS, 1_000, 20_000),
    maxAttempts: clampInteger(env?.MOMANI_TRUSTONIC_WEBHOOK_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS, 1, 20)
  };
}

export function buildMomaniWebhookRequest(event, env = process.env) {
  const config = getMomaniWebhookConfig(env);
  const url = new URL(config.url.toString());
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'SALAMA LOCK-Trustonic-Webhook-Gateway/1.0',
    'X-SALAMA LOCK-Webhook-Event-ID': String(event.id || event.event_key || ''),
    'X-SALAMA LOCK-Webhook-Attempt': String((Number(event.attempt_count) || 0) + 1),
    ...selectTrustonicHeaders(event.source_headers || {})
  };

  if (config.authMode === 'bearer' && config.token) headers.Authorization = `Bearer ${config.token}`;
  if (config.authMode === 'header' && config.token) headers[config.tokenHeader] = config.token;
  if (config.authMode === 'query' && config.token) url.searchParams.set(config.tokenParameter, config.token);

  return {
    config,
    url,
    options: {
      method: 'POST',
      headers,
      body: String(event.raw_body || JSON.stringify(event.payload || {}))
    }
  };
}

export function classifyMomaniDeliveryStatus(status) {
  const normalized = Number(status) || 0;
  if (normalized >= 200 && normalized < 300) return 'delivered';
  if (PERMANENT_HTTP_STATUSES.has(normalized) || (normalized >= 400 && normalized < 500 && ![408, 425, 429].includes(normalized))) {
    return 'dead_letter';
  }
  return 'retry';
}

export function nextWebhookAttemptAt(attemptCount, now = new Date()) {
  const attempt = Math.max(1, Number(attemptCount) || 1);
  const delayMs = Math.min(60_000 * (2 ** (attempt - 1)), 12 * 60 * 60 * 1000);
  return new Date(now.getTime() + delayMs).toISOString();
}

export async function deliverMomaniWebhook(event, { env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  const request = buildMomaniWebhookRequest(event, env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.config.timeoutMs);
  const attemptCount = (Number(event.attempt_count) || 0) + 1;

  try {
    const response = await fetchImpl(request.url, { ...request.options, signal: controller.signal });
    const disposition = classifyMomaniDeliveryStatus(response.status);
    const exhausted = attemptCount >= request.config.maxAttempts;
    const status = disposition === 'retry' && exhausted ? 'dead_letter' : disposition === 'retry' ? 'failed' : disposition;
    return {
      status,
      attemptCount,
      httpStatus: response.status,
      error: disposition === 'delivered' ? null : `Momani returned HTTP ${response.status}.`,
      nextAttemptAt: status === 'failed' ? nextWebhookAttemptAt(attemptCount, now) : null
    };
  } catch (error) {
    const exhausted = attemptCount >= request.config.maxAttempts;
    return {
      status: exhausted ? 'dead_letter' : 'failed',
      attemptCount,
      httpStatus: null,
      error: error?.name === 'AbortError' ? 'Momani webhook request timed out.' : 'Momani webhook request failed.',
      nextAttemptAt: exhausted ? null : nextWebhookAttemptAt(attemptCount, now)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function updateDeliveryRecord(supabase, event, outcome, now) {
  const patch = {
    status: outcome.status,
    attempt_count: outcome.attemptCount,
    last_attempt_at: now.toISOString(),
    next_attempt_at: outcome.nextAttemptAt,
    last_http_status: outcome.httpStatus,
    last_error: outcome.error,
    delivered_at: outcome.status === 'delivered' ? now.toISOString() : null
  };
  const updated = await supabase
    .from('trustonic_webhook_events')
    .update(patch)
    .eq('id', event.id)
    .eq('attempt_count', Number(event.attempt_count) || 0);
  if (updated.error) throw databaseSetupError(updated.error);
}

export async function processTrustonicWebhookQueue({
  dryRun = false,
  limit = 25,
  env = process.env,
  fetchImpl = fetch,
  supabase = null
} = {}) {
  const batchSize = clampInteger(limit, 25, 1, 100);
  try {
    getMomaniWebhookConfig(env);
  } catch (error) {
    if (error?.code === 'MOMANI_WEBHOOK_NOT_CONFIGURED') {
      return {
        checked: 0,
        delivered: 0,
        retried: 0,
        deadLetter: 0,
        dryRun,
        overlapped: false,
        disabled: true
      };
    }
    throw error;
  }

  const database = supabase || getSupabase();

  const lock = await claimSchedulerLock('trustonic_webhook_delivery', {
    ttlSeconds: 120,
    metadata: { dryRun, limit: batchSize }
  });
  if (!lock.acquired) return { checked: 0, delivered: 0, retried: 0, deadLetter: 0, dryRun, overlapped: true };

  const summary = { checked: 0, delivered: 0, retried: 0, deadLetter: 0, dryRun, overlapped: false };
  try {
    const due = await database
      .from('trustonic_webhook_events')
      .select('id,event_key,payload,raw_body,source_headers,status,attempt_count,next_attempt_at')
      .in('status', ['pending', 'failed'])
      .lte('next_attempt_at', new Date().toISOString())
      .order('next_attempt_at', { ascending: true })
      .limit(batchSize);
    if (due.error) throw databaseSetupError(due.error);

    for (const event of due.data || []) {
      summary.checked += 1;
      if (dryRun) continue;

      const attemptedAt = new Date();
      const outcome = await deliverMomaniWebhook(event, { env, fetchImpl, now: attemptedAt });
      await updateDeliveryRecord(database, event, outcome, attemptedAt);

      if (outcome.status === 'delivered') {
        summary.delivered += 1;
        logInfo('trustonic_webhook.delivered', { eventId: event.id, attemptCount: outcome.attemptCount, httpStatus: outcome.httpStatus });
      } else if (outcome.status === 'dead_letter') {
        summary.deadLetter += 1;
        logError('trustonic_webhook.dead_letter', { eventId: event.id, attemptCount: outcome.attemptCount, httpStatus: outcome.httpStatus, error: outcome.error });
      } else {
        summary.retried += 1;
        logWarn('trustonic_webhook.retry_scheduled', { eventId: event.id, attemptCount: outcome.attemptCount, httpStatus: outcome.httpStatus, nextAttemptAt: outcome.nextAttemptAt });
      }
    }

    return summary;
  } finally {
    await releaseSchedulerLock('trustonic_webhook_delivery', lock.holderId).catch(() => null);
  }
}
