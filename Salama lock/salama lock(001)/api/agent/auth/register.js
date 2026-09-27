import { readJson, sendJson, sendOptions } from '../../_lib/http.js';
import { assertBodySize, assertRateLimit, validateStrongPassword } from '../../_lib/security.js';
import { getSupabase, getSupabaseAuth } from '../../_lib/supabase.js';

function agentCode(seed = '') {
  const compactDate = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  const stable = String(seed || random).replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'AG';
  return `AG-KE-${compactDate}-${stable}${random}`;
}

async function findAuthUserByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;

  let page = 1;
  while (page <= 10) {
    const { data, error } = await getSupabase().auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;

    const user = data.users.find((item) => String(item.email || '').toLowerCase() === normalizedEmail);
    if (user) return user;
    if (data.users.length < 100) return null;
    page += 1;
  }

  return null;
}

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
    await assertRateLimit(req, { scope: 'agent-register', limit: 5, windowMs: 60_000 });
    const body = await readJson(req);
    const fullName = String(body.fullName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    const region = String(body.region || '').trim();
    const nationalId = String(body.nationalId || '').trim();

    if (!fullName || !email.includes('@') || !phone || !nationalId || !region || !validateStrongPassword(password)) {
      sendJson(res, 400, { message: 'Enter full name, email, phone, national ID, region, and a strong password.' });
      return;
    }

    let existing = await getSupabase()
      .from('agents')
      .select('*')
      .ilike('email', email)
      .maybeSingle();

    if (existing.error) {
      sendJson(res, 400, { message: existing.error.message || 'Could not check agent profile.' });
      return;
    }

    if (!existing.data) {
      existing = await getSupabase()
        .from('agents')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();

      if (existing.error) {
        sendJson(res, 400, { message: existing.error.message || 'Could not check agent profile.' });
        return;
      }
    }

    let profile;

    if (existing.data?.auth_user_id) {
      sendJson(res, 409, { message: 'This agent profile is already linked to another login.' });
      return;
    }

    const existingAuthUser = await findAuthUserByEmail(email);
    let authUserId = existingAuthUser?.id || '';
    let createdAuthUser = false;

    if (existingAuthUser) {
      const role = existingAuthUser.app_metadata?.role || existingAuthUser.user_metadata?.role || 'agent';
      if (role !== 'agent') {
        sendJson(res, 409, { message: 'This email is already used by another portal role.' });
        return;
      }

      const signInCheck = await getSupabaseAuth().auth.signInWithPassword({ email, password });
      const canClaimExistingAgentProfile = existing.data &&
        String(existing.data.email || '').toLowerCase() === email &&
        String(existing.data.phone || '') === phone &&
        String(existing.data.national_id || '') === nationalId &&
        (!existing.data.auth_user_id || existing.data.auth_user_id === authUserId);

      if ((signInCheck.error || !signInCheck.data?.user) && !canClaimExistingAgentProfile) {
        sendJson(res, 409, { message: 'An agent login already exists for this email. Use the existing password or reset it.' });
        return;
      }

      const updatePayload = {
        user_metadata: {
          ...existingAuthUser.user_metadata,
          full_name: fullName,
          phone,
          role: 'agent'
        },
        app_metadata: {
          ...existingAuthUser.app_metadata,
          role: 'agent'
        }
      };

      if (signInCheck.error || !signInCheck.data?.user) {
        updatePayload.password = password;
      }

      await getSupabase().auth.admin.updateUserById(authUserId, updatePayload);
    } else {
      const auth = await getSupabase().auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone,
          role: 'agent'
        },
        app_metadata: {
          role: 'agent'
        }
      });

      if (auth.error) {
        sendJson(res, 400, { message: auth.error.message || 'Could not create agent account.' });
        return;
      }

      authUserId = auth.data.user.id;
      createdAuthUser = true;
    }

    async function rollbackAuthUser() {
      if (createdAuthUser) await getSupabase().auth.admin.deleteUser(authUserId).catch(() => {});
    }

    if (existing.data) {
      const linked = await getSupabase()
        .from('agents')
        .update({
          auth_user_id: authUserId,
          full_name: fullName,
          agent_name: fullName,
          national_id: existing.data.national_id || nationalId || null,
          phone: existing.data.phone || phone,
          email: existing.data.email || email,
          region: existing.data.region || region,
          status: existing.data.status === 'active' ? 'active' : 'pending'
        })
        .eq('id', existing.data.id)
        .select()
        .single();

      if (linked.error) {
        await rollbackAuthUser();
        sendJson(res, 400, { message: linked.error.message || 'Could not link agent profile.' });
        return;
      }

      profile = linked.data;
    } else {
      const code = agentCode(email);
      const inserted = await getSupabase()
        .from('agents')
        .insert({
          auth_user_id: authUserId,
          agent_code: code,
          full_name: fullName,
          agent_name: fullName,
          national_id: nationalId || null,
          phone,
          email,
          region,
          status: 'pending'
        })
        .select()
        .single();

      if (inserted.error) {
        await rollbackAuthUser();
        sendJson(res, 400, { message: inserted.error.message || 'Could not create agent profile.' });
        return;
      }

      profile = inserted.data;
    }

    sendJson(res, 201, {
      user: {
        id: authUserId,
        email,
        role: 'agent',
        agentId: profile.id,
        agentCode: profile.agent_code,
        fullName,
        status: profile.status
      }
    });
  } catch (error) {
    sendJson(res, 500, { message: error.message });
  }
}
