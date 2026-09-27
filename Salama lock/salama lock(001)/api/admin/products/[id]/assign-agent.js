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
    await assertRateLimit(req, { scope: 'admin-product-agent-assignment', limit: 30, windowMs: 60_000 });
    const user = await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const id = req.query?.id || req.url.split('/').slice(-2)[0];
    const assignedAgentId = String(body.assignedAgentId || body.assigned_agent_id || '').trim();
    const assignedAgentCode = String(body.assignedAgentCode || body.assigned_agent_code || '').trim();

    const productResult = await getSupabase()
      .from('inventory_products')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (productResult.error) throw productResult.error;
    if (!productResult.data) {
      sendJson(res, 404, { message: 'Bike was not found.' });
      return;
    }
    if (productResult.data.assigned_customer_id || productResult.data.status === 'sold') {
      sendJson(res, 409, { message: 'Sold or customer-assigned bikes cannot be reassigned to another agent.' });
      return;
    }

    let assignedAgent = null;
    if (assignedAgentId || assignedAgentCode) {
      if (assignedAgentId) {
        const byId = await getSupabase()
          .from('agents')
          .select('id,agent_code,full_name,agent_name,status')
          .eq('id', assignedAgentId)
          .maybeSingle();
        if (byId.error) throw byId.error;
        if (byId.data) {
          assignedAgent = byId.data;
        }
      }

      if (!assignedAgent && assignedAgentCode) {
        const byCode = await getSupabase()
          .from('agents')
          .select('id,agent_code,full_name,agent_name,status')
          .ilike('agent_code', assignedAgentCode)
          .maybeSingle();
        if (byCode.error) throw byCode.error;
        if (byCode.data) {
          assignedAgent = byCode.data;
        }
      }

      if (!assignedAgent && assignedAgentCode) {
        const byEmail = await getSupabase()
          .from('agents')
          .select('id,agent_code,full_name,agent_name,status')
          .ilike('email', assignedAgentCode)
          .maybeSingle();
        if (byEmail.error) throw byEmail.error;
        if (byEmail.data) {
          assignedAgent = byEmail.data;
        }
      }

      if (!assignedAgent) {
        sendJson(res, 404, { message: 'Agent was not found.' });
        return;
      }
    }

    const updated = await getSupabase()
      .from('inventory_products')
      .update({
        assigned_agent_id: assignedAgent?.id || null,
        assigned_agent_code: assignedAgent?.agent_code || assignedAgentCode || null,
        status: assignedAgent ? 'assigned' : 'available'
      })
      .eq('id', id)
      .select()
      .single();

    if (updated.error) throw updated.error;
    await audit(user, 'product_agent_assigned', 'inventory_products', id, {
      assignedAgentId: assignedAgent?.id || null,
      assignedAgentCode: assignedAgent?.agent_code || assignedAgentCode || null
    });

    sendJson(res, 200, { product: updated.data });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
