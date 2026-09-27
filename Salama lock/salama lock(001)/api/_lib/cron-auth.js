import crypto from 'node:crypto';

function normalizeSecret(value) {
  return Buffer.from(String(value || '').trim(), 'utf8');
}

function safeEqual(a, b) {
  const left = normalizeSecret(a);
  const right = normalizeSecret(b);
  if (left.length === 0 || right.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function isAuthorizedCronRequest(req, secret, { allowQuerySecret = false } = {}) {
  const configuredSecret = String(secret || '').trim();
  if (!configuredSecret) return false;

  const auth = String(req.headers.authorization || '');
  const headerSecret = String(req.headers['x-cron-secret'] || '');

  if (auth.startsWith('Bearer ') && safeEqual(auth.slice(7), configuredSecret)) return true;
  if (safeEqual(headerSecret, configuredSecret)) return true;

  if (!allowQuerySecret) return false;

  const querySecret = new URL(req.url, 'https://local.vercel.app').searchParams.get('secret') || '';
  return safeEqual(querySecret, configuredSecret);
}
