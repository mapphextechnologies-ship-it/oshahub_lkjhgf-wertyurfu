import { readJson, sendJson } from '../_lib/http.js';
import { verifyPasswordResetOtp } from '../_lib/database.js';
import { assertBodySize, assertRateLimit } from '../_lib/security.js';
import { logInfo } from '../_lib/logging.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'auth-verify-otp', limit: 10, windowMs: 60_000 });
    const body = await readJson(req);
    const requestedEmail = String(body.email || body.identifier || '').trim();
    const normalizedEmail = requestedEmail.toLowerCase();
    logInfo('auth_verify_otp.request_received', {
      requestedEmail,
      normalizedEmail
    });

    if (process.env.BACKEND_API_URL) {
      const response = await fetch(`${process.env.BACKEND_API_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({}));
      logInfo('auth_verify_otp.response_success', {
        requestedEmail,
        normalizedEmail,
        otpRecordEmail: data.otpRecordEmail || data.request?.email || normalizedEmail,
        resetTokenCreated: Boolean(data.resetToken),
        expiresAt: data.resetTokenExpiresAt || data.request?.reset_token_expires_at || null,
        requestId: data.request?.id || null
      });
      sendJson(res, response.status, data);
      return;
    }

    const result = await verifyPasswordResetOtp(body);
    logInfo('auth_verify_otp.response_success', {
      requestedEmail,
      normalizedEmail,
      otpRecordEmail: result.otpRecordEmail || result.request?.email || normalizedEmail,
      resetTokenCreated: Boolean(result.resetToken),
      expiresAt: result.resetTokenExpiresAt || result.request?.reset_token_expires_at || null,
      requestId: result.request?.id || null
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
