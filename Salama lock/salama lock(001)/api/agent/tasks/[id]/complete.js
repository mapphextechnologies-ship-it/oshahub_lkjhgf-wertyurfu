import { completeAgentTask } from '../../../_lib/database.js';
import { sendJson } from '../../../_lib/http.js';
import { assertRateLimit } from '../../../_lib/security.js';
import { requirePortalUser } from '../../../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    await assertRateLimit(req, { scope: 'agent-task-complete', limit: 60, windowMs: 60_000 });
    const user = await requirePortalUser(req, ['agent']);
    const id = req.query?.id || req.url.split('/').slice(-2)[0];
    const result = await completeAgentTask(user, decodeURIComponent(id));
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
