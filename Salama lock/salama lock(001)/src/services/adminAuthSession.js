const ADMIN_TOKEN_KEY = 'SALAMA LOCK-admin-token';
const ADMIN_REFRESH_TOKEN_KEY = 'SALAMA LOCK-admin-refresh-token';
const ADMIN_EXPIRES_AT_KEY = 'SALAMA LOCK-admin-expires-at';

export const ADMIN_SESSION_EXPIRED_EVENT = 'SALAMA LOCK-admin-session-expired';

let refreshPromise = null;

function sessionStorage() {
  return typeof window !== 'undefined' ? window.sessionStorage : null;
}

function parseJwtExpiresAt(token) {
  const parts = String(token || '').trim().split('.');
  if (parts.length < 2) return 0;

  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const expiresAt = Number(payload.exp || 0);
    return Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt * 1000 : 0;
  } catch {
    return 0;
  }
}

function parseExpiresAt(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed > 10_000_000_000 ? parsed : parsed * 1000;
}

function derivedExpiresAt(session = {}) {
  return parseExpiresAt(session.expiresAt ?? session.expires_at) ||
    (Number(session.expiresIn ?? session.expires_in) > 0
      ? Date.now() + Number(session.expiresIn ?? session.expires_in) * 1000
      : 0) ||
    parseJwtExpiresAt(session.token || session.access_token);
}

function notifySessionExpired(reason = 'session_expired') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ADMIN_SESSION_EXPIRED_EVENT, { detail: { reason } }));
}

export function getAdminToken() {
  return sessionStorage()?.getItem(ADMIN_TOKEN_KEY) || '';
}

export function getAdminSession() {
  const storage = sessionStorage();
  return {
    token: storage?.getItem(ADMIN_TOKEN_KEY) || '',
    refreshToken: storage?.getItem(ADMIN_REFRESH_TOKEN_KEY) || '',
    expiresAt: Number(storage?.getItem(ADMIN_EXPIRES_AT_KEY) || 0)
  };
}

export function setAdminSession(session = {}) {
  const storage = sessionStorage();
  if (!storage) return;

  const token = String(session.token || session.access_token || '').trim();
  const refreshToken = String(session.refreshToken || session.refresh_token || '').trim();
  const expiresAt = derivedExpiresAt(session);

  if (!token) {
    clearAdminSession();
    return;
  }

  storage.setItem(ADMIN_TOKEN_KEY, token);
  if (refreshToken) storage.setItem(ADMIN_REFRESH_TOKEN_KEY, refreshToken);
  else storage.removeItem(ADMIN_REFRESH_TOKEN_KEY);

  if (expiresAt) storage.setItem(ADMIN_EXPIRES_AT_KEY, String(expiresAt));
  else storage.removeItem(ADMIN_EXPIRES_AT_KEY);
}

export function clearAdminSession({ notify = false, reason = 'session_expired' } = {}) {
  const storage = sessionStorage();
  storage?.removeItem(ADMIN_TOKEN_KEY);
  storage?.removeItem(ADMIN_REFRESH_TOKEN_KEY);
  storage?.removeItem(ADMIN_EXPIRES_AT_KEY);
  if (notify) notifySessionExpired(reason);
}

export function isAdminSessionExpiring(bufferMs = 60_000) {
  const session = getAdminSession();
  const expiresAt = session.expiresAt || parseJwtExpiresAt(session.token);
  return Boolean(expiresAt && Date.now() >= Math.max(0, expiresAt - bufferMs));
}

async function requestSessionRefresh(refreshToken) {
  const response = await fetch('/api/admin/auth/refresh', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refreshToken })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.token) {
    const error = new Error(data.message || 'Your admin session has expired. Sign in again.');
    error.statusCode = response.status || 401;
    throw error;
  }

  setAdminSession(data);
  return data.token;
}

export async function refreshAdminToken({ force = false } = {}) {
  const session = getAdminSession();
  if (!session.token) return '';
  if (!force && !isAdminSessionExpiring()) return session.token;

  if (!session.refreshToken) {
    clearAdminSession({ notify: true, reason: 'missing_refresh_token' });
    return '';
  }

  if (!refreshPromise) {
    refreshPromise = requestSessionRefresh(session.refreshToken)
      .catch(() => {
        clearAdminSession({ notify: true, reason: 'refresh_failed' });
        return '';
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}
