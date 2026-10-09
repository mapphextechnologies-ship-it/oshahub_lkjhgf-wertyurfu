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

export const supabaseConfigMessage = missingConfig.length
  ? `Add ${missingConfig.join(' and ')} to your environment, then restart the dev server or redeploy.`
  : !validSupabaseUrl
    ? 'VITE_SUPABASE_URL must be a valid Supabase project URL (HTTPS, except localhost development).'
    : '';

export function supabaseErrorMessage(error, fallback = 'Unable to connect to OshaHub.') {
  const message = error?.message || '';
  if (error instanceof TypeError || /failed to fetch|network error|timeout/i.test(message)) {
    return 'Cannot reach the OshaHub database. Check that the Supabase project is active and that Vercel has the correct VITE_SUPABASE_URL and public anon/publishable key for Production, then redeploy.';
  }
  return message || fallback;
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
