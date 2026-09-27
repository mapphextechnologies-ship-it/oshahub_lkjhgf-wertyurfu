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

    const applicationResult = await getSupabase()
      .from('customer_applications')
      .select('id,customer_id,product_id,status')
      .eq('id', id)
      .maybeSingle();

    if (applicationResult.error) throw applicationResult.error;
    if (!applicationResult.data) {
      sendJson(res, 404, { message: 'Application not found.' });
      return;
    }

    const customerId = applicationResult.data.customer_id;
    const productId = applicationResult.data.product_id;

    const assignedProducts = customerId
      ? await getSupabase()
        .from('inventory_products')
        .select('id,assigned_customer_id,status,assigned_agent_id')
        .eq('assigned_customer_id', customerId)
      : { data: [], error: null };

    if (assignedProducts.error) throw assignedProducts.error;

    const tasks = [
      getSupabase().from('customer_applications').delete().eq('id', id)
    ];

    if (productId) {
      tasks.push(
        getSupabase().from('inventory_products').update({ assigned_customer_id: null, status: 'available' }).eq('id', productId)
      );
    }

    (assignedProducts.data || []).forEach((product) => {
      if (product.id === productId) {
        return;
      }
      tasks.push(
        getSupabase().from('inventory_products').update({
          assigned_customer_id: null,
          status: product.assigned_agent_id ? 'assigned' : 'available'
        }).eq('id', product.id)
      );
    });

    await Promise.all(tasks);

    await audit(user, 'application_deleted', 'customer_applications', id, {
      customerId,
      productId,
      status: applicationResult.data.status || ''
    });

    sendJson(res, 200, { deleted: true });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
