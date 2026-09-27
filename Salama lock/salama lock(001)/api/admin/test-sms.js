import { readJson, sendJson } from '../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../_lib/security.js';
import { requirePortalUser } from '../_lib/supabase.js';
import { getSmsStatus, normalizeSmsProviderErrorMessage, publicAppBaseUrl, sendSms, smsConfigDiagnostics } from '../_lib/africastalking.js';

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'admin-test-sms', limit: 5, windowMs: 60_000 });
    await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const phone = String(body.phone || '').trim();
    const senderMode = String(body.senderMode || body.sender_mode || '').trim().toLowerCase() === 'default'
      ? 'default'
      : 'configured';
    const testType = String(body.testType || body.test_type || '').trim().toLowerCase() === 'otp'
      ? 'otp'
      : 'service';

    if (!phone) {
      sendJson(res, 400, { message: 'Enter a phone number.' });
      return;
    }

    const result = await sendSms({
      to: phone,
      purpose: testType === 'otp' ? 'otp_diagnostic' : 'service_test',
      message: testType === 'otp'
        ? `SALAMA LOCK Paygo diagnostic OTP test code 000000. This code cannot reset an account. Sent at ${new Date().toISOString()}.`
        : `SALAMA LOCK Paygo service SMS test from ${publicAppBaseUrl()} at ${new Date().toISOString()}.`,
      senderMode,
      sourcePortal: 'admin-test'
    });
    const waitSeconds = Math.min(Math.max(Number(body.waitSeconds || 0), 0), 10);
    const finalStatus = result.sid && waitSeconds > 0
      ? await delay(waitSeconds * 1000).then(() => getSmsStatus(result.sid))
      : null;

    sendJson(res, 200, {
      appUrl: publicAppBaseUrl(),
      smsConfig: smsConfigDiagnostics(),
      senderMode,
      testType,
      result,
      finalStatus
    });
  } catch (error) {
    const providerMessage = error.providerResponse?.SMSMessageData?.Recipients?.[0]?.status
      || error.providerResponse?.message
      || error.providerResponse?.errorMessage
      || error.message;
    sendJson(res, error.statusCode || 500, {
      message: normalizeSmsProviderErrorMessage(providerMessage),
      smsConfig: smsConfigDiagnostics(),
      providerResponse: error.providerResponse || null,
      providerCode: error.providerCode || error.providerResponse?.SMSMessageData?.Recipients?.[0]?.statusCode || null
    });
  }
}
