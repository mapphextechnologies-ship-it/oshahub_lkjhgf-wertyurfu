import { readJson, sendJson } from '../../../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../../../_lib/security.js';
import { getSupabase, requirePortalUser } from '../../../_lib/supabase.js';

function normalizePortalRole(role) {
  const value = String(role || '').trim();
  if (value === 'super_admin') return { authRole: 'admin', displayRole: 'super_admin' };
  if (value === 'admin') return { authRole: 'admin', displayRole: 'admin' };
  if (value === 'agent') return { authRole: 'agent', displayRole: 'agent' };
  if (value === 'customer') return { authRole: 'customer', displayRole: 'customer' };
  return { authRole: 'finance', displayRole: value || 'finance_officer' };
}

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
    await assertRateLimit(req, { scope: 'admin-user-role', limit: 30, windowMs: 60_000 });
    const admin = await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const id = req.query?.id || req.url.split('/').slice(-2)[0];
    const { authRole, displayRole } = normalizePortalRole(body.role);

    const current = await getSupabase().auth.admin.getUserById(id);
    if (current.error || !current.data?.user) {
      sendJson(res, 404, { message: 'User not found.' });
      return;
    }

    const updated = await getSupabase().auth.admin.updateUserById(id, {
      app_metadata: { ...current.data.user.app_metadata, role: authRole, display_role: displayRole },
      user_metadata: { ...current.data.user.user_metadata, role: authRole, display_role: displayRole }
    });
    if (updated.error) throw updated.error;

    await audit(admin, 'user_role_updated', 'auth.users', id, { role: authRole, displayRole });
    sendJson(res, 200, { user: updated.data.user });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
