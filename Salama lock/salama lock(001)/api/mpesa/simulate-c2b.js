import { isCallbackAuthorized } from '../_lib/callbackAuth.js';
import { readJson, sendJson } from '../_lib/http.js';
import { simulateC2BPayment } from '../_lib/daraja.js';
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
      sendJson(res, 401, { message: 'C2B simulation is not authorized.' });
      return;
    }

    const body = await readJson(req);
    const result = await simulateC2BPayment({
      amount: body.amount,
      phone: body.phone,
      accountReference: body.accountReference || body.account_reference || body.billRefNumber,
      commandId: body.commandId || body.command_id
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      message: error.message,
      providerResponse: error.providerResponse || null
    });
  }
}
