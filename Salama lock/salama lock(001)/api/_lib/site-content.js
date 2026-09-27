import { getSupabase } from './supabase.js';
import { resolvePaymentConfig } from './payment-config.js';

const supportPhone = '0740418079';
const supportEmail = 'SALAMA LOCKpaygo@gmail.com';

function normalizeSiteValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizeWebsiteContent(value = {}) {
  const website = normalizeSiteValue(value);
  return {
    ...website,
    contact: {
      ...(normalizeSiteValue(website.contact)),
      phone: supportPhone,
      email: supportEmail
    },
    footer: {
      ...(normalizeSiteValue(website.footer)),
      phone: supportPhone,
      email: supportEmail
    }
  };
}

export async function resolveSiteContent() {
  let websiteSettings = {};

  try {
    const { data, error } = await getSupabase()
      .from('system_settings')
      .select('settings_json,saved_at,updated_at')
      .eq('section', 'website')
      .maybeSingle();

    if (!error && data?.settings_json) {
      websiteSettings = normalizeWebsiteContent(data.settings_json);
    }
  } catch {
    websiteSettings = {};
  }

  const paymentConfig = await resolvePaymentConfig();

  return {
    website: websiteSettings,
    paymentConfig
  };
}
