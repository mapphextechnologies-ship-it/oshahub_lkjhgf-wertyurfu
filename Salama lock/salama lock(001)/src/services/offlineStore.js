const CACHE_PREFIX = 'SALAMA LOCK-offline-cache:';

function safeParse(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function readCachedJson(key, fallback = null) {
  if (typeof window === 'undefined') return fallback;

  try {
    return safeParse(window.localStorage.getItem(`${CACHE_PREFIX}${key}`), fallback);
  } catch {
    return fallback;
  }
}

export function writeCachedJson(key, value) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Cache writes must never break the app.
  }
}

