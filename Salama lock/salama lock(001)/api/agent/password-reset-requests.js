import { requestPasswordResetOtp } from '../_lib/database.js';
import { sendJson, readJson } from '../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../_lib/security.js';
import { logInfo } from '../_lib/logging.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'agent-password-reset', limit: 5, windowMs: 60_000 });
    const body = await readJson(req);
    logInfo('agent_password_reset.request_received', {
      requestedEmail: String(body.email || body.identifier || '').trim().toLowerCase(),
      sourcePortal: 'agent'
    });
    const result = await requestPasswordResetOtp({ ...body, sourcePortal: 'agent' });
    logInfo('agent_password_reset.response_success', {
      requestedEmail: String(body.email || body.identifier || '').trim().toLowerCase(),
      providerAccepted: Boolean(result.providerAccepted ?? result.sent),
      requestId: result.request?.id || null
    });
    sendJson(res, 201, result);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
