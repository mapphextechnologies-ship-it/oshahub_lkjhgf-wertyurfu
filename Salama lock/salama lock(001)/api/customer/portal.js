import { getCustomerPortal } from '../_lib/database.js';
import { sendJson } from '../_lib/http.js';
import { resolvePaymentConfig } from '../_lib/payment-config.js';
import { requirePortalUser } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    const user = await requirePortalUser(req, ['customer']);
    const [portal, paymentConfig] = await Promise.all([
      getCustomerPortal(user),
      resolvePaymentConfig()
    ]);
    sendJson(res, 200, { portal: { ...portal, paymentConfig } });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
