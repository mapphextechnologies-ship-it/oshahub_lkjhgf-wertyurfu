import { getSupabase } from './supabase.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }

  return '';
}

function readEnvPaybillNumber() {
  return firstNonEmpty(
    process.env.PAYBILL_NUMBER,
    process.env.DARAJA_C2B_SHORT_CODE,
    process.env.MPESA_C2B_SHORT_CODE,
    process.env.DARAJA_BUSINESS_SHORT_CODE
  );
}

export async function resolvePaymentConfig() {
  let financeSettings = null;

  try {
    const { data, error } = await getSupabase()
      .from('system_settings')
      .select('settings_json,saved_at,updated_at')
      .eq('section', 'finance')
      .maybeSingle();

    if (!error && data?.settings_json && typeof data.settings_json === 'object') {
      financeSettings = data.settings_json;
    }
  } catch {
    financeSettings = null;
  }

  const settingsPaybillNumber = firstNonEmpty(
    financeSettings?.paybillNumber,
    financeSettings?.paybill_number,
    financeSettings?.paymentPaybillNumber,
    financeSettings?.payment_paybill_number,
    financeSettings?.shortCode,
    financeSettings?.short_code,
    financeSettings?.c2bShortCode,
    financeSettings?.c2b_short_code,
    financeSettings?.darajaC2bShortCode,
    financeSettings?.daraja_c2b_short_code
  );
  const envPaybillNumber = readEnvPaybillNumber();
  const paybillNumber = firstNonEmpty(settingsPaybillNumber, envPaybillNumber);

  const accountReferenceLabel = firstNonEmpty(
    financeSettings?.paybillAccountReference,
    financeSettings?.paybill_account_reference,
    financeSettings?.accountReferenceLabel,
    financeSettings?.account_reference_label,
    'National ID'
  );

  const paybillNote = firstNonEmpty(
    financeSettings?.paybillNote,
    financeSettings?.paybill_note,
    'Works for payments from any M-PESA line.'
  );

  return {
    paybillNumber,
    accountReferenceLabel,
    paybillNote,
    configured: Boolean(paybillNumber),
    source: settingsPaybillNumber ? 'system_settings' : (envPaybillNumber ? 'environment' : 'unconfigured')
  };
}
