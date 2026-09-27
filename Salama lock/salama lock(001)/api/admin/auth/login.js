import { sendJson, readJson, sendOptions } from '../../_lib/http.js';
import { assertBodySize, assertRateLimit, genericAuthMessage } from '../../_lib/security.js';
import { getActiveAdminProfile, getSupabase, getSupabaseAuth, portalRole } from '../../_lib/supabase.js';

const ADMIN_FAILED_LOGIN_LIMIT = 8;
const ADMIN_LOCK_WINDOW_MS = 15 * 60 * 1000;

async function countRecentFailedLogins(email) {
  const windowStart = new Date(Date.now() - ADMIN_LOCK_WINDOW_MS).toISOString();
  const lastSuccess = await getSupabase()
    .from('admin_audit_logs')
    .select('created_at')
    .eq('actor_email', email)
    .eq('action', 'admin_login_success')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastSuccess.error) throw lastSuccess.error;

  const since = lastSuccess.data?.created_at && lastSuccess.data.created_at > windowStart
    ? lastSuccess.data.created_at
    : windowStart;

  const result = await getSupabase()
    .from('admin_audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('actor_email', email)
    .eq('action', 'admin_login_failed')
    .eq('details->>reason', 'invalid_credentials')
    .gte('created_at', since);

  if (result.error) throw result.error;
  return result.count || 0;
}

async function recordAdminLogin(email, action, details = {}) {
  await getSupabase().from('admin_audit_logs').insert({
    actor_email: email,
    action,
    target_table: 'admin_profiles',
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
    await assertRateLimit(req, { scope: 'admin-login', limit: 8, windowMs: 60_000 });
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email.includes('@') || password.length < 8) {
      sendJson(res, 400, { message: genericAuthMessage() });
      return;
    }

    if (await countRecentFailedLogins(email) >= ADMIN_FAILED_LOGIN_LIMIT) {
      sendJson(res, 423, { message: 'Admin login is locked after too many failed attempts. Try again later or contact the system owner.' });
      return;
    }

    const { data, error } = await getSupabaseAuth().auth.signInWithPassword({ email, password });

    if (error || !data?.session || !data?.user) {
      await recordAdminLogin(email, 'admin_login_failed', { reason: 'invalid_credentials' });
      sendJson(res, 401, { message: genericAuthMessage() });
      return;
    }

    const role = portalRole(data.user);
    const activeAdminProfile = await getActiveAdminProfile(data.user);
    if (!activeAdminProfile) {
      await recordAdminLogin(email, 'admin_login_failed', { reason: 'inactive_profile' });
      sendJson(res, 403, { message: 'Admin account is not active.' });
      return;
    }

    if (role !== 'admin') {
      await recordAdminLogin(email, 'admin_login_success', { userId: data.user.id, roleFallback: 'admin_profile' });
    } else {
      await recordAdminLogin(email, 'admin_login_success', { userId: data.user.id });
    }

    sendJson(res, 200, {
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
      expiresIn: data.session.expires_in,
      user: {
        id: data.user.id,
        email: data.user.email,
        fullName: activeAdminProfile.full_name || data.user.user_metadata?.full_name || data.user.email,
        role: activeAdminProfile.role || 'admin',
        phone: activeAdminProfile.phone || data.user.user_metadata?.phone || '',
        photoUrl: data.user.user_metadata?.photo_url || '',
        logoUrl: data.user.user_metadata?.logo_url || ''
      }
    });
  } catch (error) {
    sendJson(res, 500, { message: error.message });
  }
}
