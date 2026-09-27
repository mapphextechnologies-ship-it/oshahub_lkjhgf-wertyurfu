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

function parseStorageReference(reference) {
  const value = String(reference || '');
  if (!value.startsWith('storage://')) return null;
  const withoutScheme = value.slice('storage://'.length);
  const slashIndex = withoutScheme.indexOf('/');
  if (slashIndex <= 0) return null;
  return {
    bucket: withoutScheme.slice(0, slashIndex),
    path: withoutScheme.slice(slashIndex + 1)
  };
}

async function signedDocumentUrl(reference) {
  const parsed = parseStorageReference(reference);
  if (!parsed) return reference || '';

  const signed = await getSupabase()
    .storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, 60 * 10);

  if (signed.error) return '';
  return signed.data.signedUrl || '';
}

async function buildApplicationDocuments(customer = {}) {
  const entries = [
    ['Customer passport photo', customer.passport_photo_url],
    ['Customer national ID front scan', customer.id_front_url],
    ['Customer national ID back scan', customer.id_back_url],
    ['Next-of-kin passport photo', customer.next_of_kin_passport_photo_url],
    ['Next-of-kin national ID front scan', customer.next_of_kin_id_front_url],
    ['Next-of-kin national ID back scan', customer.next_of_kin_id_back_url]
  ];

  const documents = await Promise.all(entries.map(async ([label, reference]) => ({
    type: label,
    label,
    url: await signedDocumentUrl(reference),
    status: 'captured',
    storagePath: reference
  })));

  return documents.filter((item) => item.url);
}

function mapApplicationRow(item = {}, current = {}) {
  return {
    id: item.id,
    customerId: item.customer_id,
    customerName: item.customers?.customer_name || '',
    phone: item.customers?.customer_phone || '',
    nationalId: item.national_id || item.customers?.national_id || '',
    agentName: item.agent_name || '',
    agentId: item.agent_id || '',
    bikeId: item.product_id || current?.id || '',
    productType: item.customers?.product_type || 'product',
    productModel: item.customers?.product_model || item.customers?.bike_model || '',
    depositAmount: Number(item.customers?.paid_amount || 0),
    installmentPlan: item.customers?.daily_installment
      ? `Daily KES ${Number(item.customers.daily_installment || 0).toLocaleString('en-KE')}`
      : 'Daily repayment',
    nextOfKin: {
      name: item.customers?.next_of_kin_name || '',
      phone: item.customers?.next_of_kin_phone || '',
      relationship: item.customers?.next_of_kin_relationship || '',
      nationalId: item.customers?.next_of_kin_national_id || '',
      gender: item.customers?.next_of_kin_gender || '',
      location: item.customers?.next_of_kin_location || '',
      occupation: item.customers?.next_of_kin_occupation || ''
    },
    nextOfKinPhone: item.customers?.next_of_kin_phone || '',
    nextOfKinNationalId: item.customers?.next_of_kin_national_id || '',
    nextOfKinGender: item.customers?.next_of_kin_gender || '',
    nextOfKinLocation: item.customers?.next_of_kin_location || '',
    nextOfKinOccupation: item.customers?.next_of_kin_occupation || '',
    customerOtpVerified: item.customers?.customer_activation_otp_status === 'verified',
    nextOfKinOtpVerified: item.customers?.next_of_kin_otp_status === 'verified',
    duplicateNationalId: Boolean(item.duplicate_national_id),
    documents: current?.documents || [],
    verification: item.verification || {},
    status: item.status || 'pending_screening',
    reason: item.review_reason || '',
    reviewedAt: item.reviewed_at || '',
    reviewedBy: item.reviewed_by || '',
    submittedAt: item.created_at || '',
    createdAt: item.created_at ? new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
  };
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET,POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    const admin = await requirePortalUser(req, ['admin']);
    const id = req.query?.id || req.url.split('/').slice(-2)[0];

    const current = await getSupabase()
      .from('customer_applications')
      .select('*, customers(*)')
      .eq('id', id)
      .maybeSingle();

    if (current.error) throw current.error;
    if (!current.data) {
      sendJson(res, 404, { message: 'Customer application not found.' });
      return;
    }

    if (req.method === 'GET') {
      const documents = await buildApplicationDocuments(current.data.customers || {});
      sendJson(res, 200, {
        application: mapApplicationRow(current.data, { documents }),
        documents
      });
      return;
    }

    assertBodySize(req);
    await assertRateLimit(req, { scope: 'admin-application-details', limit: 40, windowMs: 60_000 });
    const body = await readJson(req);

    const update = {};
    if (Object.prototype.hasOwnProperty.call(body, 'verification')) {
      update.verification = body.verification && typeof body.verification === 'object' ? body.verification : {};
    }
    if (Object.prototype.hasOwnProperty.call(body, 'bikeId')) {
      update.product_id = body.bikeId ? String(body.bikeId) : null;
    }

    if (update.product_id) {
      const productCheck = await getSupabase()
        .from('inventory_products')
        .select('*')
        .eq('id', update.product_id)
        .maybeSingle();
      if (productCheck.error) throw productCheck.error;
      if (!productCheck.data) {
        sendJson(res, 404, { message: 'Selected bike was not found.' });
        return;
      }
      if (
        productCheck.data.status === 'sold' ||
        (productCheck.data.assigned_customer_id && productCheck.data.assigned_customer_id !== current.data.customer_id)
      ) {
        sendJson(res, 409, { message: 'This bike is already sold or reserved for another customer.' });
        return;
      }
    }

    const updated = await getSupabase()
      .from('customer_applications')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (updated.error) throw updated.error;

    if (Object.prototype.hasOwnProperty.call(update, 'product_id')) {
      const previouslyAssigned = await getSupabase()
        .from('inventory_products')
        .select('id,assigned_agent_id')
        .eq('assigned_customer_id', current.data.customer_id);

      if (previouslyAssigned.error) throw previouslyAssigned.error;

      await Promise.all((previouslyAssigned.data || []).map(async (product) => {
        const nextStatus = product.assigned_agent_id ? 'assigned' : 'available';
        const cleared = await getSupabase()
          .from('inventory_products')
          .update({ assigned_customer_id: null, status: nextStatus })
          .eq('id', product.id)
          .select()
          .maybeSingle();
        if (cleared.error) throw cleared.error;
        return cleared.data;
      }));

      if (update.product_id) {
        const product = await getSupabase()
          .from('inventory_products')
          .update({ assigned_customer_id: current.data.customer_id, status: 'reserved' })
          .eq('id', update.product_id)
          .select()
          .maybeSingle();
        if (product.error) throw product.error;
      }
    }

    await audit(admin, 'application_details_updated', 'customer_applications', id, {
      fields: Object.keys(update)
    });
    sendJson(res, 200, { application: updated.data });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
