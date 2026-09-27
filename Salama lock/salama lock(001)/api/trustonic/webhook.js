import { sendJson } from '../_lib/http.js';
import { logInfo, logWarn } from '../_lib/logging.js';
import {
  authorizeTrustonicWebhook,
  readRawJson,
  storeTrustonicWebhookEvent
} from '../_lib/trustonic-webhooks.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    const authorization = authorizeTrustonicWebhook(req);
    if (!authorization.configured) {
      sendJson(res, 503, { message: 'Trustonic webhook intake is not configured.' });
      return;
    }
    if (!authorization.authorized) {
      logWarn('trustonic_webhook.unauthorized', { hasAuthorization: Boolean(req.headers?.authorization) });
      sendJson(res, 401, { message: 'Unauthorized.' });
      return;
    }

    const eventBody = await readRawJson(req);
    const stored = await storeTrustonicWebhookEvent({
      ...eventBody,
      headers: req.headers || {}
    });

    logInfo('trustonic_webhook.accepted', {
      eventId: stored.event?.id || null,
      duplicate: stored.duplicate,
      status: stored.event?.status || 'pending'
    });
    sendJson(res, 202, {
      ok: true,
      accepted: true,
      duplicate: stored.duplicate,
      eventId: stored.event?.id || null,
      status: stored.event?.status || 'pending'
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      message: error.message || 'Could not accept the Trustonic webhook.'
    });
  }
}
