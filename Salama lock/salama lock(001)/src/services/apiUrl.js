const rawApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim();

function apiBaseUrl() {
  if (!rawApiBaseUrl) return '';

  try {
    const url = new URL(rawApiBaseUrl, window.location.origin);
    if (url.hostname.endsWith('.supabase.co')) return '';
    return url.origin === window.location.origin ? '' : url.origin;
  } catch {
    return '';
  }
}

export function buildApiUrl(path, params = {}) {
  const url = new URL(`${apiBaseUrl()}${path}`, window.location.origin);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
}
