import { readJson, sendJson, sendOptions } from '../../_lib/http.js';
import { assertBodySize, assertRateLimit, validateStrongPassword } from '../../_lib/security.js';
import { getSupabase } from '../../_lib/supabase.js';

function adminLimit() {
  const value = Number(process.env.ADMIN_MAX_ACCOUNTS || 10);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 10;
}

async function audit(actorEmail, action, targetTable, targetId, details = {}) {
  await getSupabase().from('admin_audit_logs').insert({
    actor_email: actorEmail,
    action,
    target_table: targetTable,
    target_id: targetId,
    details
  });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendOptions(res, 'POST,OPTIONS');
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'admin-register', limit: 4, windowMs: 60_000 });
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fullName = String(body.fullName || '').trim();
    const phone = String(body.phone || '').trim();
    const setupCode = String(body.setupCode || '').trim();
    const requestedRole = String(body.role || '').trim();
    const profileRole = requestedRole === 'back_office_officer' ? 'back_office_officer' : 'admin';

    if (!fullName || !email.includes('@') || !phone || !validateStrongPassword(password)) {
      sendJson(res, 400, { message: 'Enter full name, email, phone number, and a strong password.' });
      return;
    }

    if (process.env.ADMIN_REGISTRATION_CODE && setupCode !== process.env.ADMIN_REGISTRATION_CODE) {
      sendJson(res, 403, { message: 'Admin setup code is required.' });
      return;
    }

    const maxAdmins = adminLimit();
    const activeAdmins = await getSupabase()
      .from('admin_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    if (activeAdmins.error) throw activeAdmins.error;

    if ((activeAdmins.count || 0) >= maxAdmins) {
      sendJson(res, 423, { message: `Admin registration is locked. The maximum of ${maxAdmins} active admin accounts has been reached.` });
      return;
    }

    const { data, error } = await getSupabase().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone,
        role: profileRole
      },
      app_metadata: {
        role: profileRole
      }
    });

    if (error) {
      sendJson(res, 400, { message: error.message || 'Could not create admin account.' });
      return;
    }

    const profile = await getSupabase()
      .from('admin_profiles')
      .upsert({
        auth_user_id: data.user.id,
        full_name: fullName,
        email,
        phone,
        role: profileRole,
        status: 'active'
      }, { onConflict: 'auth_user_id' })
      .select()
      .single();

    if (profile.error) throw profile.error;
    await audit(email, 'admin_registered', 'admin_profiles', profile.data.id, { email });

    sendJson(res, 201, {
      user: {
        id: data.user.id,
        email: data.user.email,
        fullName,
        role: profileRole
      }
    });
  } catch (error) {
    sendJson(res, 500, { message: error.message });
  }
}
