import { getSupabase, hasSupabaseConfig } from './supabase.js';

const fallbackBuckets = new Map();
const MAX_BODY_BYTES = 32 * 1024;

function clientKey(req, scope = 'global') {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || 'unknown';
  return `${scope}:${ip}`;
}

function assertFallbackRateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const current = fallbackBuckets.get(key);

  if (!current || current.resetAt <= now) {
    fallbackBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  current.count += 1;

  if (current.count > limit) {
    const error = new Error('Too many requests. Try again later.');
    error.statusCode = 429;
    error.retryAfter = Math.ceil((current.resetAt - now) / 1000);
    throw error;
  }
}

export async function assertRateLimit(req, { scope, limit = 20, windowMs = 60_000 } = {}) {
  const key = clientKey(req, scope);

  if (hasSupabaseConfig()) {
    try {
      const { data, error } = await getSupabase().rpc('consume_api_rate_limit', {
        p_key: key,
        p_limit: limit,
        p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000))
      });

      if (!error) {
        const result = Array.isArray(data) ? data[0] : data;
        if (result?.allowed === false) {
          const rateError = new Error('Too many requests. Try again later.');
          rateError.statusCode = 429;
          rateError.retryAfter = Number(result.retry_after_seconds || 60);
          throw rateError;
        }
        return;
      }
    } catch (error) {
      if (error.statusCode === 429) {
        throw error;
      }
    }
  }

  assertFallbackRateLimit(key, { limit, windowMs });
}

export function assertBodySize(req) {
  const length = Number(req.headers['content-length'] || 0);
  if (length > MAX_BODY_BYTES) {
    const error = new Error('Request body is too large.');
    error.statusCode = 413;
    throw error;
  }
}

export function validateStrongPassword(password) {
  const value = String(password || '');
  return (
    value.length >= 10 &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

function requiredTextFields(fields) {
  return Object.entries(fields)
    .filter(([, value]) => String(value ?? '').trim().length === 0)
    .map(([label]) => label);
}

export function assertRequiredTextFields(fields) {
  const missing = requiredTextFields(fields);
  if (missing.length > 0) {
    const error = new Error(`Complete required fields: ${missing.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }
}

export function assertPositiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    const error = new Error(`Enter a valid ${label}.`);
    error.statusCode = 400;
    throw error;
  }
  return number;
}

export function genericAuthMessage() {
  return 'Invalid login credentials.';
}
