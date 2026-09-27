import { supabaseBrowser } from './supabaseBrowser.js';

const AUTH_TOKEN_KEY = 'SALAMA LOCK-auth-token';
const AUTH_REFRESH_TOKEN_KEY = 'SALAMA LOCK-auth-refresh-token';
const AUTH_EXPIRES_AT_KEY = 'SALAMA LOCK-auth-expires-at';

function parseExpiresAt(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number > 10_000_000_000 ? number : Date.now() + number * 1000;
}

function parseJwtExpiresAt(token) {
  const text = String(token || '').trim();
  if (!text) return 0;

  const parts = text.split('.');
  if (parts.length < 2) return 0;

  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const expiresAt = Number(payload.exp || 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) return 0;
    return expiresAt > 10_000_000_000 ? expiresAt : expiresAt * 1000;
  } catch {
    return 0;
  }
}

function getDerivedExpiresAt(session = {}) {
  return parseExpiresAt(session.expires_at || session.expiresAt) ||
    (session.expires_in ? Date.now() + Number(session.expires_in) * 1000 : 0) ||
    parseJwtExpiresAt(session.access_token || session.token);
}

export function getAuthToken() {
  return window.sessionStorage.getItem(AUTH_TOKEN_KEY) || '';
}

function getAuthRefreshToken() {
  return window.sessionStorage.getItem(AUTH_REFRESH_TOKEN_KEY) || '';
}

function getAuthExpiresAt() {
  return Number(window.sessionStorage.getItem(AUTH_EXPIRES_AT_KEY) || 0);
}

function getAuthSession() {
  return {
    token: getAuthToken(),
    refreshToken: getAuthRefreshToken(),
    expiresAt: getAuthExpiresAt()
  };
}

export function setAuthSession(session = {}) {
  const token = String(session.access_token || session.token || '').trim();
  const refreshToken = String(session.refresh_token || session.refreshToken || '').trim();
  const expiresAt = getDerivedExpiresAt(session);

  if (!token) {
    clearAuthSession();
    return;
  }

  window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);

  if (refreshToken) {
    window.sessionStorage.setItem(AUTH_REFRESH_TOKEN_KEY, refreshToken);
  } else {
    window.sessionStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
  }

  if (expiresAt) {
    window.sessionStorage.setItem(AUTH_EXPIRES_AT_KEY, String(expiresAt));
  } else {
    window.sessionStorage.removeItem(AUTH_EXPIRES_AT_KEY);
  }
}

function setAuthToken(token) {
  if (!token) {
    clearAuthSession();
    return;
  }

  window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  window.sessionStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
  const expiresAt = parseJwtExpiresAt(token);
  if (expiresAt) {
    window.sessionStorage.setItem(AUTH_EXPIRES_AT_KEY, String(expiresAt));
  } else {
    window.sessionStorage.removeItem(AUTH_EXPIRES_AT_KEY);
  }
}

export function clearAuthSession() {
  window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
  window.sessionStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
  window.sessionStorage.removeItem(AUTH_EXPIRES_AT_KEY);
}

export function isAuthSessionExpired(bufferMs = 60_000) {
  const expiresAt = getAuthExpiresAt();
  if (expiresAt) {
    return Date.now() >= Math.max(0, expiresAt - bufferMs);
  }

  const token = getAuthToken();
  const derivedExpiresAt = parseJwtExpiresAt(token);
  if (!derivedExpiresAt) return false;
  return Date.now() >= Math.max(0, derivedExpiresAt - bufferMs);
}

export async function refreshAuthToken({ force = false } = {}) {
  const session = getAuthSession();
  if (!session.token || !supabaseBrowser) return session.token || '';

  const expiresAt = getAuthExpiresAt() || parseJwtExpiresAt(session.token);
  if (!session.refreshToken) {
    if (expiresAt && Date.now() >= Math.max(0, expiresAt - 60_000)) {
      clearAuthSession();
      return '';
    }
    if (!force) return session.token;
  }

  if (!force && !isAuthSessionExpired()) return session.token;

  try {
    const { data, error } = await supabaseBrowser.auth.refreshSession({
      refresh_token: session.refreshToken
    });

    if (error || !data?.session?.access_token) {
      clearAuthSession();
      return '';
    }

    setAuthSession(data.session);
    return data.session.access_token;
  } catch {
    clearAuthSession();
    return '';
  }
}
