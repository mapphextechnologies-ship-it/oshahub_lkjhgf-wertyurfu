import { readJson, sendJson } from '../../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../../_lib/security.js';
import { getSupabase, requirePortalUser } from '../../_lib/supabase.js';

async function audit(user, action, targetTable, targetId, details = {}) {
  await getSupabase().from('admin_audit_logs').insert({
    actor_user_id: user.id,
    actor_email: user.email,
    action,
    target_table: targetTable,
    target_id: targetId,
    details
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'admin-notification-status', limit: 40, windowMs: 60_000 });
    const admin = await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    const status = String(body.status || '').trim().toLowerCase();

    if (ids.length === 0 || !['read', 'unread'].includes(status)) {
      sendJson(res, 400, { message: 'Choose notifications and read or unread status.' });
      return;
    }

    const financeIds = ids.filter((id) => id.startsWith('FNT-'));
    const agentIds = ids.filter((id) => id.startsWith('AGN-'));
    const results = {};

    if (financeIds.length > 0) {
      const finance = await getSupabase()
        .from('finance_notifications')
        .update({ status })
        .in('id', financeIds)
        .select('id,status');
      if (finance.error) throw finance.error;
      results.finance = finance.data;
    }

    if (agentIds.length > 0) {
      const agentStatus = status === 'read' ? 'read' : 'sent';
      const agent = await getSupabase()
        .from('agent_notifications')
        .update({ status: agentStatus })
        .in('id', agentIds)
        .select('id,status');
      if (agent.error) throw agent.error;
      results.agent = agent.data;
    }

    await audit(admin, 'notifications_status_updated', 'notifications', ids.join(','), { status, count: ids.length });
    sendJson(res, 200, { updated: true, results });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
