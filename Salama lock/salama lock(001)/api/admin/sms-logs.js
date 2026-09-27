import { sendJson } from '../_lib/http.js';
import { listSmsDeliveryReports } from '../_lib/sms-delivery-reports.js';
import { assertRateLimit } from '../_lib/security.js';
import { requirePortalUser } from '../_lib/supabase.js';

function query(req) {
  try {
    return Object.fromEntries(new URL(req.url, 'https://local.vercel.app').searchParams.entries());
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    await assertRateLimit(req, { scope: 'admin-sms-logs', limit: 60, windowMs: 60_000 });
    await requirePortalUser(req, ['admin']);
    const params = query(req);
    const logs = await listSmsDeliveryReports({
      limit: params.limit,
      phone: params.phone,
      messageId: params.messageId || params.message_id,
      status: params.status,
      date: params.date
    });

    sendJson(res, 200, { logs });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      message: error.message || 'Could not load SMS logs.'
    });
  }
}
