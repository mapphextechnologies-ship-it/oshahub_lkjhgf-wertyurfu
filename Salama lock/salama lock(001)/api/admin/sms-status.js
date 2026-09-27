import { readJson, sendJson } from '../_lib/http.js';
import { getSmsStatus } from '../_lib/africastalking.js';
import { assertBodySize, assertRateLimit } from '../_lib/security.js';
import { requirePortalUser } from '../_lib/supabase.js';

function queryParam(req, name) {
  try {
    return new URL(req.url, 'https://local.vercel.app').searchParams.get(name) || '';
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    if (req.method === 'POST') assertBodySize(req);
    await assertRateLimit(req, { scope: 'admin-sms-status', limit: 30, windowMs: 60_000 });
    await requirePortalUser(req, ['admin']);

    const body = req.method === 'POST' ? await readJson(req) : {};
    const messageId = String(body.messageId || body.providerMessageId || queryParam(req, 'messageId') || '').trim();

    if (!messageId) {
      sendJson(res, 400, { message: 'Enter a messageId.' });
      return;
    }

    const status = await getSmsStatus(messageId);
    sendJson(res, 200, {
      found: Boolean(status),
      messageId,
      status
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      message: error.message || 'Could not look up SMS status.'
    });
  }
}
