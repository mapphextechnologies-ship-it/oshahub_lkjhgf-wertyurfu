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

async function findAuthUserByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;

  let page = 1;
  while (page <= 10) {
    const { data, error } = await getSupabase().auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;

    const user = data.users.find((item) => String(item.email || '').toLowerCase() === normalizedEmail);
    if (user) return user;
    if (data.users.length < 100) return null;
    page += 1;
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    await assertRateLimit(req, { scope: 'admin-agent-approval', limit: 30, windowMs: 60_000 });
    const user = await requirePortalUser(req, ['admin']);
    const id = req.query?.id || req.url.split('/').slice(-2)[0];

    const current = await getSupabase()
      .from('agents')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (current.error) throw current.error;
    if (!current.data) {
      sendJson(res, 404, { message: 'Agent profile not found.' });
      return;
    }

    let authUserId = current.data.auth_user_id || null;
    let loginLinked = Boolean(authUserId);
    if (!authUserId) {
      const authUser = await findAuthUserByEmail(current.data.email);
      if (authUser && (authUser.app_metadata?.role || authUser.user_metadata?.role || 'agent') !== 'agent') {
        sendJson(res, 409, { message: 'This email is already used by another portal role.' });
        return;
      }
      authUserId = authUser?.id || null;
      loginLinked = Boolean(authUserId);
    }

    const updated = await getSupabase()
      .from('agents')
      .update({
        auth_user_id: authUserId,
        status: 'active'
      })
      .eq('id', id)
      .select()
      .single();

    if (updated.error) throw updated.error;

    if (authUserId) {
      const currentUser = await getSupabase().auth.admin.getUserById(authUserId);
      if (!currentUser.error && currentUser.data?.user) {
        await getSupabase().auth.admin.updateUserById(authUserId, {
          app_metadata: {
            ...currentUser.data.user.app_metadata,
            role: 'agent',
            status: 'active'
          },
          user_metadata: {
            ...currentUser.data.user.user_metadata,
            role: 'agent',
            status: 'active'
          }
        });
      }
    }

    const smsResult = await sendAccountApprovedSms({
      phone: updated.data.phone,
      name: updated.data.full_name || updated.data.agent_name,
      portal: 'agent',
      accountId: updated.data.id || id
    }).catch((error) => ({ delivered: false, error: error.message, provider: 'africastalking' }));

    await auditSafe(user, 'agent_approved', 'agents', id, { email: updated.data.email, smsResult, loginLinked });
    sendJson(res, 200, {
      agent: updated.data,
      smsResult,
      loginLinked,
      message: loginLinked
        ? 'Agent approved. The agent can sign in with the password used during registration.'
        : 'Agent approved. The agent must create the agent login with the same email before signing in.'
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
