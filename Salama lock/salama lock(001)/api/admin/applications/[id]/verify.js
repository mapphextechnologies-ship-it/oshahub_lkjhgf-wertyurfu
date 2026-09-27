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
    await assertRateLimit(req, { scope: 'admin-application-verify', limit: 30, windowMs: 60_000 });
    const user = await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const id = req.query?.id || req.url.split('/').slice(-2)[0];

    const current = await getSupabase()
      .from('customer_applications')
      .select('id,customer_id,verification')
      .eq('id', id)
      .maybeSingle();

    if (current.error) throw current.error;
    if (!current.data) {
      sendJson(res, 404, { message: 'Application not found.' });
      return;
    }

    const verification = {
      ...(current.data.verification || {}),
      ...(body.verification && typeof body.verification === 'object' ? body.verification : {}),
      status: 'verified',
      verifiedAt: new Date().toISOString(),
      verifiedBy: user.email
    };

    const updated = await getSupabase()
      .from('customer_applications')
      .update({
        verification,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updated.error) throw updated.error;

    await audit(user, 'application_verified', 'customer_applications', id, {
      customerId: current.data.customer_id,
      verificationKeys: Object.keys(verification)
    });

    sendJson(res, 200, { application: updated.data });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
