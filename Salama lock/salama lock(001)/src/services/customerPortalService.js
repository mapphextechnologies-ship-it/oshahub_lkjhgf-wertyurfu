import { buildApiUrl } from './apiUrl.js';

const CUSTOMER_TOKEN_KEY = 'SALAMA LOCK-customer-token';
const REQUEST_TIMEOUT_MS = 20000;

export function getCustomerToken() {
  return window.sessionStorage.getItem(CUSTOMER_TOKEN_KEY) || '';
}

function setCustomerSession({ token }) {
  window.sessionStorage.setItem(CUSTOMER_TOKEN_KEY, token);
}

function clearCustomerSession() {
  window.sessionStorage.removeItem(CUSTOMER_TOKEN_KEY);
}

async function request(path, { method = 'GET', body } = {}) {
  const token = getCustomerToken();
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
    const error = new Error(data.message || 'Customer request failed. Check your connection and try again.');
    error.statusCode = response.status;
    error.retryAfterSeconds = Number(data.retryAfterSeconds || response.headers.get('Retry-After') || 0);
    error.otpAvailable = Boolean(data.otpAvailable);
    error.linkedPhoneMasked = String(data.linkedPhoneMasked || '');
    throw error;
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

export const customerPortalService = {
  hasSession() {
    return Boolean(getCustomerToken());
  },

  async login({ email, password }) {
    const data = await request('/api/customer/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    setCustomerSession(data);
    return data.user;
  },

  async requestActivationOtp({ phone }) {
    return request('/api/customer/auth/activation-otp', {
      method: 'POST',
      body: { phone }
    });
  },

  async activate({ otp, email, password }) {
    if (email && !isStrongPassword(password)) {
      throw new Error('Password must be at least 10 characters and include uppercase, lowercase, number, and special character.');
    }

    const data = await request('/api/customer/auth/activate', {
      method: 'POST',
      body: { otp, email, password }
    });
    if (data.token) setCustomerSession(data);
    return data;
  },

  logout() {
    clearCustomerSession();
  },

  async loadPortal() {
    const data = await request('/api/customer/portal');
    return data.portal;
  },

  async createPaymentRequest({ amount, phone, accountReference }) {
    return request('/api/customer/payment-requests', {
      method: 'POST',
      body: { amount, phone, accountReference }
    });
  },

  async requestPasswordReset({ email }) {
    const trimmedEmail = String(email || '').trim();
    if (!trimmedEmail.includes('@') || /\s/.test(trimmedEmail)) {
      throw new Error('Enter your email address.');
    }
    return request('/api/customer/password-reset-requests', {
      method: 'POST',
      body: { email: trimmedEmail, sourcePortal: 'customer' }
    });
  },

  async verifyPasswordResetOtp({ email, otp }) {
    const normalizedEmail = String(email || '').trim();
    return request('/api/auth/verify-otp', {
      method: 'POST',
      body: { email: normalizedEmail, otp, sourcePortal: 'customer' }
    });
  },

  async resetPassword({ email, resetToken, otp, password }) {
    if (!isStrongPassword(password)) {
      throw new Error('Password must be at least 10 characters and include uppercase, lowercase, number, and special character.');
    }

    const normalizedEmail = String(email || '').trim();

    return request('/api/auth/reset-password', {
      method: 'POST',
      body: {
        email: normalizedEmail,
        resetToken: resetToken || otp || '',
        password,
        sourcePortal: 'customer'
      }
    });
  }
};
