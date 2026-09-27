import { readJson, sendJson, sendOptions } from '../../_lib/http.js';
import { assertBodySize, assertRateLimit, validateStrongPassword } from '../../_lib/security.js';
import { getSupabase, getSupabaseAuth } from '../../_lib/supabase.js';
import { hashOtp } from '../../_lib/database.js';
import { logInfo, logWarn } from '../../_lib/logging.js';

async function findAuthUserByEmail(email) {
  let page = 1;

  while (page <= 10) {
    const { data, error } = await getSupabase().auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find((item) => String(item.email || '').toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 100) return null;
    page += 1;
  }

  return null;
}

async function findCustomerByActivationOtp(otp) {
  const candidates = await getSupabase()
    .from('customers')
    .select('*')
    .gt('customer_activation_otp_expires_at', new Date().toISOString())
    .limit(100);

  if (candidates.error) throw candidates.error;

  return (candidates.data || []).find((customer) => (
    customer.customer_activation_otp_hash &&
    customer.customer_activation_otp_hash === hashOtp(customer.id, otp)
  ));
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
    await assertRateLimit(req, { scope: 'customer-activate', limit: 8, windowMs: 60_000 });
    const body = await readJson(req);
    const otp = String(body.otp || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    logInfo('customer_activate.request_received', {
      hasEmail: Boolean(email),
      otpLength: otp.length
    });

    if (!/^\d{6}$/.test(otp)) {
      sendJson(res, 400, { message: 'Enter the 6-digit activation OTP.' });
      return;
    }

    const customer = await findCustomerByActivationOtp(otp);
    if (!customer) {
      logWarn('customer_activate.otp_not_found', {
        hasEmail: Boolean(email),
        otpLength: otp.length
      });
      sendJson(res, 400, { message: 'Invalid or expired activation OTP.' });
      return;
    }

    if (!email) {
      sendJson(res, 200, {
        otpVerified: true,
        customer: {
          id: customer.id,
          name: customer.customer_name,
          phone: customer.customer_phone
        }
      });
      return;
    }

    if (!email.includes('@')) {
      sendJson(res, 400, { message: 'Enter a valid email address.' });
      return;
    }

    if (!validateStrongPassword(password)) {
      sendJson(res, 400, {
        message: 'Password must be at least 10 characters and include uppercase, lowercase, number, and special character.'
      });
      return;
    }

    let authUserId = customer.auth_user_id || null;
    let authUser = null;

    if (authUserId) {
      const updated = await getSupabase().auth.admin.updateUserById(authUserId, {
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: customer.customer_name,
          phone: customer.customer_phone,
          role: 'customer'
        },
        app_metadata: { role: 'customer' }
      });
      if (updated.error) throw updated.error;
    } else {
      authUser = await findAuthUserByEmail(email);
      if (authUser && (authUser.app_metadata?.role || authUser.user_metadata?.role) !== 'customer') {
        sendJson(res, 409, { message: 'This email is already used by another portal role.' });
        return;
      }

      if (authUser) {
        authUserId = authUser.id;
        const updated = await getSupabase().auth.admin.updateUserById(authUserId, {
          password,
          email_confirm: true,
          user_metadata: {
            ...authUser.user_metadata,
            full_name: customer.customer_name,
            phone: customer.customer_phone,
            role: 'customer'
          },
          app_metadata: { ...authUser.app_metadata, role: 'customer' }
        });
        if (updated.error) throw updated.error;
      } else {
        const created = await getSupabase().auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: customer.customer_name,
            phone: customer.customer_phone,
            role: 'customer'
          },
          app_metadata: { role: 'customer' }
        });
        if (created.error) throw created.error;
        authUserId = created.data.user.id;
      }
    }

    const linked = await getSupabase()
      .from('customers')
      .update({
        auth_user_id: authUserId,
        email,
        customer_activation_otp_verified_at: new Date().toISOString(),
        customer_activation_otp_status: 'verified',
        customer_phone_verified_at: new Date().toISOString()
      })
      .eq('id', customer.id)
      .select()
      .single();

    if (linked.error) throw linked.error;

    const session = await getSupabaseAuth().auth.signInWithPassword({ email, password });
    if (session.error || !session.data?.session) {
      sendJson(res, 500, { message: 'Customer account was activated but automatic sign-in failed.' });
      return;
    }

    sendJson(res, 200, {
      token: session.data.session.access_token,
      activated: true,
      user: {
        id: authUserId,
        email,
        role: 'customer',
        customerId: linked.data.id,
        fullName: linked.data.customer_name
      }
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
