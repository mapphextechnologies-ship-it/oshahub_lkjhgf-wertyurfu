import { buildApiUrl } from './apiUrl.js';

const ADMIN_TOKEN_KEY = 'SALAMA LOCK-admin-token';
const REQUEST_TIMEOUT_MS = 20000;

function getToken() {
  return window.sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

function setSession({ token }) {
  window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

function clearSession() {
  window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function request(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(buildApiUrl(path), {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal
    });
  } catch (error) {
    throw new Error(error.name === 'AbortError'
      ? 'The request took too long. Please try again.'
      : 'The system is not reachable right now. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  const data = text ? (() => {
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  })() : {};

  if (!response.ok) {
    throw new Error(data.message || 'Admin request failed. Please try again.');
  }

  return data;
}

function isStrongPassword(value) {
  return (
    String(value || '').length >= 10 &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

export const adminPortalService = {
  hasSession() {
    return Boolean(getToken());
  },

  async login({ email, password }) {
    const data = await request('/api/admin/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    setSession(data);
    return data.user;
  },

  async register({ fullName, email, phone, password, setupCode, role }) {
    if (!isStrongPassword(password)) {
      throw new Error('Password must be at least 10 characters and include uppercase, lowercase, number, and special character.');
    }

    return request('/api/admin/auth/register', {
      method: 'POST',
      body: { fullName, email, phone, password, setupCode, role }
    });
  },

  logout() {
    clearSession();
  },

  async loadPortal() {
    const data = await request('/api/admin/portal');
    if (!data?.portal) throw new Error('Admin records were not returned by the shared backend.');
    return data.portal;
  },

  async createAgent(agent) {
    return request('/api/admin/agents', {
      method: 'POST',
      body: agent
    });
  },

  async approveAgent(id) {
    return request(`/api/admin/agents/${encodeURIComponent(id)}/approve`, {
      method: 'POST'
    });
  },

  async createCustomer(customer) {
    return request('/api/admin/customers', {
      method: 'POST',
      body: customer
    });
  },

  async createProduct(product) {
    return request('/api/admin/products', {
      method: 'POST',
      body: product
    });
  },

  async reviewApplication(id, { action, reason }) {
    return request(`/api/admin/applications/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: { action, reason }
    });
  },

  async approveFinanceUser(id) {
    return request(`/api/admin/finance-users/${encodeURIComponent(id)}/approve`, {
      method: 'POST'
    });
  }
};
