import { readJson, sendJson } from '../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../_lib/security.js';
import { requirePortalUser } from '../_lib/supabase.js';
import { getSmsStatus, normalizeSmsProviderErrorMessage, sendSms, smsConfigDiagnostics } from '../_lib/africastalking.js';

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runOne({ label, phone, senderMode, waitSeconds }) {
  if (!phone) return null;

  try {
    const result = await sendSms({
      to: phone,
      purpose: 'otp_diagnostic',
      senderMode,
      sourcePortal: 'admin-diagnostic',
      message: `SALAMA LOCK Paygo diagnostic OTP test code 000000 for ${label}. This code cannot reset an account.`
    });
    const finalStatus = result.providerMessageId && waitSeconds > 0
      ? await delay(waitSeconds * 1000).then(() => getSmsStatus(result.providerMessageId))
      : null;

    return {
      ok: true,
      label,
      phone,
      senderMode,
      result,
      finalStatus
    };
  } catch (error) {
    const providerMessage = error.providerResponse?.SMSMessageData?.Recipients?.[0]?.status
      || error.providerResponse?.message
      || error.providerResponse?.errorMessage
      || error.message;
    return {
      ok: false,
      label,
      phone,
      senderMode,
      message: normalizeSmsProviderErrorMessage(providerMessage),
      providerCode: error.providerCode || error.providerResponse?.SMSMessageData?.Recipients?.[0]?.statusCode || null,
      providerResponse: error.providerResponse || null
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'admin-sms-diagnostics', limit: 3, windowMs: 60_000 });
    await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const safaricomPhone = String(body.safaricomPhone || body.safaricom_phone || '').trim();
    const airtelPhone = String(body.airtelPhone || body.airtel_phone || '').trim();
    const waitSeconds = Math.min(Math.max(Number(body.waitSeconds || 0), 0), 10);

    if (!safaricomPhone && !airtelPhone) {
      sendJson(res, 400, { message: 'Enter at least one Safaricom or Airtel phone number.' });
      return;
    }

    const tests = [
      { label: 'Safaricom', phone: safaricomPhone, senderMode: 'configured' },
      { label: 'Safaricom', phone: safaricomPhone, senderMode: 'default' },
      { label: 'Airtel', phone: airtelPhone, senderMode: 'configured' },
      { label: 'Airtel', phone: airtelPhone, senderMode: 'default' }
    ];

    const results = [];
    for (const test of tests) {
      const result = await runOne({ ...test, waitSeconds });
      if (result) results.push(result);
    }

    sendJson(res, 200, {
      smsConfig: smsConfigDiagnostics(),
      results
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      message: error.message || 'SMS diagnostics failed.',
      smsConfig: smsConfigDiagnostics()
    });
  }
}
