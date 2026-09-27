import { findAgentForAuthUser } from '../../_lib/database.js';
import { sendJson, readJson, sendOptions } from '../../_lib/http.js';
import { assertBodySize, assertRateLimit, genericAuthMessage } from '../../_lib/security.js';
import { getSupabaseAuth } from '../../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendOptions(res, 'POST,OPTIONS');
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'agent-login', limit: 8, windowMs: 60_000 });
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email.includes('@') || password.length < 8) {
      sendJson(res, 400, { message: genericAuthMessage() });
      return;
    }

    const { data, error } = await getSupabaseAuth().auth.signInWithPassword({ email, password });
    if (error || !data?.session || !data?.user) {
      sendJson(res, 401, { message: genericAuthMessage() });
      return;
    }

    const role = data.user.app_metadata?.role || data.user.user_metadata?.role || 'agent';
    if (role !== 'agent' && role !== 'admin') {
      sendJson(res, 403, { message: 'Agent portal access is required.' });
      return;
    }

    const agent = await findAgentForAuthUser(data.user);
    if (!agent) {
      sendJson(res, 403, { message: 'Agent profile is not connected yet. Ask admin to approve or link this email.' });
      return;
    }

    if (agent.status !== 'active') {
      sendJson(res, 403, { message: 'Your agent account is waiting for admin approval. You will receive an SMS after approval.' });
      return;
    }

    sendJson(res, 200, {
      token: data.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: 'agent',
        agentId: agent.id,
        agentCode: agent.agent_code,
        fullName: data.user.user_metadata?.full_name || agent.full_name
      }
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
