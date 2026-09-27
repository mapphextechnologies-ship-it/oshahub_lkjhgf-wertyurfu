import { sendJson } from '../_lib/http.js';
import { resolveSiteContent } from '../_lib/site-content.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    const siteContent = await resolveSiteContent();
    sendJson(res, 200, siteContent);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
