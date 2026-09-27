import { readJson, sendJson, sendOptions } from '../../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../../_lib/security.js';
import { getActiveAdminProfile, getSupabaseAuth, portalRole } from '../../_lib/supabase.js';

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
    await assertRateLimit(req, { scope: 'admin-session-refresh', limit: 20, windowMs: 60_000 });
    const body = await readJson(req);
    const refreshToken = String(body.refreshToken || body.refresh_token || '').trim();

    if (!refreshToken) {
      sendJson(res, 401, { message: 'Your admin session has expired. Sign in again.' });
      return;
    }

    const { data, error } = await getSupabaseAuth().auth.refreshSession({
      refresh_token: refreshToken
    });

    if (error || !data?.session?.access_token || !data?.user) {
      sendJson(res, 401, { message: 'Your admin session has expired. Sign in again.' });
      return;
    }

    const activeAdminProfile = await getActiveAdminProfile(data.user);
    if (!activeAdminProfile) {
      sendJson(res, 403, { message: 'Admin account is not active.' });
      return;
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
        role: activeAdminProfile.role || portalRole(data.user) || 'admin',
        phone: activeAdminProfile.phone || data.user.user_metadata?.phone || '',
        photoUrl: data.user.user_metadata?.photo_url || '',
        logoUrl: data.user.user_metadata?.logo_url || ''
      }
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message || 'Admin session could not be refreshed.' });
  }
}
