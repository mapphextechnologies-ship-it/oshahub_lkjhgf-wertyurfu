import { readJson, sendJson, sendOptions } from '../_lib/http.js';
import { getSupabase, requireFinanceUser } from '../_lib/supabase.js';

function profileFromUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.user_metadata?.full_name || user.email,
    name: user.user_metadata?.full_name || user.email,
    role: user.app_metadata?.role || user.user_metadata?.role || 'finance',
    phone: user.user_metadata?.phone || '',
    branch: user.user_metadata?.branch || ''
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendOptions(res, 'GET,PATCH,OPTIONS');
    return;
  }

  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET,PATCH');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    const user = await requireFinanceUser(req);

    if (req.method === 'GET') {
      sendJson(res, 200, { profile: profileFromUser(user) });
      return;
    }

    const body = await readJson(req);
    const fullName = String(body.name || body.fullName || '').trim();
    const phone = String(body.phone || '').trim();
    const branch = String(body.branch || '').trim();

    if (!fullName) {
      sendJson(res, 400, { message: 'Enter the profile name before saving.' });
      return;
    }

    const currentMetadata = user.user_metadata || {};
    const { data, error } = await getSupabase().auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...currentMetadata,
        full_name: fullName,
        phone,
        branch
      }
    });

    if (error) {
      sendJson(res, 400, { message: error.message || 'Could not update profile.' });
      return;
    }

    sendJson(res, 200, { profile: profileFromUser(data.user) });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
