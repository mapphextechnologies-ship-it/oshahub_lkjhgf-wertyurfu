import { sendJson } from '../../../_lib/http.js';
import { getSupabase, requirePortalUser } from '../../../_lib/supabase.js';

async function audit(user, action, targetTable, targetId, details = {}) {
  await getSupabase().from('admin_audit_logs').insert({
    actor_user_id: user.id,
    actor_email: user.email,
    action,
    target_table: targetTable,
    target_id: targetId,
    details
  });
}

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    const user = await requirePortalUser(req, ['admin']);
    const { id } = req.query;

    const paymentResult = await getSupabase()
      .from('payments')
      .select('id,receipt,customer_id,customer_name,agent_id,agent_name,amount,product_type,status')
      .eq('id', id)
      .maybeSingle();

    if (paymentResult.error) throw paymentResult.error;
    if (!paymentResult.data) {
      sendJson(res, 404, { message: 'Payment not found.' });
      return;
    }

    await getSupabase().from('payments').delete().eq('id', id);

    await audit(user, 'payment_deleted', 'payments', id, {
      receipt: paymentResult.data.receipt || '',
      customerId: paymentResult.data.customer_id || null,
      customerName: paymentResult.data.customer_name || '',
      agentId: paymentResult.data.agent_id || null,
      agentName: paymentResult.data.agent_name || '',
      amount: paymentResult.data.amount || 0,
      productType: paymentResult.data.product_type || '',
      status: paymentResult.data.status || ''
    });

    sendJson(res, 200, { deleted: true });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
