import { readJson, sendJson } from '../../../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../../../_lib/security.js';
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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'admin-payment-verify', limit: 40, windowMs: 60_000 });
    const user = await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const id = req.query?.id || req.url.split('/').slice(-2)[0];

    const current = await getSupabase()
      .from('payments')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (current.error) throw current.error;
    if (!current.data) {
      sendJson(res, 404, { message: 'Payment not found.' });
      return;
    }

    const updated = await getSupabase()
      .from('payments')
      .update({
        reconciliation_status: 'matched',
        verified_at: new Date().toISOString(),
        verified_by: user.email
      })
      .eq('id', id)
      .select()
      .single();

    if (updated.error) throw updated.error;

    await audit(user, 'payment_verified', 'payments', id, {
      receipt: current.data.receipt || '',
      customerId: current.data.customer_id || null,
      amount: current.data.amount || 0
    });

    sendJson(res, 200, { payment: updated.data });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
