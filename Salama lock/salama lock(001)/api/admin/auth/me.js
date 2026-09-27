import { sendJson } from '../../_lib/http.js';
import { getActiveAdminProfile, portalRole, requirePortalUser } from '../../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    const user = await requirePortalUser(req, ['admin']);
    const role = portalRole(user);
    const activeAdminProfile = await getActiveAdminProfile(user);
    sendJson(res, 200, {
      user: {
        id: user.id,
        email: user.email,
        fullName: activeAdminProfile?.full_name || user.user_metadata?.full_name || user.email,
        role: activeAdminProfile?.role || role,
        phone: activeAdminProfile?.phone || user.user_metadata?.phone || '',
        photoUrl: user.user_metadata?.photo_url || '',
        logoUrl: user.user_metadata?.logo_url || ''
      }
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
