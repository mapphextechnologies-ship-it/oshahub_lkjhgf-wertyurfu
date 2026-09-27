import { readJson, sendJson } from '../../../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../../../_lib/security.js';
import { getSupabase, requirePortalUser } from '../../../_lib/supabase.js';
import { sendAccountApprovedSms } from '../../../_lib/africastalking.js';

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
    await assertRateLimit(req, { scope: 'admin-user-status', limit: 30, windowMs: 60_000 });
    const admin = await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const id = req.query?.id || req.url.split('/').slice(-2)[0];
    const status = String(body.status || '').trim().toLowerCase();

    if (!['pending', 'active', 'suspended', 'inactive'].includes(status)) {
      sendJson(res, 400, { message: 'Choose pending, active, suspended, or inactive.' });
      return;
    }

    const current = await getSupabase().auth.admin.getUserById(id);
    if (current.error || !current.data?.user) {
      sendJson(res, 404, { message: 'User not found.' });
      return;
    }

    const updated = await getSupabase().auth.admin.updateUserById(id, {
      app_metadata: { ...current.data.user.app_metadata, status },
      user_metadata: { ...current.data.user.user_metadata, status }
    });
    if (updated.error) throw updated.error;

    const smsResult = status === 'active'
      ? await sendAccountApprovedSms({
          phone: current.data.user.user_metadata?.phone,
          name: current.data.user.user_metadata?.full_name || current.data.user.email,
          portal: current.data.user.app_metadata?.role || current.data.user.user_metadata?.role || 'portal',
          accountId: current.data.user.id || id
        }).catch((error) => ({ delivered: false, error: error.message, provider: 'africastalking' }))
      : null;

    await audit(admin, 'user_status_updated', 'auth.users', id, { status, smsResult });
    sendJson(res, 200, { user: updated.data.user, smsResult });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
