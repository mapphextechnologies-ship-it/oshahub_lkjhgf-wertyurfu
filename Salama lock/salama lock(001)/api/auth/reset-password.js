import { readJson, sendJson } from '../_lib/http.js';
import { resetPasswordWithOtp } from '../_lib/database.js';
import { assertBodySize, assertRateLimit } from '../_lib/security.js';
import { logError, logInfo } from '../_lib/logging.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'auth-reset-password', limit: 5, windowMs: 60_000 });
    const body = await readJson(req);
    const requestedEmail = String(body.email || body.identifier || '').trim();
    const normalizedEmail = requestedEmail.toLowerCase();
    logInfo('auth_reset_password.request_received', {
      requestedEmail,
      normalizedEmail,
      resetTokenProvided: Boolean(String(body.resetToken || body.reset_token || body.otp || '').trim())
    });

    if (process.env.BACKEND_API_URL) {
      const response = await fetch(`${process.env.BACKEND_API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({}));
      logInfo('auth_reset_password.response_success', {
        requestedEmail,
        normalizedEmail,
        otpRecordEmail: data.otpRecordEmail || data.request?.email || normalizedEmail,
        usedAt: data.usedAt || data.request?.reset_token_used_at || null,
        requestId: data.request?.id || null
      });
      sendJson(res, response.status, data);
      return;
    }

    const result = await resetPasswordWithOtp(body);
    logInfo('auth_reset_password.response_success', {
      requestedEmail,
      normalizedEmail,
      otpRecordEmail: result.otpRecordEmail || result.request?.email || normalizedEmail,
      usedAt: result.usedAt || result.request?.reset_token_used_at || null,
      requestId: result.request?.id || null
    });
    sendJson(res, 200, result);
  } catch (error) {
    logError('auth_reset_password.response_error', { error });
    logError('reset_password_failed', {
      message: error.message || 'Password reset failed.',
      statusCode: error.statusCode || 500
    });
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
