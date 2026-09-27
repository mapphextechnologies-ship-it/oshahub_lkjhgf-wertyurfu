import { proxyBackend } from '../_lib/backend.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    res.end();
    return;
  }

  await proxyBackend(req, res, '/customers/payment-records');
}
