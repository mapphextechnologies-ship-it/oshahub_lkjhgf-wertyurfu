import { getAgentPortal } from '../_lib/database.js';
import { sendJson } from '../_lib/http.js';
import { requirePortalUser } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    const user = await requirePortalUser(req, ['agent']);
    const portal = await getAgentPortal(user);
    sendJson(res, 200, { portal });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
