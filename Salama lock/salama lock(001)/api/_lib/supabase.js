import { createClient } from '@supabase/supabase-js';

let client = null;
let authClient = null;

export function hasSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function hasSupabaseAuthConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

export function getSupabase() {
  if (!hasSupabaseConfig()) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.');
  }

  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return client;
}

export function getSupabaseAuth() {
  if (!hasSupabaseAuthConfig()) {
    throw new Error('Supabase Auth is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel.');
  }

  if (!authClient) {
    authClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return authClient;
}

export function portalRole(user) {
  const role = user?.app_metadata?.role || user?.user_metadata?.role || '';
  if (['admin', 'super_admin', 'back_office_officer'].includes(role)) return 'admin';
  return role;
}

async function hasActiveAdminProfile(user) {
  return Boolean(await getActiveAdminProfile(user));
}

export async function getActiveAdminProfile(user) {
  if (!user?.id && !user?.email) return false;

  let query = getSupabase()
    .from('admin_profiles')
    .select('*')
    .eq('status', 'active')
    .limit(1);

  query = user.id
    ? query.eq('auth_user_id', user.id)
    : query.eq('email', user.email);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function requireFinanceUser(req) {
  if (process.env.SUPABASE_AUTH_REQUIRED === 'false') {
    return null;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    const error = new Error('Sign in is required.');
    error.statusCode = 401;
    throw error;
  }

  const { data, error } = await getSupabase().auth.getUser(token);

  if (error || !data?.user) {
    const authError = new Error('Your session is invalid or expired.');
    authError.statusCode = 401;
    throw authError;
  }

  const role = portalRole(data.user);

  if (role !== 'finance' && role !== 'admin') {
    const roleError = new Error('Finance access is required.');
    roleError.statusCode = 403;
    throw roleError;
  }

  const accountStatus = data.user.app_metadata?.status || data.user.user_metadata?.status;
  if (role === 'finance' && accountStatus !== 'active') {
    const approvalError = new Error('Your finance account is waiting for admin approval.');
    approvalError.statusCode = 403;
    throw approvalError;
  }

  return data.user;
}

async function requireAuthenticatedUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    const error = new Error('Sign in is required.');
    error.statusCode = 401;
    throw error;
  }

  const { data, error } = await getSupabase().auth.getUser(token);

  if (error || !data?.user) {
    const authError = new Error('Your session is invalid or expired.');
    authError.statusCode = 401;
    throw authError;
  }

  return data.user;
}

export async function requirePortalUser(req, allowedRoles = []) {
  const user = await requireAuthenticatedUser(req);
  const role = portalRole(user);

  if (!allowedRoles.includes(role) && role !== 'admin') {
    if (allowedRoles.includes('admin') && await hasActiveAdminProfile(user)) {
      return user;
    }

    const roleError = new Error('Portal access is required.');
    roleError.statusCode = 403;
    throw roleError;
  }

  return user;
}
