import { clearAuthSession, getAuthToken, refreshAuthToken, setAuthSession } from './authSession.js';
import { buildApiUrl } from './apiUrl.js';

const REQUEST_TIMEOUT_MS = 20000;

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
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

async function apiRequest(path, { method = 'GET', body, retried = false } = {}) {
  let token = getAuthToken();
  if (token) {
    const refreshed = await refreshAuthToken().catch(() => '');
    if (refreshed) token = refreshed;
  }
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
    if (!retried && [401, 403].includes(response.status)) {
      const refreshedToken = await refreshAuthToken({ force: true }).catch(() => '');
      if (refreshedToken && refreshedToken !== token) {
        return apiRequest(path, { method, body, retried: true });
      }
    }
    const error = new Error(data.message || 'Sign in request failed. Please try again.');
    error.retryAfterSeconds = data.retryAfterSeconds || null;
    error.resendAvailableAt = data.resendAvailableAt || null;
    throw error;
  }

  return data;
}

export const authService = {
  async login(identifier, password) {
    const email = identifier.trim().toLowerCase();

    if (!isValidEmail(email) || password.length < 8) {
      throw new Error('Enter the email and password used during registration.');
    }

    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { identifier: email, password }
    });
    setAuthSession(data);
    return data.user;
  },

  async register({ fullName, email, phone, password }) {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();

    if (!fullName.trim() || !normalizedEmail || !isStrongPassword(password)) {
      throw new Error('Password must be at least 10 characters and include uppercase, lowercase, number, and special character.');
    }

    return apiRequest('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: fullName.trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        password
      }
    });
  },

  async currentUser() {
    const data = await apiRequest('/api/auth/me');
    return data.user;
  },

  async currentProfile() {
    const data = await apiRequest('/api/auth/profile');
    return data.profile;
  },

  async updateProfile(profile) {
    const data = await apiRequest('/api/auth/profile', {
      method: 'PATCH',
      body: profile
    });
    return data.profile;
  },

  async requestPasswordReset(request) {
    const identifier = typeof request === 'string'
      ? request.trim()
      : String(request?.email || request?.identifier || '').trim();
    const senderMode = typeof request === 'object' && request
      ? String(request.senderMode || request.sender_mode || '').trim().toLowerCase() === 'default'
        ? 'default'
        : 'configured'
      : 'configured';

    if (!identifier.includes('@') || /\s/.test(identifier)) {
      throw new Error('Enter your email address.');
    }

    return apiRequest('/api/auth/request-reset', {
      method: 'POST',
      body: {
        email: identifier,
        sourcePortal: 'finance',
        senderMode
      }
    });
  },

  async verifyPasswordResetOtp({ identifier, email, otp }) {
    const normalizedEmail = String(identifier || email || '').trim();
    return apiRequest('/api/auth/verify-otp', {
      method: 'POST',
      body: { email: normalizedEmail, otp, sourcePortal: 'finance' }
    });
  },

  async resetPassword({ identifier, email, resetToken, password, otp }) {
    const normalizedEmail = String(identifier || email || '').trim();
    return apiRequest('/api/auth/reset-password', {
      method: 'POST',
      body: {
        email: normalizedEmail,
        resetToken: resetToken || otp || '',
        password,
        sourcePortal: 'finance'
      }
    });
  },

  logout() {
    clearAuthSession();
  }
};
