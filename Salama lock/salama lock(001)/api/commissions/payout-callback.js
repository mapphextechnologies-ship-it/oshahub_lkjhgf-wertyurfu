import { sendCommissionPaidSms } from '../_lib/africastalking.js';
import { isCallbackAuthorized } from '../_lib/callbackAuth.js';
import { readJson, sendJson } from '../_lib/http.js';
import { getSupabase } from '../_lib/supabase.js';

function payoutStatus(value) {
  const normalized = String(value || '').toLowerCase();
  if (Number(value) === 0) return 'paid';
  if (['success', 'successful', 'completed'].includes(normalized)) return 'paid';
  if (['failed', 'failure', 'cancelled', 'canceled'].includes(normalized)) return 'failed';
  return 'processing';
}

function darajaResult(body) {
  return body?.Result || body?.result || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    if (!isCallbackAuthorized(req, ['PAYOUT_CALLBACK_SECRET', 'WEBHOOK_SECRET'])) {
      sendJson(res, 401, { message: 'Payout callback is not authorized.' });
      return;
    }

    const body = await readJson(req);
    const resultBody = darajaResult(body);
    const transactionId = resultBody?.ConversationID ||
      resultBody?.OriginatorConversationID ||
      body.transactionId ||
      body.providerRefId ||
      body.provider_reference ||
      body.id;
    const status = payoutStatus(resultBody?.ResultCode ?? body.status ?? body.statusCode);
    const completedAt = status === 'paid' || status === 'failed' ? new Date().toISOString() : null;

    if (!transactionId) {
      sendJson(res, 400, { message: 'Missing payout transactionId.' });
      return;
    }

    const payoutRequest = await getSupabase()
      .from('agent_payout_requests')
      .select('*')
      .or(`backend_reference.eq.${transactionId},provider_reference.eq.${transactionId}`)
      .maybeSingle();

    if (payoutRequest.error) throw payoutRequest.error;
    if (!payoutRequest.data) {
      sendJson(res, 404, { message: 'Payout request not found.' });
      return;
    }
    const alreadyPaid = String(payoutRequest.data.status || '').toLowerCase() === 'paid';

    const updateRequest = await getSupabase()
      .from('agent_payout_requests')
      .update({
        status,
        provider_reference: transactionId,
        provider_response: body,
        processed_at: completedAt
      })
      .eq('id', payoutRequest.data.id)
      .select()
      .single();

    if (updateRequest.error) throw updateRequest.error;

    const updateCommission = await getSupabase()
      .from('commissions')
      .update({
        status: status === 'paid' ? 'paid' : status === 'failed' ? 'failed' : 'processing',
        payout_status: status,
        paid_at: status === 'paid' ? completedAt : null,
        payout_completed_at: status === 'paid' ? completedAt : null,
        payout_reference: transactionId,
        provider_response: body,
        payout_error: status === 'failed' ? resultBody?.ResultDesc || body.description || body.message || 'Payout failed.' : null
      })
      .eq('id', payoutRequest.data.commission_id)
      .select()
      .single();

    if (updateCommission.error) throw updateCommission.error;

    if (status === 'paid' && !alreadyPaid) {
      await sendCommissionPaidSms({ commission: updateCommission.data }).catch(() => null);
    }

    sendJson(res, 200, { ok: true, status });
  } catch (error) {
    sendJson(res, 500, { message: error.message });
  }
}
