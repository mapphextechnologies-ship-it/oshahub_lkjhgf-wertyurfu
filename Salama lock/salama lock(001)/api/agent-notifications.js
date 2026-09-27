import { proxyBackend } from './_lib/backend.js';
import { readJson } from './_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.statusCode = 405;
    res.end();
    return;
  }

  const body = await readJson(req);
  await proxyBackend(req, res, '/agent-notifications', { method: 'POST', body });
}
