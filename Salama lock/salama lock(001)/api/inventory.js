import { proxyBackend } from './_lib/backend.js';

export default async function handler(req, res) {
  await proxyBackend(req, res, '/inventory');
}
