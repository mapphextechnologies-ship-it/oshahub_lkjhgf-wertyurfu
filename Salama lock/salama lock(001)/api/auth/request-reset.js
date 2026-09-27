import { readJson, sendJson } from '../_lib/http.js';
import { requestPasswordResetOtp } from '../_lib/database.js';
import { assertBodySize, assertRateLimit } from '../_lib/security.js';
import { logError, logInfo } from '../_lib/logging.js';

function normalizePasswordResetSmsErrorMessage(message) {
  const rawMessage = String(message || '').trim();
  const normalizedMessage = rawMessage.toLowerCase().replace(/\s+/g, '');

  if (normalizedMessage.includes('invalidphonenumber') || normalizedMessage.includes('invalidphone')) {
    return 'The phone number linked to this account is invalid. Update the account phone number and try again.';
  }

  if (normalizedMessage.includes('userinblacklist') || normalizedMessage.includes('blacklist') || normalizedMessage.includes('optedout') || normalizedMessage.includes('unsubscribed')) {
    return 'The phone number linked to this account is blacklisted or opted out from Africa\'s Talking SMS. Ask the user to opt back in or update the account phone number.';
  }

  return rawMessage || 'OTP delivery failed.';
}

function sanitizePasswordResetResponse(data = {}) {
  if (!data || typeof data !== 'object') return data;

  const message = normalizePasswordResetSmsErrorMessage(data.message || data.error);
  return {
    ...data,
    message,
    error: data.error ? message : data.error
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'auth-request-reset', limit: 5, windowMs: 60_000 });
    const body = await readJson(req);
    const requestedEmail = String(body.email || body.identifier || '').trim();
    const normalizedEmail = requestedEmail.toLowerCase();
    logInfo('auth_request_reset.request_received', {
      requestedEmail,
      normalizedEmail,
      sourcePortal: String(body.sourcePortal || body.source_portal || 'finance').trim() || 'finance',
      senderMode: String(body.senderMode || body.sender_mode || '').trim().toLowerCase() === 'default' ? 'default' : 'configured'
    });

    if (process.env.BACKEND_API_URL) {
      const response = await fetch(`${process.env.BACKEND_API_URL}/auth/request-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({}));
      logInfo('auth_request_reset.response_success', {
        requestedEmail,
        normalizedEmail,
        otpRecordEmail: data.otpRecordEmail || data.request?.email || normalizedEmail,
        providerAccepted: Boolean(data.providerAccepted ?? data.sent),
        requestId: data.request?.id || null
      });
      sendJson(res, response.status, sanitizePasswordResetResponse(data));
      return;
    }

    const result = await requestPasswordResetOtp(body);
    logInfo('auth_request_reset.response_success', {
      requestedEmail,
      normalizedEmail,
      otpRecordEmail: result.otpRecordEmail || result.request?.email || normalizedEmail,
      providerAccepted: Boolean(result.providerAccepted ?? result.sent),
      requestId: result.request?.id || null
    });
    sendJson(res, 201, sanitizePasswordResetResponse(result));
  } catch (error) {
    logError('auth_request_reset.response_error', { error });
    if (error.retryAfterSeconds) {
      res.setHeader('Retry-After', String(error.retryAfterSeconds));
    }
    sendJson(res, error.statusCode || 500, {
      message: normalizePasswordResetSmsErrorMessage(error.message),
      retryAfterSeconds: error.retryAfterSeconds || null,
      resendAvailableAt: error.resendAvailableAt || null
    });
  }
}
