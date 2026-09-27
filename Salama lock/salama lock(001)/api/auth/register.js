import { readJson, sendJson, sendOptions } from '../_lib/http.js';
import { assertBodySize, assertRateLimit, validateStrongPassword } from '../_lib/security.js';
import { getSupabase } from '../_lib/supabase.js';

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
    await assertRateLimit(req, { scope: 'finance-register', limit: 5, windowMs: 60_000 });
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fullName = String(body.fullName || '').trim();
    const phone = String(body.phone || '').trim();

    if (!fullName || !email.includes('@') || !phone || !validateStrongPassword(password)) {
      sendJson(res, 400, { message: 'Enter full name, email, phone number, and a strong password.' });
      return;
    }

    const { data, error } = await getSupabase().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone,
        role: 'finance',
        status: 'pending'
      },
      app_metadata: {
        role: 'finance',
        status: 'pending'
      }
    });

    if (error) {
      sendJson(res, 400, { message: error.message || 'Could not create finance account.' });
      return;
    }

    sendJson(res, 201, {
      user: {
        id: data.user.id,
        email: data.user.email,
        fullName,
        role: 'finance',
        status: 'pending'
      }
    });
  } catch (error) {
    sendJson(res, 500, { message: error.message });
  }
}
