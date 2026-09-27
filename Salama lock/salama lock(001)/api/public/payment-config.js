import { sendJson } from '../_lib/http.js';
import { resolvePaymentConfig } from '../_lib/payment-config.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    const paymentConfig = await resolvePaymentConfig();
    sendJson(res, 200, { paymentConfig });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
