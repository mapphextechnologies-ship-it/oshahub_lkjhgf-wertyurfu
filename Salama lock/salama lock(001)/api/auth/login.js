import { sendJson, readJson, sendOptions } from '../_lib/http.js';
import { assertBodySize, assertRateLimit, genericAuthMessage } from '../_lib/security.js';
import { getSupabaseAuth } from '../_lib/supabase.js';

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
    await assertRateLimit(req, { scope: 'finance-login', limit: 8, windowMs: 60_000 });
    const body = await readJson(req);
    const email = String(body.identifier || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email.includes('@') || password.length < 8) {
      sendJson(res, 400, { message: genericAuthMessage() });
      return;
    }

    const { data, error } = await getSupabaseAuth().auth.signInWithPassword({
      email,
      password
    });

    if (error || !data?.session || !data?.user) {
      sendJson(res, 401, { message: genericAuthMessage() });
      return;
    }

    const role = data.user.app_metadata?.role || data.user.user_metadata?.role;

    if (role !== 'finance' && role !== 'admin') {
      sendJson(res, 403, { message: 'Finance access is required.' });
      return;
    }

    const accountStatus = data.user.app_metadata?.status || data.user.user_metadata?.status;
    if (role === 'finance' && accountStatus !== 'active') {
      sendJson(res, 403, { message: 'Your finance account is waiting for admin approval. You will receive an SMS after approval.' });
      return;
    }

    sendJson(res, 200, {
      token: data.session.access_token,
      refreshToken: data.session.refresh_token || '',
      expiresAt: data.session.expires_at ? Number(data.session.expires_at) * 1000 : Date.now() + Number(data.session.expires_in || 0) * 1000,
      expiresIn: data.session.expires_in || null,
      user: {
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.user_metadata?.full_name || data.user.email,
        role,
        phone: data.user.user_metadata?.phone || '',
        branch: data.user.user_metadata?.branch || ''
      }
    });
  } catch (error) {
    sendJson(res, 500, { message: error.message });
  }
}
