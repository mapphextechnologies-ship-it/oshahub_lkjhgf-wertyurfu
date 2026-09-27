import { sendJson } from '../../../_lib/http.js';
import { assertRateLimit } from '../../../_lib/security.js';
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
    await assertRateLimit(req, { scope: 'admin-finance-approval', limit: 30, windowMs: 60_000 });
    const admin = await requirePortalUser(req, ['admin']);
    const id = req.query?.id || req.url.split('/').slice(-2)[0];

    const current = await getSupabase().auth.admin.getUserById(id);
    if (current.error || !current.data?.user) {
      sendJson(res, 404, { message: 'Finance user not found.' });
      return;
    }

    const financeUser = current.data.user;
    const role = financeUser.app_metadata?.role || financeUser.user_metadata?.role;
    if (role !== 'finance') {
      sendJson(res, 400, { message: 'Only finance users can be approved here.' });
      return;
    }

    const updated = await getSupabase().auth.admin.updateUserById(id, {
      app_metadata: {
        ...financeUser.app_metadata,
        role: 'finance',
        status: 'active'
      },
      user_metadata: {
        ...financeUser.user_metadata,
        role: 'finance',
        status: 'active'
      }
    });

    if (updated.error) throw updated.error;

    const smsResult = await sendAccountApprovedSms({
      phone: financeUser.user_metadata?.phone,
      name: financeUser.user_metadata?.full_name || financeUser.email,
      portal: 'finance',
      accountId: financeUser.id || id
    }).catch((error) => ({ delivered: false, error: error.message, provider: 'africastalking' }));

    await auditSafe(admin, 'finance_user_approved', 'auth.users', id, { email: financeUser.email, smsResult });
    sendJson(res, 200, { user: updated.data.user, smsResult });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
