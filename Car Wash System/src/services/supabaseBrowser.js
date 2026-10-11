import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim();
const missingConfig = [
  !supabaseUrl && 'VITE_SUPABASE_URL',
  !supabaseAnonKey && 'VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY)',
].filter(Boolean);
let validSupabaseUrl = false;

if (supabaseUrl) {
  try {
    const url = new URL(supabaseUrl);
    validSupabaseUrl = (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) && Boolean(url.host);
  } catch {
    // Report configuration problems on the sign-in screen instead of crashing app startup.
  }
}

export const supabaseConfigMessage = missingConfig.length || !validSupabaseUrl
  ? 'Sign-in is temporarily unavailable. Please try again later or contact support.'
  : '';

export function userFacingErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const message = String(error?.message || error || '').trim();
  const normalized = message.toLowerCase();
  const code = String(error?.code || '');

  if (error instanceof TypeError || /failed to fetch|network error|timeout|aborted/i.test(normalized)) {
    return 'We could not connect to OshaHub. Check your internet connection and try again.';
  }
  if (/invalid login credentials|invalid email or password|user not found|no user found/.test(normalized)) {
    return 'Email or password is incorrect. Check your details and try again.';
  }
  if (/email not confirmed|email address not confirmed/.test(normalized)) {
    return 'Verify your email before signing in. Check your inbox for the verification message.';
  }
  if (/user already registered|already been registered|email.*already exists/.test(normalized)) {
    return 'An account with this email already exists. Sign in or reset your password.';
  }
  if (/password.*(weak|least|short)|weak password/.test(normalized)) {
    return 'Choose a stronger password with at least 10 characters.';
  }
  if (/rate limit|too many requests|too many attempts/.test(normalized) || code === '429') {
    return 'There have been too many attempts. Wait a few minutes, then try again.';
  }
  if (/invitation|invite/.test(normalized) && /expired|invalid|already used|not found/.test(normalized)) {
    return 'This invitation is no longer valid. Ask the business administrator for a new link.';
  }
  if (/beginning with 01 or 07|valid kenyan mobile|phone number/.test(normalized)) {
    return 'Enter a valid Kenyan mobile number beginning with 01 or 07.';
  }
  if (/email.*(invalid|valid)|invalid email/.test(normalized)) {
    return 'Enter a valid email address.';
  }
  if (/permission denied|not authorized|active .* access is required|access denied|row-level security/.test(normalized) || code === '42501') {
    return 'You do not have permission to do that. Contact your business administrator if you need access.';
  }
  if (/not found|no longer exists|could not find/.test(normalized) || code === 'P0002') {
    return 'That record could not be found. Refresh the page and try again.';
  }
  if (/already exists|duplicate key|unique constraint/.test(normalized) || code === '23505') {
    return 'A record with those details already exists. Check the information and try again.';
  }
  if (/subscription|plan is restricted|billing/.test(normalized)) {
    return 'This business workspace is temporarily unavailable. Contact the business administrator.';
  }
  if (/invalid|must be|choose |enter |select |required|between \d+ and \d+/.test(normalized) && /^(22023|23514|23503|)$/.test(code)) {
    return 'Check the information and try again.';
  }
  return fallback;
}

export function supabaseErrorMessage(error, fallback = 'Unable to connect to OshaHub.') {
  return userFacingErrorMessage(error, fallback);
}

function fetchWithTimeout(input, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const abortFromCaller = () => controller.abort();
  if (init.signal?.aborted) abortFromCaller();
  else init.signal?.addEventListener('abort', abortFromCaller, { once: true });
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abortFromCaller);
  });
}

export const supabaseBrowser =
  !supabaseConfigMessage
    ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
          // All OshaHub entry pages use the same Supabase project and origin, so
          // keep the Auth session available when users move between portals.
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
      },
      global: { fetch: fetchWithTimeout },
      })
    : null;
