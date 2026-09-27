import { readJson, sendJson } from '../_lib/http.js';
import { assertBodySize, assertPositiveNumber, assertRateLimit, assertRequiredTextFields } from '../_lib/security.js';
import { getSupabase, requirePortalUser } from '../_lib/supabase.js';
import { calculatePaygoDueDate, createOtp, hashOtp } from '../_lib/database.js';
import { sendScreeningSms } from '../_lib/africastalking.js';

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
    await assertRateLimit(req, { scope: 'admin-customers', limit: 20, windowMs: 60_000 });
    const user = await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const customerName = String(body.customerName || '').trim();
    const customerPhone = String(body.customerPhone || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const nationalId = String(body.nationalId || '').trim();
    const productType = String(body.productType || '').trim().toLowerCase();
    const productModel = String(body.productModel || '').trim();
    const serialNumber = String(body.serialNumber || '').trim();
    const chassisNumber = String(body.chassisNumber || '').trim();
    const nextOfKinName = String(body.nextOfKinName || body.next_of_kin_name || '').trim();
    const nextOfKinPhone = String(body.nextOfKinPhone || body.next_of_kin_phone || '').trim();
    const nextOfKinRelationship = String(body.nextOfKinRelationship || body.next_of_kin_relationship || '').trim();

    assertRequiredTextFields({
      'customer name': customerName,
      'customer phone': customerPhone,
      'customer email': email,
      'national ID': nationalId,
      'next-of-kin name': nextOfKinName,
      'next-of-kin phone': nextOfKinPhone,
      'next-of-kin relationship': nextOfKinRelationship,
      'product type': productType,
      'product model': productModel,
      'serial number or chassis number': serialNumber || chassisNumber
    });

    if (!email.includes('@')) {
      sendJson(res, 400, { message: 'Enter a valid customer email.' });
      return;
    }

    const totalPayable = assertPositiveNumber(body.totalPayable, 'total payable amount');
    const dailyInstallment = assertPositiveNumber(body.dailyInstallment, 'daily installment');
    const paidAmount = Number(body.paidAmount || 0);
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      sendJson(res, 400, { message: 'Enter a valid paid amount.' });
      return;
    }

    if (paidAmount > 0) {
      sendJson(res, 409, { message: 'Do not record the deposit at customer creation. Capture it later after next-of-kin acceptance.' });
      return;
    }
    const dueDate = calculatePaygoDueDate(totalPayable, dailyInstallment, new Date());
    const totalInstallments = Math.max(1, Math.ceil(totalPayable / dailyInstallment));
    const activationOtp = createOtp();
    const activationExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data, error } = await getSupabase()
      .from('customers')
      .insert({
        customer_name: customerName,
        customer_phone: customerPhone,
        email,
        national_id: nationalId,
        date_of_birth: body.dateOfBirth || body.date_of_birth || null,
        gender: body.gender || null,
        location: body.location || null,
        occupation: body.occupation || null,
        next_of_kin_name: nextOfKinName,
        next_of_kin_phone: nextOfKinPhone,
        next_of_kin_relationship: nextOfKinRelationship,
        product_type: productType,
        product_model: productModel,
        bike_model: productType === 'bike' ? productModel : null,
        serial_number: serialNumber || chassisNumber,
        chassis_number: chassisNumber || null,
        total_payable: totalPayable,
        paid_amount: 0,
        balance: totalPayable,
        daily_installment: dailyInstallment,
        due_date: dueDate,
        paygo_total_installments: totalInstallments,
        paygo_next_due_at: dueDate ? `${dueDate}T00:00:00.000Z` : null,
        application_status: 'active',
        status: 'active',
        customer_activation_otp_hash: hashOtp('', activationOtp),
        customer_activation_otp_expires_at: activationExpiresAt,
        customer_activation_otp_sent_at: new Date().toISOString(),
        customer_activation_otp_status: 'sent',
        source_portal: 'admin'
      })
      .select()
      .single();

    if (error) throw error;

    const otpUpdate = await getSupabase()
      .from('customers')
      .update({ customer_activation_otp_hash: hashOtp(data.id, activationOtp) })
      .eq('id', data.id)
      .select()
      .single();

    if (otpUpdate.error) throw otpUpdate.error;

    const smsResult = await sendScreeningSms({
      action: 'approve',
      customer: otpUpdate.data,
      agent: null,
      activationOtp
    }).catch((smsError) => ({ delivered: false, error: smsError.message, provider: 'africastalking' }));

    await audit(user, 'customer_created', 'customers', data.id, { customerName, productType });
    sendJson(res, 201, { customer: otpUpdate.data, smsResult });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
