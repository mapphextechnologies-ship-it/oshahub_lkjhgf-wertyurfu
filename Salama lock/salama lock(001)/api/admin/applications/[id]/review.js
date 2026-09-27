import { readJson, sendJson } from '../../../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../../../_lib/security.js';
import { getSupabase, requirePortalUser } from '../../../_lib/supabase.js';
import { sendScreeningSms } from '../../../_lib/africastalking.js';
import { createOtp, hashOtp, markApplicationProductSold } from '../../../_lib/database.js';

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

async function auditSafe(user, action, targetTable, targetId, details = {}) {
  return audit(user, action, targetTable, targetId, details).catch((error) => ({
    error: error.message
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'admin-application-review', limit: 30, windowMs: 60_000 });
    const user = await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const id = req.query?.id || req.url.split('/').slice(-2)[0];
    const action = String(body.action || '').trim();
    const reason = String(body.reason || '').trim();

    if (!['approve', 'reject', 'request_info'].includes(action)) {
      sendJson(res, 400, { message: 'Choose approve, reject, or request information.' });
      return;
    }

    const nextStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'info_required';
    const application = await getSupabase()
      .from('customer_applications')
      .select('*, customers(*)')
      .eq('id', id)
      .maybeSingle();

    if (application.error) throw application.error;
    if (!application.data) {
      sendJson(res, 404, { message: 'Customer application not found.' });
      return;
    }

    const activationOtp = nextStatus === 'approved' ? createOtp() : '';
    const activationExpiresAt = activationOtp ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null;

    const updateApplication = await getSupabase()
      .from('customer_applications')
      .update({
        status: nextStatus,
        review_reason: reason || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateApplication.error) throw updateApplication.error;

    const customerStatus = nextStatus === 'approved' ? 'active' : nextStatus === 'rejected' ? 'rejected' : 'not_registered';
    const customerUpdate = {
      status: customerStatus,
      application_status: nextStatus === 'approved' ? 'active' : nextStatus,
      screening_reason: reason || null,
      screened_by: user.id,
      screened_at: new Date().toISOString()
    };

    if (nextStatus === 'rejected') {
      customerUpdate.balance = 0;
      customerUpdate.overdue_days = 0;
    }

    if (activationOtp) {
      customerUpdate.customer_activation_otp_hash = hashOtp(application.data.customer_id, activationOtp);
      customerUpdate.customer_activation_otp_expires_at = activationExpiresAt;
      customerUpdate.customer_activation_otp_sent_at = new Date().toISOString();
      customerUpdate.customer_activation_otp_status = 'sent';
    }

    const updateCustomer = await getSupabase()
      .from('customers')
      .update(customerUpdate)
      .eq('id', application.data.customer_id)
      .select()
      .maybeSingle();

    if (updateCustomer.error) throw updateCustomer.error;
    if (!updateCustomer.data) {
      sendJson(res, 404, { message: 'Linked customer record not found.' });
      return;
    }

    let soldProduct = null;
    if (nextStatus === 'approved') {
      const sold = await markApplicationProductSold({
        application: application.data,
        customer: updateCustomer.data,
        sourcePortal: 'admin_screening'
      });
      soldProduct = sold.product;
    }

    const agentResult = application.data.agent_id
      ? await getSupabase().from('agents').select('*').eq('agent_code', application.data.agent_id).maybeSingle()
      : { data: null };

    const smsAction = action === 'request_info' ? 'info' : action;
    const smsResult = await sendScreeningSms({
      action: smsAction,
      customer: updateCustomer.data,
      agent: agentResult.data,
      reason,
      activationOtp
    }).catch((smsError) => ({
      error: smsError.message,
      provider: 'africastalking'
    }));

    const notificationResult = await getSupabase().from('agent_notifications').insert({
      agent_name: application.data.agent_name || null,
      agent_code: application.data.agent_id || null,
      customer_id: application.data.customer_id,
      customer_name: updateCustomer.data.customer_name || application.data.customers?.customer_name || 'Customer',
      message: `Application ${nextStatus.replace('_', ' ')}${reason ? `: ${reason}` : '.'}`,
      status: 'queued',
      source_portal: 'admin'
    }).catch((notificationError) => ({
      error: notificationError.message
    }));

    await auditSafe(user, `application_${nextStatus}`, 'customer_applications', id, { reason, smsResult, notificationResult, soldProduct });
    sendJson(res, 200, { application: updateApplication.data, customer: updateCustomer.data, soldProduct, smsResult });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
