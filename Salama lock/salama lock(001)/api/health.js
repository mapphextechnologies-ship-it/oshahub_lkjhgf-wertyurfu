import { sendJson } from './_lib/http.js';
import { proxyBackend } from './_lib/backend.js';
import { hasCallbackSecret } from './_lib/callbackAuth.js';
import { getSupabase, hasSupabaseAuthConfig, hasSupabaseConfig } from './_lib/supabase.js';
import { hasSmsConfig, smsConfigDiagnostics } from './_lib/africastalking.js';
import { darajaPaymentDiagnostics } from './_lib/daraja.js';
import { phoneLockerDiagnostics } from './_lib/phone-locker.js';

const REQUIRED_TABLES = [
  'admin_profiles',
  'system_settings',
  'admin_audit_logs',
  'agents',
  'customers',
  'customer_applications',
  'inventory_products',
  'payments',
  'commissions',
  'finance_notifications',
  'agent_notifications',
  'api_rate_limits',
  'sms_send_locks',
  'sms_logs',
  'sms_delivery_reports'
];

const TABLE_PROBES = {
  sms_send_locks: 'dedupe_key,recipient_phone,purpose,message_hash,status,expires_at,event_type,event_id,customer_id,phone_number,cooldown_until',
  sms_logs: 'message_id,phone,purpose,provider_status,delivery_status,delivered_at',
  sms_delivery_reports: 'provider_message_id,recipient_phone,purpose,provider_status,delivery_status,delivered_at'
};

function redactUrlSecret(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    for (const key of ['secret', 'token', 'key']) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, 'configured');
      }
    }
    return url.toString();
  } catch {
    return raw.replace(/([?&](?:secret|token|key)=)[^&]+/gi, '$1configured');
  }
}

async function checkTable(supabase, table) {
  const { error } = await supabase.from(table).select(TABLE_PROBES[table] || '*').limit(1);
  return {
    table,
    ok: !error,
    error: error ? error.message : null
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    res.end();
    return;
  }

  if (!process.env.BACKEND_API_URL) {
    if (!hasSupabaseConfig()) {
      sendJson(res, 200, {
        ok: true,
        mode: 'api-ready',
        databaseConfigured: false,
        supabaseUrlConfigured: Boolean(process.env.SUPABASE_URL),
        supabaseAnonKeyConfigured: Boolean(process.env.SUPABASE_ANON_KEY),
        supabaseAuthConfigured: hasSupabaseAuthConfig(),
        supabaseServiceRoleValid: false,
        stateless: true,
        region: process.env.VERCEL_REGION || process.env.AWS_REGION || 'local',
        deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
        deployment: {
          commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
          branch: process.env.VERCEL_GIT_COMMIT_REF || null,
          repo: process.env.VERCEL_GIT_REPO_SLUG || null
        },
        checkedAt: new Date().toISOString()
      });
      return;
    }

    const serviceRoleCheck = await getSupabase().auth.admin.listUsers({ page: 1, perPage: 1 });
    const tableChecks = serviceRoleCheck.error
      ? []
      : await Promise.all(REQUIRED_TABLES.map((table) => checkTable(getSupabase(), table)));

    sendJson(res, 200, {
      ok: !serviceRoleCheck.error && hasSupabaseAuthConfig() && tableChecks.every((check) => check.ok),
      mode: 'supabase',
      databaseConfigured: true,
      supabaseUrlConfigured: Boolean(process.env.SUPABASE_URL),
      supabaseAnonKeyConfigured: Boolean(process.env.SUPABASE_ANON_KEY),
      supabaseAuthConfigured: hasSupabaseAuthConfig(),
      supabaseServiceRoleValid: !serviceRoleCheck.error,
      tableChecks,
      automation: {
        cronSecretConfigured: Boolean(process.env.CRON_SECRET || process.env.FOLLOW_UP_CRON_SECRET),
        paymentCallbackSecretConfigured: Boolean(process.env.PAYMENT_CALLBACK_SECRET || process.env.WEBHOOK_SECRET),
        payoutCallbackSecretConfigured: Boolean(process.env.PAYOUT_CALLBACK_SECRET || process.env.WEBHOOK_SECRET),
        otpPepperConfigured: Boolean(process.env.OTP_PEPPER && process.env.OTP_PEPPER !== 'SALAMA LOCK-paygo'),
        smsConfigured: hasSmsConfig(),
        smsProvider: smsConfigDiagnostics().provider,
        smsConfig: smsConfigDiagnostics(),
        smsDeliveryReportCallbackConfigured: hasCallbackSecret(['AFRICASTALKING_DELIVERY_REPORT_SECRET', 'AFRICAS_TALKING_DELIVERY_REPORT_SECRET']),
        smsDeliveryReportCallbackPath: '/api/sms/delivery-report',
        smsStorageReady: ['sms_send_locks', 'sms_logs', 'sms_delivery_reports']
          .every((table) => tableChecks.some((check) => check.table === table && check.ok)),
        passwordResetOtpProvider: hasSmsConfig() ? 'africastalking_sms_only' : 'sms_not_configured',
        passwordResetOtpConfigured: hasSmsConfig() && Boolean(process.env.OTP_PEPPER && process.env.OTP_PEPPER !== 'SALAMA LOCK-paygo'),
        paymentProvider: process.env.PAYMENT_PROVIDER || 'daraja',
        paymentConfig: darajaPaymentDiagnostics(),
        phoneLockerConfig: phoneLockerDiagnostics(),
        honorConfig: phoneLockerDiagnostics({ lockerProvider: 'honor' }),
        trustonicConfig: phoneLockerDiagnostics({ lockerProvider: 'trustonic' }),
        paymentCallbackUrls: {
          c2bValidationUrl: redactUrlSecret(process.env.DARAJA_C2B_VALIDATION_URL || process.env.MPESA_C2B_VALIDATION_URL || ''),
          c2bConfirmationUrl: redactUrlSecret(process.env.DARAJA_C2B_CONFIRMATION_URL || process.env.MPESA_C2B_CONFIRMATION_URL || ''),
          callbackUrl: redactUrlSecret(process.env.DARAJA_CALLBACK_URL || process.env.MPESA_CALLBACK_URL || '')
        },
        commissionPayoutProvider: process.env.COMMISSION_PAYOUT_PROVIDER || process.env.PAYOUT_PROVIDER || 'daraja'
      },
      error: serviceRoleCheck.error
        ? serviceRoleCheck.error.message
        : !hasSupabaseAuthConfig()
          ? 'SUPABASE_ANON_KEY is missing. Login routes cannot sign users in.'
          : tableChecks.find((check) => !check.ok)?.error || null,
      stateless: true,
      region: process.env.VERCEL_REGION || process.env.AWS_REGION || 'local',
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
      deployment: {
        commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
        branch: process.env.VERCEL_GIT_COMMIT_REF || null,
        repo: process.env.VERCEL_GIT_REPO_SLUG || null
      },
      checkedAt: new Date().toISOString()
    });
    return;
  }

  await proxyBackend(req, res, '/health');
}
