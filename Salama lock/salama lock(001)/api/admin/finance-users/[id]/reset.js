import { sendJson } from '../../../_lib/http.js';
import { assertRateLimit } from '../../../_lib/security.js';
import { getSupabase, requirePortalUser } from '../../../_lib/supabase.js';

function temporaryPassword() {
  return `SALAMA LOCK@${Math.random().toString(36).slice(2, 8).toUpperCase()}${Math.floor(1000 + Math.random() * 9000)}`;
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
    await assertRateLimit(req, { scope: 'admin-user-reset', limit: 20, windowMs: 60_000 });
    const admin = await requirePortalUser(req, ['admin']);
    const id = req.query?.id || req.url.split('/').slice(-2)[0];
    const password = temporaryPassword();
    const updated = await getSupabase().auth.admin.updateUserById(id, { password });

    if (updated.error) {
      sendJson(res, 404, { message: updated.error.message || 'User not found.' });
      return;
    }

    await audit(admin, 'user_password_reset', 'auth.users', id, { email: updated.data.user.email });
    sendJson(res, 200, { user: updated.data.user, temporaryPassword: password });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
