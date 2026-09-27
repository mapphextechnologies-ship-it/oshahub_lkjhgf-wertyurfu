import { readJson, sendJson, sendOptions } from '../../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../../_lib/security.js';
import { createOtp, hashOtp } from '../../_lib/database.js';
import {
  normalizeKenyanPhone,
  normalizeSmsProviderErrorMessage,
  sendOtpSms
} from '../../_lib/africastalking.js';
import { getSupabase } from '../../_lib/supabase.js';
import { logError, logInfo, logWarn } from '../../_lib/logging.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

export function activationPhoneCandidates(value) {
  const canonical = normalizeKenyanPhone(value);
  if (!canonical) return [];

  const national = canonical.slice(4);
  return [...new Set([
    canonical,
    canonical.slice(1),
    `0${national}`,
    national
  ])];
}

function maskPhone(value) {
  const phone = String(value || '').trim();
  if (phone.length <= 6) return `${phone.slice(0, 2)}...`;
  return `${phone.slice(0, 4)}...${phone.slice(-4)}`;
}

function activationIsApproved(customer) {
  return ['approved', 'active'].includes(String(customer?.application_status || '').toLowerCase());
}

function secondsUntilResend(sentAt, now = Date.now()) {
  const sentAtMs = Date.parse(String(sentAt || ''));
  if (!Number.isFinite(sentAtMs)) return 0;
  return Math.max(0, Math.ceil((sentAtMs + OTP_RESEND_COOLDOWN_MS - now) / 1000));
}

async function findCustomerByPhone(phoneCandidates) {
  const result = await getSupabase()
    .from('customers')
    .select('id,customer_phone,application_status,auth_user_id,customer_activation_otp_status,customer_activation_otp_sent_at')
    .in('customer_phone', phoneCandidates)
    .limit(3);

  if (result.error) throw result.error;
  const customers = result.data || [];
  if (customers.length > 1) {
    const error = new Error('More than one customer uses this phone number. Contact support before activating the account.');
    error.statusCode = 409;
    throw error;
  }
  return customers[0] || null;
}

async function markOtpFailed(customerId) {
  const result = await getSupabase()
    .from('customers')
    .update({ customer_activation_otp_status: 'failed' })
    .eq('id', customerId)
    .neq('customer_activation_otp_status', 'verified');

  if (result.error) {
    logError('customer_activation_otp.failure_status_update_failed', {
      customerId,
      error: result.error
    });
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendOptions(res, 'POST,OPTIONS');
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'customer-activation-otp', limit: 6, windowMs: 60_000 });
    const body = await readJson(req);
    const phoneCandidates = activationPhoneCandidates(body.phone);

    if (!phoneCandidates.length) {
      sendJson(res, 400, { message: 'Enter the Kenyan phone number used during customer onboarding.' });
      return;
    }

    const customer = await findCustomerByPhone(phoneCandidates);
    if (!customer) {
      sendJson(res, 404, { message: 'No customer account was found for this phone number.' });
      return;
    }

    const otpStatus = String(customer.customer_activation_otp_status || '').toLowerCase();
    if (otpStatus === 'verified' || customer.auth_user_id) {
      sendJson(res, 409, { message: 'This customer account is already activated. Sign in or use Forgot password.' });
      return;
    }

    if (!activationIsApproved(customer)) {
      sendJson(res, 403, { message: 'This customer account has not been approved for activation yet.' });
      return;
    }

    const retryAfterSeconds = ['sent', 'failed'].includes(otpStatus)
      ? secondsUntilResend(customer.customer_activation_otp_sent_at)
      : 0;
    if (retryAfterSeconds > 0) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      sendJson(res, 429, {
        message: otpStatus === 'sent'
          ? `An activation OTP was already sent. Try again in ${retryAfterSeconds} seconds.`
          : `The previous SMS request may still be processing. Try again in ${retryAfterSeconds} seconds.`,
        retryAfterSeconds,
        otpAvailable: otpStatus === 'sent',
        linkedPhoneMasked: maskPhone(customer.customer_phone)
      });
      return;
    }

    const otp = createOtp();
    const sentAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
    let otpUpdate = getSupabase()
      .from('customers')
      .update({
        customer_activation_otp_hash: hashOtp(customer.id, otp),
        customer_activation_otp_expires_at: expiresAt,
        customer_activation_otp_sent_at: sentAt,
        customer_activation_otp_status: 'sent'
      })
      .eq('id', customer.id)
      .neq('customer_activation_otp_status', 'verified')
      .eq('customer_activation_otp_status', customer.customer_activation_otp_status || 'not_sent');

    otpUpdate = customer.customer_activation_otp_sent_at
      ? otpUpdate.eq('customer_activation_otp_sent_at', customer.customer_activation_otp_sent_at)
      : otpUpdate.is('customer_activation_otp_sent_at', null);

    const otpRecord = await otpUpdate.select('id').maybeSingle();

    if (otpRecord.error) throw otpRecord.error;
    if (!otpRecord.data) {
      sendJson(res, 409, { message: 'An activation OTP request is already being processed. Wait a moment before trying again.' });
      return;
    }

    const requestId = `customer-activation:${customer.id}:${sentAt}`;
    let delivery;
    try {
      delivery = await sendOtpSms({
        phone: customer.customer_phone,
        otp,
        requestId,
        sourcePortal: 'customer-onboarding',
        customerId: customer.id
      });
    } catch (error) {
      await markOtpFailed(customer.id);
      error.retryAfter = Math.max(Number(error.retryAfter || 0), OTP_RESEND_COOLDOWN_MS / 1000);
      throw error;
    }

    const providerAccepted = Boolean(delivery?.providerAccepted ?? delivery?.sent);
    if (!providerAccepted) {
      await markOtpFailed(customer.id);
      const providerMessage = delivery?.providerStatus
        || delivery?.response?.SMSMessageData?.Recipients?.[0]?.status
        || delivery?.reason
        || 'The SMS provider did not accept the activation OTP.';
      const error = new Error(normalizeSmsProviderErrorMessage(providerMessage));
      error.statusCode = 502;
      error.retryAfter = OTP_RESEND_COOLDOWN_MS / 1000;
      throw error;
    }

    logInfo('customer_activation_otp.sent', {
      customerId: customer.id,
      linkedPhone: maskPhone(customer.customer_phone),
      requestId,
      providerAccepted
    });

    sendJson(res, 201, {
      sent: true,
      providerAccepted: true,
      linkedPhoneMasked: maskPhone(customer.customer_phone),
      expiresAt,
      retryAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
      message: 'Activation OTP sent to the phone number used during onboarding.'
    });
  } catch (error) {
    logWarn('customer_activation_otp.failed', { error });
    if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
    sendJson(res, error.statusCode || 500, {
      message: normalizeSmsProviderErrorMessage(error.message),
      ...(error.retryAfter ? { retryAfterSeconds: Number(error.retryAfter) } : {})
    });
  }
}
