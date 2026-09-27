import { createAgentCustomer } from '../_lib/database.js';
import { readJson, sendJson } from '../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../_lib/security.js';
import { requirePortalUser } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'agent-customer-create', limit: 20, windowMs: 60_000 });
    const user = await requirePortalUser(req, ['agent']);
    const body = await readJson(req);
    const result = await createAgentCustomer(user, body);
    sendJson(res, 201, result);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      success: false,
      message: error.message,
      requestId: error.requestId || null,
      honorError: error.response || null
    });
  }
}
