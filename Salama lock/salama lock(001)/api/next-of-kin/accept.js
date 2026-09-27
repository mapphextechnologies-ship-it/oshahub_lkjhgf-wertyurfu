import { acceptNextOfKinOtp } from '../_lib/database.js';
import { readJson, sendJson, sendOptions } from '../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../_lib/security.js';

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
    await assertRateLimit(req, { scope: 'next-of-kin-accept', limit: 10, windowMs: 60_000 });
    const body = await readJson(req);
    const customerId = String(body.customerId || body.customer_id || '').trim();

    if (!customerId) {
      sendJson(res, 400, { message: 'Customer reference is required.' });
      return;
    }

    const result = await acceptNextOfKinOtp(customerId, body);
    sendJson(res, 200, {
      accepted: true,
      alreadyVerified: Boolean(result.alreadyVerified),
      customer: {
        id: result.customer?.id,
        name: result.customer?.customer_name,
        status: result.customer?.status,
        applicationStatus: result.customer?.application_status
      },
      application: result.application ? {
        id: result.application.id,
        status: result.application.status,
        reviewReason: result.application.review_reason,
        reviewedAt: result.application.reviewed_at,
        verification: result.application.verification || {}
      } : null
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
