import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_SESSION_EXPIRED_EVENT,
  clearAdminSession,
  getAdminSession,
  getAdminToken,
  refreshAdminToken,
  setAdminSession
} from '../src/services/adminAuthSession.js';
import { adminApiRequest } from '../src/services/adminApiClient.js';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function installBrowserMocks(t) {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const events = [];
  const sessionStorage = new MemoryStorage();

  globalThis.window = {
    sessionStorage,
    dispatchEvent(event) {
      events.push(event);
      return true;
    }
  };

  t.after(() => {
    clearAdminSession();
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  return { events, sessionStorage };
}

test('admin session stores access, refresh, and expiry values together', (t) => {
  installBrowserMocks(t);
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;

  setAdminSession({
    token: 'admin-access-token',
    refreshToken: 'admin-refresh-token',
    expiresAt
  });

  assert.equal(getAdminToken(), 'admin-access-token');
  assert.deepEqual(getAdminSession(), {
    token: 'admin-access-token',
    refreshToken: 'admin-refresh-token',
    expiresAt: expiresAt * 1000
  });
});

test('expired admin access token is refreshed before the next request', async (t) => {
  installBrowserMocks(t);
  const nextExpiresAt = Math.floor(Date.now() / 1000) + 3600;
  let refreshCalls = 0;

  setAdminSession({
    token: 'expired-access-token',
    refreshToken: 'valid-refresh-token',
    expiresAt: Math.floor(Date.now() / 1000) - 10
  });

  globalThis.fetch = async (path, options = {}) => {
    refreshCalls += 1;
    assert.equal(path, '/api/admin/auth/refresh');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { refreshToken: 'valid-refresh-token' });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        token: 'fresh-access-token',
        refreshToken: 'rotated-refresh-token',
        expiresAt: nextExpiresAt
      })
    };
  };

  const token = await refreshAdminToken();

  assert.equal(token, 'fresh-access-token');
  assert.equal(refreshCalls, 1);
  assert.equal(getAdminSession().refreshToken, 'rotated-refresh-token');
});

test('admin API retries one 401 after refreshing the session', async (t) => {
  installBrowserMocks(t);
  const nextExpiresAt = Math.floor(Date.now() / 1000) + 3600;
  const calls = [];

  setAdminSession({
    token: 'old-access-token',
    refreshToken: 'valid-refresh-token',
    expiresAt: nextExpiresAt
  });

  globalThis.fetch = async (path, options = {}) => {
    calls.push({ path, authorization: options.headers?.Authorization || '' });

    if (path === '/api/admin/auth/refresh') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          token: 'new-access-token',
          refreshToken: 'rotated-refresh-token',
          expiresAt: nextExpiresAt
        })
      };
    }

    const portalCalls = calls.filter((call) => call.path === '/api/admin/portal').length;
    return portalCalls === 1
      ? { ok: false, status: 401, text: async () => JSON.stringify({ message: 'Expired' }) }
      : { ok: true, status: 200, text: async () => JSON.stringify({ portal: { customers: [] } }) };
  };

  const data = await adminApiRequest('/api/admin/portal');

  assert.deepEqual(data, { portal: { customers: [] } });
  assert.deepEqual(calls.map((call) => call.path), [
    '/api/admin/portal',
    '/api/admin/auth/refresh',
    '/api/admin/portal'
  ]);
  assert.equal(calls[2].authorization, 'Bearer new-access-token');
});

test('failed admin refresh clears the session and emits one expiry event', async (t) => {
  const { events } = installBrowserMocks(t);

  setAdminSession({
    token: 'expired-access-token',
    refreshToken: 'invalid-refresh-token',
    expiresAt: Math.floor(Date.now() / 1000) - 10
  });

  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ message: 'Expired' })
  });

  const token = await refreshAdminToken();

  assert.equal(token, '');
  assert.equal(getAdminToken(), '');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, ADMIN_SESSION_EXPIRED_EVENT);
});
