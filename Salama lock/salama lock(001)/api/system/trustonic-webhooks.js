import { isAuthorizedCronRequest } from '../_lib/cron-auth.js';
import { sendJson } from '../_lib/http.js';
import { processTrustonicWebhookQueue } from '../_lib/trustonic-webhooks.js';

function authorized(req, dryRun) {
  const secret = process.env.CRON_SECRET || process.env.FOLLOW_UP_CRON_SECRET || '';
  if (!secret) return dryRun;
  return isAuthorizedCronRequest(req, secret);
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET,POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    const params = new URL(req.url, 'https://local.vercel.app').searchParams;
    const dryRun = params.get('dryRun') === 'true';
    const limit = Number(params.get('limit') || 25);

    if (!process.env.CRON_SECRET && !process.env.FOLLOW_UP_CRON_SECRET && !dryRun) {
      sendJson(res, 503, { message: 'Set CRON_SECRET before enabling Trustonic webhook delivery.' });
      return;
    }
    if (!authorized(req, dryRun)) {
      sendJson(res, 401, { message: 'Trustonic webhook delivery is not authorized.' });
      return;
    }

    const result = await processTrustonicWebhookQueue({ dryRun, limit });
    sendJson(res, 200, { ok: true, result });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      message: error.message || 'Could not deliver Trustonic webhooks.'
    });
  }
}
