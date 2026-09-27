import { proxyBackend } from './_lib/backend.js';
import { readJson } from './_lib/http.js';

export default async function handler(req, res) {
  if (!['GET', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET,PATCH,DELETE');
    res.statusCode = 405;
    res.end();
    return;
  }

  const body = req.method === 'GET' ? undefined : await readJson(req);
  await proxyBackend(req, res, '/notifications', { method: req.method, body });
}
