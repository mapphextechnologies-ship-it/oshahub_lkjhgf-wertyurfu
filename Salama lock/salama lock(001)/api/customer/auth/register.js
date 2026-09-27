import { sendJson, sendOptions } from '../../_lib/http.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendOptions(res, 'POST,OPTIONS');
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST,OPTIONS');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  res.setHeader('Allow', 'POST');
  sendJson(res, 410, {
    message: 'Customer self-registration is disabled. Use the approval OTP sent after admin screening.'
  });
}
