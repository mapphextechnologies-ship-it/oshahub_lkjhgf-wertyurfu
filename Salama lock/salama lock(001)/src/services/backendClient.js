import { getAuthToken, refreshAuthToken } from './authSession.js';
import { buildApiUrl } from './apiUrl.js';

async function performRequest(path, { method = 'GET', params, body, token } = {}) {
  const response = await fetch(buildApiUrl(path, params), {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function request(path, { method = 'GET', params, body } = {}) {
  let token = getAuthToken();

  if (token) {
    const refreshed = await refreshAuthToken().catch(() => '');
    if (refreshed) token = refreshed;
  }

  let { response, data } = await performRequest(path, { method, params, body, token });

  if ([401, 403].includes(response.status)) {
    const refreshedToken = await refreshAuthToken({ force: true }).catch(() => '');
    if (refreshedToken && refreshedToken !== token) {
      ({ response, data } = await performRequest(path, { method, params, body, token: refreshedToken }));
    }
  }

  if (!response.ok) {
    const error = new Error(data.message || `Backend request failed: ${path}`);
    error.statusCode = response.status;
    error.response = data;
    error.path = path;
    throw error;
  }

  return data;
}

export const backendClient = {
  isConfigured: true,
  get: (path, params) => request(path, { params }),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path, body) => request(path, { method: 'DELETE', body })
};
