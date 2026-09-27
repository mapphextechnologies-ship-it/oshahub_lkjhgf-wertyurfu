function callbackPath(req) {
  try {
    return new URL(req.url, 'https://local.vercel.app').pathname;
  } catch {
    return '';
  }
}

export function isCallbackAuthorized(req, secretNames = ['PAYMENT_CALLBACK_SECRET', 'WEBHOOK_SECRET'], { allowPublicPaymentCallbacks = false } = {}) {
  const expected = secretNames.map((name) => process.env[name]).find(Boolean);
  if (!expected) return allowPublicPaymentCallbacks && callbackPath(req).startsWith('/api/mpesa/');

  const auth = String(req.headers.authorization || '');
  const headerSecret = String(req.headers['x-callback-secret'] || req.headers['x-webhook-secret'] || '');
  const querySecret = new URL(req.url, 'https://local.vercel.app').searchParams.get('secret') || '';

  if (auth === `Bearer ${expected}` || headerSecret === expected || querySecret === expected) return true;

  return allowPublicPaymentCallbacks && ['/api/mpesa/validation', '/api/mpesa/confirmation', '/api/paybill/validation', '/api/paybill/confirmation'].includes(callbackPath(req));
}

export function hasCallbackSecret(secretNames = ['PAYMENT_CALLBACK_SECRET', 'WEBHOOK_SECRET']) {
  return secretNames.some((name) => Boolean(process.env[name]));
}
