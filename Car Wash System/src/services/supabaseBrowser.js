import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
          // Keep tokens in memory only. Reloading the portal requires a fresh sign-in.
          persistSession: false,
          autoRefreshToken: true,
          detectSessionInUrl: true,
      },
      global: { fetch: fetchWithTimeout },
      })
    : null;
