import { buildApiUrl } from './apiUrl.js';
import { getCustomerToken } from './customerPortalService.js';
import { getAuthToken } from './authSession.js';

const SUPPORT_CONVERSATION_KEY = 'SALAMA LOCK-support-conversation-key';
const REQUEST_TIMEOUT_MS = 20000;

function getAnyAuthToken() {
  return getCustomerToken()
    || getAuthToken()
    || window.sessionStorage.getItem('SALAMA LOCK-admin-token')
    || '';
}

function getConversationKey() {
  return window.sessionStorage.getItem(SUPPORT_CONVERSATION_KEY) || '';
}

function setConversationKey(value) {
  const key = String(value || '').trim();
  if (!key) return;
  window.sessionStorage.setItem(SUPPORT_CONVERSATION_KEY, key);
}

function clearConversationKey() {
  window.sessionStorage.removeItem(SUPPORT_CONVERSATION_KEY);
}

async function supportRequest(path, { method = 'GET', body, signal } = {}) {
  const token = getAnyAuthToken();
  const response = await fetch(buildApiUrl(path), {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal
  });

  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(data.message || 'Support request failed.');
  }

  return data;
}

export const supportAssistantService = {
  getConversationKey,
  setConversationKey,
  clearConversationKey,

  async fetchConversation() {
    const conversationKey = getConversationKey();
    if (!conversationKey) return null;
    return supportRequest(`/api/support/chat?conversationKey=${encodeURIComponent(conversationKey)}`);
  },

  async sendMessage({ message, requestHumanAgent = false, channel = 'web', metadata = {} }) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const payload = {
        message,
        requestHumanAgent,
        channel,
        metadata,
        conversationKey: getConversationKey() || undefined
      };
      const data = await supportRequest('/api/support/chat', {
        method: 'POST',
        body: payload,
        signal: controller.signal
      });
      if (data.conversationKey) setConversationKey(data.conversationKey);
      return data;
    } catch (error) {
      throw new Error(error.name === 'AbortError'
        ? 'The support assistant took too long. Please try again.'
        : error.message || 'Support request failed.');
    } finally {
      window.clearTimeout(timeout);
    }
  }
};
