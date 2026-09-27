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

    const agentResult = await getSupabase()
      .from('agents')
      .select('id,agent_code,full_name,agent_name')
      .eq('id', id)
      .maybeSingle();

    if (agentResult.error) throw agentResult.error;
    if (!agentResult.data) {
      sendJson(res, 404, { message: 'Agent not found.' });
      return;
    }

    const agentCode = agentResult.data.agent_code || '';
    await Promise.all([
      getSupabase().from('inventory_products').update({ assigned_agent_id: null, assigned_agent_code: null }).eq('assigned_agent_id', id),
      agentCode ? getSupabase().from('customers').update({ agent_id: null, agent_name: null }).eq('agent_id', agentCode) : Promise.resolve({}),
      getSupabase().from('agents').delete().eq('id', id)
    ]);

    await audit(user, 'agent_deleted', 'agents', id, {
      agentCode,
      agentName: agentResult.data.full_name || agentResult.data.agent_name || ''
    });

    sendJson(res, 200, { deleted: true });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}

