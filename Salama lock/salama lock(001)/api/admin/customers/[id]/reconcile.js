import { readJson, sendJson } from '../../../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../../../_lib/security.js';
import { getSupabase, requirePortalUser } from '../../../_lib/supabase.js';
import { reconcileCustomerPaygoAndLocker } from '../../../_lib/database.js';

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
    await assertRateLimit(req, { scope: 'admin-customer-reconcile', limit: 20, windowMs: 60_000 });

    const user = await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const routeId = String(req.query.id || '').trim();
    const bodyCustomerId = String(body.customerId || body.customer_id || '').trim();
    const nationalId = String(body.nationalId || body.national_id || '').trim();
    const accountReference = String(body.accountReference || body.account_reference || '').trim();
    const customerId = routeId || bodyCustomerId;

    if (!customerId && !nationalId && !accountReference) {
      sendJson(res, 400, { message: 'Provide customerId, nationalId, or accountReference.' });
      return;
    }

    let customer = null;
    if (customerId) {
      const result = await getSupabase()
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .maybeSingle();

      if (result.error) throw result.error;
      customer = result.data || null;
    }

    if (!customer && nationalId) {
      const result = await getSupabase()
        .from('customers')
        .select('*')
        .eq('national_id', nationalId)
        .maybeSingle();

      if (result.error) throw result.error;
      customer = result.data || null;
    }

    if (!customer && accountReference) {
      const mappedCustomerResult = await getSupabase()
        .from('customer_device_mappings')
        .select('customer_id,customer_account')
        .eq('customer_account', accountReference)
        .maybeSingle();

      if (mappedCustomerResult.error) throw mappedCustomerResult.error;
      if (mappedCustomerResult.data?.customer_id) {
        const mappedCustomer = await getSupabase()
          .from('customers')
          .select('*')
          .eq('id', mappedCustomerResult.data.customer_id)
          .maybeSingle();

        if (mappedCustomer.error) throw mappedCustomer.error;
        customer = mappedCustomer.data || null;
      }
    }

    if (!customer) {
      sendJson(res, 404, { message: 'Customer not found.' });
      return;
    }

    const result = await reconcileCustomerPaygoAndLocker(customer, {
      now: new Date(),
      sourcePortal: 'admin_customer_reconcile',
      reason: String(body.reason || 'Admin reconciliation').trim() || 'Admin reconciliation',
      action: body.action || null,
      state: body.state || null
    });

    await audit(user, 'customer_paygo_reconciled', 'customers', customer.id, {
      customerName: customer.customer_name || '',
      nationalId: customer.national_id || '',
      deviceState: result.deviceState,
      lockerAction: result.lockerResult?.action || result.deviceAction,
      lockerStatus: result.lockerResult?.honorLockStatus || result.deviceState,
      paymentCount: Array.isArray(result.payments) ? result.payments.length : 0
    });

    sendJson(res, 200, {
      ok: true,
      customerId: customer.id,
      nationalId: customer.national_id || null,
      deviceState: result.deviceState,
      deviceAction: result.deviceAction,
      schedule: result.schedule,
      patch: result.patch,
      lockerResult: result.lockerResult
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
