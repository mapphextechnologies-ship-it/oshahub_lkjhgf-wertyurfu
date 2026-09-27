import { isCallbackAuthorized } from '../_lib/callbackAuth.js';
import { registerC2BUrls } from '../_lib/daraja.js';
import { sendJson } from '../_lib/http.js';
import { requireFinanceUser } from '../_lib/supabase.js';

async function isAuthorized(req) {
  if (isCallbackAuthorized(req)) return true;
  try {
    await requireFinanceUser(req);
    return true;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    if (!(await isAuthorized(req))) {
      sendJson(res, 401, { message: 'C2B URL registration is not authorized.' });
      return;
    }

    const result = await registerC2BUrls();
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      message: error.message,
      providerResponse: error.providerResponse || null
    });
  }
}
