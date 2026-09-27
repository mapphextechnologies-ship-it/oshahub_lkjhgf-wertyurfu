import { readJson, sendJson } from '../../../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../../../_lib/security.js';
import { getSupabase, requirePortalUser } from '../../../_lib/supabase.js';

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

async function auditSafe(user, action, targetTable, targetId, details = {}) {
  return audit(user, action, targetTable, targetId, details).catch((error) => ({
    error: error.message
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'admin-agent-status', limit: 30, windowMs: 60_000 });
    const user = await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const id = req.query?.id || req.url.split('/').slice(-2)[0];
    const status = String(body.status || '').trim().toLowerCase();

    if (!['active', 'pending', 'suspended', 'inactive'].includes(status)) {
      sendJson(res, 400, { message: 'Choose active, pending, suspended, or inactive.' });
      return;
    }

    const updated = await getSupabase()
      .from('agents')
      .update({ status })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (updated.error) throw updated.error;
    if (!updated.data) {
      sendJson(res, 404, { message: 'Agent profile not found.' });
      return;
    }

    if (updated.data.auth_user_id) {
      const currentUser = await getSupabase().auth.admin.getUserById(updated.data.auth_user_id);
      if (!currentUser.error && currentUser.data?.user) {
        await getSupabase().auth.admin.updateUserById(updated.data.auth_user_id, {
          app_metadata: {
            ...currentUser.data.user.app_metadata,
            role: 'agent',
            status
          },
          user_metadata: {
            ...currentUser.data.user.user_metadata,
            role: 'agent',
            status
          }
        });
      }
    }

    await auditSafe(user, 'agent_status_updated', 'agents', id, { status });
    sendJson(res, 200, { agent: updated.data });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
