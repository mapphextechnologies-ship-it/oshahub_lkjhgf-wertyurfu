import { createCustomerPaymentRequest } from '../_lib/database.js';
import { sendJson, readJson } from '../_lib/http.js';
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
    await assertRateLimit(req, { scope: 'customer-payment-request', limit: 12, windowMs: 60_000 });
    const user = await requirePortalUser(req, ['customer']);
    const body = await readJson(req);
    const result = await createCustomerPaymentRequest(user, body);
    sendJson(res, 201, result);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
