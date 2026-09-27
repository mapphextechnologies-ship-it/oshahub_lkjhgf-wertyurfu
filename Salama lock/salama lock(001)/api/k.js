import { sendJson } from './_lib/http.js';

function publicAppBaseUrl() {
  const configured = String(
    process.env.PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    'https://www.SALAMA LOCKpay.com'
  )
    .trim()
    .replace(/\/+$/, '');
  return configured.startsWith('http') ? configured : `https://${configured}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  const url = new URL(req.url, 'https://local.vercel.app');
  const customerId = String(url.searchParams.get('c') || '').trim();
  const otp = String(url.searchParams.get('o') || '').trim();

  if (!/^CUS-[A-Z0-9]{6,32}$/i.test(customerId) || !/^\d{6}$/.test(otp)) {
    sendJson(res, 400, { message: 'This next-of-kin confirmation link is invalid.' });
    return;
  }

  const destination = new URL('/', publicAppBaseUrl());
  destination.searchParams.set('customer', customerId);
  destination.searchParams.set('otp', otp);
  destination.hash = '/next-of-kin';
  res.statusCode = 302;
  res.setHeader('Location', destination.toString());
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}
