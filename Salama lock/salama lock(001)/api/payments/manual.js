import { proxyBackend } from '../_lib/backend.js';
import { readJson } from '../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.statusCode = 405;
    res.end();
    return;
  }

  await proxyBackend(req, res, '/payments/manual', { method: 'POST', body: await readJson(req) });
}
