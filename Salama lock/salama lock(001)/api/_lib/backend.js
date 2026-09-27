import { sendJson } from './http.js';
import { requireFinanceUser } from './supabase.js';
import {
  createAgentNotification,
  createManualPayment,
  getDashboard,
  listCommissions,
  listCustomerPaymentRecords,
  listCustomers,
  listFinanceNotifications,
  listInventory,
  listPayments,
  listReconciliation,
  markAgentCommissionsPaid,
  payCommission,
  updateFinanceNotificationsStatus
} from './database.js';

const BACKEND_API_URL = process.env.BACKEND_API_URL || '';
const BACKEND_TIMEOUT_MS = Number(process.env.BACKEND_TIMEOUT_MS || 10000);

function backendUrl(path, query = '') {
  return `${BACKEND_API_URL}${path}${query || ''}`;
}

export async function proxyBackend(req, res, path, { method = req.method, body } = {}) {
  if (!BACKEND_API_URL) {
    try {
      sendJson(res, 200, await runSupabaseHandler(req, path, { method, body }));
    } catch (error) {
      sendJson(res, error.statusCode || 500, { message: error.message });
    }
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);

  let response;
  let data;

  try {
    response = await fetch(backendUrl(path, req.url.includes('?') ? `?${req.url.split('?')[1]}` : ''), {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal
    });
    data = await response.json().catch(() => ({}));
  } catch (error) {
    sendJson(res, error.name === 'AbortError' ? 504 : 502, {
      message: error.name === 'AbortError'
        ? 'Backend request timed out.'
        : 'Backend request failed.'
    });
    return;
  } finally {
    clearTimeout(timeout);
  }

  sendJson(res, response.status, data);
}

async function runSupabaseHandler(req, path, { method, body }) {
  const query = Object.fromEntries(new URL(req.url, 'https://local.vercel.app').searchParams.entries());

  if (method === 'GET' && path === '/health') {
    return {
      ok: true,
      mode: 'supabase',
      databaseConfigured: true,
      stateless: true,
      region: process.env.VERCEL_REGION || process.env.AWS_REGION || 'local',
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
      checkedAt: new Date().toISOString()
    };
  }

  await requireFinanceUser(req);

  if (method === 'GET' && path === '/dashboard') return getDashboard(query);
  if (method === 'GET' && path === '/customers') return listCustomers(query);
  if (method === 'GET' && path === '/customers/payment-records') return listCustomerPaymentRecords(query);
  if (method === 'GET' && path === '/inventory') return listInventory(query);
  if (method === 'GET' && path === '/payments') return listPayments(query);
  if (method === 'GET' && path === '/notifications') return listFinanceNotifications(query);
  if ((method === 'PATCH' || method === 'DELETE') && path === '/notifications') {
    return updateFinanceNotificationsStatus({
      ids: body?.ids || [],
      status: method === 'DELETE' ? 'dismissed' : body?.status
    });
  }
  if (method === 'POST' && path === '/payments/manual') return createManualPayment(body);
  if (method === 'GET' && path === '/commissions') return listCommissions(query);
  if (method === 'POST' && /^\/commissions\/[^/]+\/pay$/.test(path)) {
    return payCommission(decodeURIComponent(path.split('/')[2]));
  }
  if (method === 'POST' && path === '/commissions/agent-payment-approvals') {
    return markAgentCommissionsPaid(body.agentKey);
  }
  if (method === 'POST' && path === '/agent-notifications') return createAgentNotification(body);
  if (method === 'GET' && path === '/reconciliation') return listReconciliation(query);

  const error = new Error(`No Supabase handler configured for ${method} ${path}.`);
  error.statusCode = 404;
  throw error;
}
