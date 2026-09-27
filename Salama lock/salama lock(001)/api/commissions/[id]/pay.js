import { proxyBackend } from '../../_lib/backend.js';
import { readJson } from '../../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.statusCode = 405;
    res.end();
    return;
  }

  const id = req.query?.id || req.url.split('/').slice(-2)[0];
  await proxyBackend(req, res, `/commissions/${id}/pay`, { method: 'POST', body: await readJson(req) });
}
