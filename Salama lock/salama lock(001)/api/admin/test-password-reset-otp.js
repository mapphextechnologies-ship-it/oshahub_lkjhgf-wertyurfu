import { readJson, sendJson } from '../_lib/http.js';
import { requestPasswordResetOtp } from '../_lib/database.js';
import { assertBodySize, assertRateLimit } from '../_lib/security.js';
import { requirePortalUser } from '../_lib/supabase.js';
import { normalizeSmsProviderErrorMessage, smsConfigDiagnostics } from '../_lib/africastalking.js';
import { logError, logInfo } from '../_lib/logging.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'admin-test-password-reset-otp', limit: 5, windowMs: 60_000 });
    await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const identifier = String(body.email || body.identifier || '').trim();
    const senderMode = String(body.senderMode || body.sender_mode || '').trim().toLowerCase() === 'default'
      ? 'default'
      : 'configured';

    logInfo('admin_test_password_reset_otp.request_received', {
      requestedEmail: identifier.toLowerCase(),
      senderMode
    });

    const result = await requestPasswordResetOtp({
      email: identifier,
      senderMode,
      sourcePortal: 'admin-test'
    });

    sendJson(res, 200, {
      smsConfig: smsConfigDiagnostics(),
      otpGenerated: result.otpGenerated,
      otpStored: result.otpStored,
      smsSent: result.smsSent,
      smsMessageId: result.smsMessageId || null,
      smsProviderStatus: result.smsProviderStatus || null,
      smsProviderCode: result.smsProviderCode ?? null,
      providerAccepted: Boolean(result.providerAccepted ?? result.sent),
      providerResponse: result.providerResponse || null,
      request: result.request,
      senderMode
    });
  } catch (error) {
    logError('admin_test_password_reset_otp.response_error', { error });
    const providerMessage = error.providerResponse?.SMSMessageData?.Recipients?.[0]?.status
      || error.providerResponse?.message
      || error.providerResponse?.errorMessage
      || error.message;
    sendJson(res, error.statusCode || 500, {
      message: normalizeSmsProviderErrorMessage(providerMessage),
      smsConfig: smsConfigDiagnostics(),
      providerResponse: error.providerResponse || null,
      providerCode: error.providerCode || null
    });
  }
}
