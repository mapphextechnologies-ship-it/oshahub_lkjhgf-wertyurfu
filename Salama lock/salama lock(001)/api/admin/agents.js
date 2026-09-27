import { readJson, sendJson } from '../_lib/http.js';
import { assertBodySize, assertRateLimit, assertRequiredTextFields } from '../_lib/security.js';
import { getSupabase, requirePortalUser } from '../_lib/supabase.js';

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
    await assertRateLimit(req, { scope: 'admin-agents', limit: 20, windowMs: 60_000 });
    const user = await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const fullName = String(body.fullName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const nationalId = String(body.nationalId || '').trim();
    const region = String(body.region || '').trim();
    const agentCode = String(body.agentCode || `AG-${Date.now().toString(36).toUpperCase()}`).trim();

    assertRequiredTextFields({
      'agent full name': fullName,
      'agent email': email,
      'agent phone': phone,
      'national ID': nationalId,
      region
    });

    if (!email.includes('@')) {
      sendJson(res, 400, { message: 'Enter a valid agent email.' });
      return;
    }

    const { data, error } = await getSupabase()
      .from('agents')
      .insert({
        full_name: fullName,
        agent_name: fullName,
        agent_code: agentCode,
        email,
        phone,
        national_id: nationalId,
        region,
        status: 'active',
        source_portal: 'admin'
      })
      .select()
      .single();

    if (error) throw error;
    await audit(user, 'agent_created', 'agents', data.id, { email, phone, agentCode });
    sendJson(res, 201, { agent: data });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
