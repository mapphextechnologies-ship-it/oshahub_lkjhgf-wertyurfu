import { readJson, sendJson } from '../../../_lib/http.js';
import { assertBodySize, assertRateLimit, assertRequiredTextFields } from '../../../_lib/security.js';
import { getSupabase, requirePortalUser } from '../../../_lib/supabase.js';

const allowedStatuses = new Set(['pending', 'active', 'suspended', 'inactive']);

function normalizePortalRole(role) {
  const value = String(role || '').trim();
  if (value === 'super_admin') return { authRole: 'admin', displayRole: 'super_admin' };
  if (value === 'admin') return { authRole: 'admin', displayRole: 'admin' };
  if (value === 'agent') return { authRole: 'agent', displayRole: 'agent' };
  if (value === 'customer') return { authRole: 'customer', displayRole: 'customer' };
  if (['back_office_officer', 'finance_officer'].includes(value)) {
    return { authRole: 'finance', displayRole: value };
  }
  return null;
}

function authUpdateError(error) {
  const message = String(error?.message || 'Could not update the user.');
  const duplicate = /already|duplicate|registered|unique/i.test(message);
  const updateError = new Error(duplicate ? 'Another login already uses this email address.' : message);
  updateError.statusCode = duplicate ? 409 : 400;
  return updateError;
}

async function audit(user, targetId, details) {
  const result = await getSupabase().from('admin_audit_logs').insert({
    actor_user_id: user.id,
    actor_email: user.email,
    action: 'user_details_updated',
    target_table: 'auth.users',
    target_id: targetId,
    details
  });
  if (result.error) throw result.error;
}

async function loadLinkedProfiles(userId) {
  const supabase = getSupabase();
  const queries = await Promise.all([
    supabase
      .from('customers')
      .select('id,customer_name,customer_phone,email')
      .eq('auth_user_id', userId)
      .maybeSingle(),
    supabase
      .from('agents')
      .select('id,full_name,agent_name,phone,email')
      .eq('auth_user_id', userId)
      .maybeSingle(),
    supabase
      .from('admin_profiles')
      .select('id,full_name,phone,email')
      .eq('auth_user_id', userId)
      .maybeSingle()
  ]);

  const failed = queries.find((query) => query.error);
  if (failed?.error) throw failed.error;

  return [
    queries[0].data
      ? {
          table: 'customers',
          id: queries[0].data.id,
          previous: {
            customer_name: queries[0].data.customer_name,
            customer_phone: queries[0].data.customer_phone,
            email: queries[0].data.email
          }
        }
      : null,
    queries[1].data
      ? {
          table: 'agents',
          id: queries[1].data.id,
          previous: {
            full_name: queries[1].data.full_name,
            agent_name: queries[1].data.agent_name,
            phone: queries[1].data.phone,
            email: queries[1].data.email
          }
        }
      : null,
    queries[2].data
      ? {
          table: 'admin_profiles',
          id: queries[2].data.id,
          previous: {
            full_name: queries[2].data.full_name,
            phone: queries[2].data.phone,
            email: queries[2].data.email
          }
        }
      : null
  ].filter(Boolean);
}

function linkedProfileUpdate(table, { fullName, email, phone }) {
  if (table === 'customers') {
    return { customer_name: fullName, customer_phone: phone, email };
  }
  if (table === 'agents') {
    return { full_name: fullName, agent_name: fullName, phone, email };
  }
  return { full_name: fullName, phone, email };
}

async function restoreChanges({ userId, authUser, updatedProfiles }) {
  const supabase = getSupabase();

  await Promise.allSettled(updatedProfiles.map((profile) => (
    supabase.from(profile.table).update(profile.previous).eq('id', profile.id)
  )));

  await supabase.auth.admin.updateUserById(userId, {
    email: authUser.email,
    email_confirm: Boolean(authUser.email_confirmed_at),
    app_metadata: authUser.app_metadata,
    user_metadata: authUser.user_metadata
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
    await assertRateLimit(req, { scope: 'admin-user-update', limit: 30, windowMs: 60_000 });
    const admin = await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const id = String(req.query?.id || req.url.split('/').slice(-2)[0] || '').trim();
    const fullName = String(body.name || body.fullName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const status = String(body.status || '').trim().toLowerCase();
    const normalizedRole = normalizePortalRole(body.role);

    assertRequiredTextFields({ name: fullName, email, phone, role: body.role, status });
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      sendJson(res, 400, { message: 'Enter a valid email address.' });
      return;
    }
    if (!normalizedRole) {
      sendJson(res, 400, { message: 'Choose a valid user role.' });
      return;
    }
    if (!allowedStatuses.has(status)) {
      sendJson(res, 400, { message: 'Choose pending, active, suspended, or inactive.' });
      return;
    }

    const current = await getSupabase().auth.admin.getUserById(id);
    if (current.error || !current.data?.user) {
      sendJson(res, 404, { message: 'User not found.' });
      return;
    }

    const authUser = current.data.user;
    const linkedProfiles = await loadLinkedProfiles(id);
    const emailChanged = String(authUser.email || '').toLowerCase() !== email;
    const updated = await getSupabase().auth.admin.updateUserById(id, {
      email,
      ...(emailChanged ? { email_confirm: true } : {}),
      app_metadata: {
        ...authUser.app_metadata,
        role: normalizedRole.authRole,
        display_role: normalizedRole.displayRole,
        status
      },
      user_metadata: {
        ...authUser.user_metadata,
        full_name: fullName,
        phone,
        role: normalizedRole.authRole,
        display_role: normalizedRole.displayRole,
        status
      }
    });

    if (updated.error) throw authUpdateError(updated.error);

    const updatedProfiles = [];
    try {
      for (const profile of linkedProfiles) {
        const profileUpdate = await getSupabase()
          .from(profile.table)
          .update(linkedProfileUpdate(profile.table, { fullName, email, phone }))
          .eq('id', profile.id)
          .select('id')
          .single();
        if (profileUpdate.error) throw profileUpdate.error;
        updatedProfiles.push(profile);
      }
    } catch (profileError) {
      await restoreChanges({ userId: id, authUser, updatedProfiles });
      const syncError = new Error(`Could not synchronize the linked profile: ${profileError.message}`);
      syncError.statusCode = 409;
      throw syncError;
    }

    await audit(admin, id, {
      previousEmail: authUser.email || '',
      email,
      fullName,
      phone,
      role: normalizedRole.displayRole,
      status,
      synchronizedTables: updatedProfiles.map((profile) => profile.table)
    }).catch(() => null);

    sendJson(res, 200, {
      user: updated.data.user,
      synchronizedTables: updatedProfiles.map((profile) => profile.table)
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
