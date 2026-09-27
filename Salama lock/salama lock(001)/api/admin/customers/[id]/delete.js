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

    const customerResult = await getSupabase()
      .from('customers')
      .select('id,customer_name,customer_phone,national_id')
      .eq('id', id)
      .maybeSingle();

    if (customerResult.error) throw customerResult.error;
    if (!customerResult.data) {
      sendJson(res, 404, { message: 'Customer not found.' });
      return;
    }

    await Promise.all([
      getSupabase().from('inventory_products').update({ assigned_customer_id: null }).eq('assigned_customer_id', id),
      getSupabase().from('customers').delete().eq('id', id)
    ]);

    await audit(user, 'customer_deleted', 'customers', id, {
      customerName: customerResult.data.customer_name || '',
      customerPhone: customerResult.data.customer_phone || '',
      nationalId: customerResult.data.national_id || ''
    });

    sendJson(res, 200, { deleted: true });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}

