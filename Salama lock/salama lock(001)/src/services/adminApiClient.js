import {
  clearAdminSession,
  getAdminToken,
  refreshAdminToken
} from './adminAuthSession.js';

function parseJsonResponse(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 200) };
  }
}

async function performRequest(path, { method = 'GET', body, token = '' } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  return { response, data: parseJsonResponse(text) };
}

export async function adminApiRequest(path, {
  method = 'GET',
  body,
  requiresAuth = true
} = {}) {
  let token = requiresAuth ? await refreshAdminToken() : '';

  if (requiresAuth && !token) {
    const error = new Error('Your admin session has expired. Sign in again.');
    error.statusCode = 401;
    throw error;
  }

  let { response, data } = await performRequest(path, { method, body, token });

  if (requiresAuth && response.status === 401) {
    token = await refreshAdminToken({ force: true });
    if (token) {
      ({ response, data } = await performRequest(path, { method, body, token }));
    }
  }

  if (!response.ok) {
    if (requiresAuth && response.status === 401 && getAdminToken()) {
      clearAdminSession({ notify: true, reason: 'unauthorized' });
    }
    const error = new Error(data.message || `Admin request failed with HTTP ${response.status}.`);
    error.statusCode = response.status;
    error.retryAfterSeconds = data.retryAfterSeconds || null;
    error.resendAvailableAt = data.resendAvailableAt || null;
    throw error;
  }

  return data;
}
