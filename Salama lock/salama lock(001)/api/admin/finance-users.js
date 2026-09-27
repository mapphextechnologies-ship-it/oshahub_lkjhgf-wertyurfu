import { readJson, sendJson } from '../_lib/http.js';
import { assertBodySize, assertRateLimit, assertRequiredTextFields, validateStrongPassword } from '../_lib/security.js';
import { getSupabase, requirePortalUser } from '../_lib/supabase.js';

function normalizePortalRole(role) {
  const value = String(role || '').trim();
  if (value === 'super_admin') return { authRole: 'admin', displayRole: 'super_admin' };
  if (value === 'admin') return { authRole: 'admin', displayRole: 'admin' };
  if (value === 'agent') return { authRole: 'agent', displayRole: 'agent' };
  if (value === 'customer') return { authRole: 'customer', displayRole: 'customer' };
  return { authRole: 'finance', displayRole: value || 'finance_officer' };
}

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
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'admin-users', limit: 20, windowMs: 60_000 });
    const admin = await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const fullName = String(body.name || body.fullName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const { authRole, displayRole } = normalizePortalRole(body.role);
    const password = String(body.password || temporaryPassword());

    assertRequiredTextFields({ name: fullName, email, phone });
    if (!email.includes('@')) {
      sendJson(res, 400, { message: 'Enter a valid email address.' });
      return;
    }
    if (!validateStrongPassword(password)) {
      sendJson(res, 400, { message: 'Temporary password did not meet security rules. Try again.' });
      return;
    }

    const created = await getSupabase().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone,
        role: authRole,
        display_role: displayRole,
        status: 'pending'
      },
      app_metadata: {
        role: authRole,
        display_role: displayRole,
        status: 'pending'
      }
    });

    if (created.error) {
      sendJson(res, 400, { message: created.error.message || 'Could not create user.' });
      return;
    }

    await audit(admin, 'user_created', 'auth.users', created.data.user.id, { email, role: authRole, displayRole });
    sendJson(res, 201, {
      user: created.data.user,
      temporaryPassword: password
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
