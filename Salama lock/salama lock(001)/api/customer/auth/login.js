import { findCustomerForAuthUser } from '../../_lib/database.js';
import { sendJson, readJson, sendOptions } from '../../_lib/http.js';
import { assertBodySize, assertRateLimit, genericAuthMessage } from '../../_lib/security.js';
import { getSupabaseAuth } from '../../_lib/supabase.js';

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
    await assertRateLimit(req, { scope: 'customer-login', limit: 8, windowMs: 60_000 });
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email.includes('@') || password.length < 8) {
      sendJson(res, 400, { message: genericAuthMessage() });
      return;
    }

    const { data, error } = await getSupabaseAuth().auth.signInWithPassword({ email, password });

    if (error || !data?.session || !data?.user) {
      sendJson(res, 401, { message: genericAuthMessage() });
      return;
    }

    const role = data.user.app_metadata?.role || data.user.user_metadata?.role || 'customer';
    if (role !== 'customer' && role !== 'admin') {
      sendJson(res, 403, { message: 'Customer portal access is required.' });
      return;
    }

    const customer = await findCustomerForAuthUser(data.user);
    if (!customer) {
      sendJson(res, 403, { message: 'Customer profile is not connected yet. Ask admin to link this email to a customer record.' });
      return;
    }

    if (customer.customer_activation_otp_status !== 'verified') {
      sendJson(res, 403, { message: 'Activate your customer account with the OTP sent after approval before signing in.' });
      return;
    }

    sendJson(res, 200, {
      token: data.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: 'customer',
        customerId: customer.id,
        fullName: customer.customer_name
      }
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
