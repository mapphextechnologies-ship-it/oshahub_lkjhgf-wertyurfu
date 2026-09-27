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

    const productResult = await getSupabase()
      .from('inventory_products')
      .select('id,product_type,product_model,serial_number,chassis_number,assigned_customer_id')
      .eq('id', id)
      .maybeSingle();

    if (productResult.error) throw productResult.error;
    if (!productResult.data) {
      sendJson(res, 404, { message: 'Product not found.' });
      return;
    }

    await getSupabase().from('inventory_products').delete().eq('id', id);

    await audit(user, 'product_deleted', 'inventory_products', id, {
      productType: productResult.data.product_type || '',
      productModel: productResult.data.product_model || '',
      serialNumber: productResult.data.serial_number || '',
      chassisNumber: productResult.data.chassis_number || '',
      assignedCustomerId: productResult.data.assigned_customer_id || null
    });

    sendJson(res, 200, { deleted: true });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}

