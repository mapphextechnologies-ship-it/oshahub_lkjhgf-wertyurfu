import { sendJson } from '../_lib/http.js';
import { requireFinanceUser } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    const user = await requireFinanceUser(req);

    sendJson(res, 200, {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.user_metadata?.full_name || user.email,
        role: user.app_metadata?.role || user.user_metadata?.role || 'finance',
        phone: user.user_metadata?.phone || '',
        branch: user.user_metadata?.branch || ''
      }
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
