import { sendJson } from '../../../_lib/http.js';
import { getSupabase, requirePortalUser } from '../../../_lib/supabase.js';

function amount(payment = {}) {
  const splitAmount = Number(payment.deposit_credit || payment.depositCredit || 0)
    + Number(payment.paygo_payment || payment.paygoPayment || 0);
  if (splitAmount > 0) return splitAmount;
  return Number(
    payment.paid_amount
    ?? payment.paidAmount
    ?? payment.amount
    ?? payment.total_amount
    ?? payment.totalAmount
    ?? 0
  );
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

async function buildCustomerDocuments(customer = {}) {
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

function formatDate(value) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString().slice(0, 10);
}

function backOfficeStatusForCustomer(customer = {}) {
  const status = String(customer.status || '').toLowerCase();
  const applicationStatus = String(customer.application_status || '').toLowerCase();

  if (['next_of_kin_pending', 'pending_screening', 'info_required', 'rejected', 'approved'].includes(applicationStatus)) {
    return applicationStatus;
  }

  if (['next_of_kin_pending', 'pending_screening', 'rejected'].includes(status)) {
    return status;
  }

  if (['active', 'paid', 'defaulted'].includes(status) || applicationStatus === 'active') {
    return 'approved';
  }

  return 'pending_screening';
}

function mapCustomer(customer = {}, application = null, bike = null) {
  return {
    id: customer.id,
    name: customer.customer_name || '',
    nationalId: customer.national_id || '',
    phone: customer.customer_phone || '',
    email: customer.email || '',
    dateOfBirth: customer.date_of_birth || '',
    gender: customer.gender || '',
    location: customer.location || '',
    occupation: customer.occupation || '',
    agentId: customer.agent_id || application?.agent_id || '',
    agentName: customer.agent_name || application?.agent_name || '',
    productType: customer.product_type || bike?.productType || 'product',
    productModel: customer.product_model || customer.bike_model || bike?.model || '',
    bikeModel: customer.bike_model || bike?.model || customer.product_model || '',
    chassisNumber: customer.chassis_number || bike?.chassisNumber || '',
    serialNumber: customer.serial_number || bike?.serialNumber || '',
    totalPayable: Number(customer.total_payable || 0),
    paidAmount: Number(customer.paid_amount || 0),
    balance: Number(customer.balance || 0),
    dailyInstallment: Number(customer.daily_installment || 0),
    dueDate: customer.due_date || '',
    lastPaymentDate: customer.last_payment_date || '',
    unlockUntil: customer.unlock_until || '',
    paygoScheduleStatus: customer.paygo_schedule_status || '',
    applicationStatus: customer.application_status || customer.status || 'active',
    repaymentStatus: customer.status || 'active',
    registrationStatus: customer.registration_status || customer.status || 'active',
    overdueDays: Number(customer.overdue_days || 0),
    nextOfKin: {
      name: customer.next_of_kin_name || '',
      phone: customer.next_of_kin_phone || '',
      relationship: customer.next_of_kin_relationship || '',
      nationalId: customer.next_of_kin_national_id || '',
      gender: customer.next_of_kin_gender || '',
      location: customer.next_of_kin_location || '',
      occupation: customer.next_of_kin_occupation || ''
    },
    customerOtpVerified: customer.customer_activation_otp_status === 'verified',
    nextOfKinOtpVerified: customer.next_of_kin_otp_status === 'verified',
    createdAt: customer.created_at || ''
  };
}

function mapApplication(application = null, customer = {}, documents = [], bike = null) {
  if (!application) {
    return {
      id: `CASE-${customer.id}`,
      customerId: customer.id,
      agentId: customer.agent_id || '',
      bikeId: bike?.id || '',
      productType: customer.product_type || 'product',
      productModel: customer.product_model || customer.bike_model || bike?.model || '',
      depositAmount: Number(customer.paid_amount || 0),
      installmentPlan: customer.daily_installment
        ? `Daily KES ${Number(customer.daily_installment || 0).toLocaleString('en-KE')}`
        : 'Daily repayment',
      submittedAt: customer.created_at || '',
      reviewedAt: '',
      reviewedBy: '',
      customerOtpVerified: customer.customer_activation_otp_status === 'verified',
      nextOfKinOtpVerified: customer.next_of_kin_otp_status === 'verified',
      nextOfKin: {
        name: customer.next_of_kin_name || '',
        phone: customer.next_of_kin_phone || '',
        relationship: customer.next_of_kin_relationship || '',
        nationalId: customer.next_of_kin_national_id || '',
        gender: customer.next_of_kin_gender || '',
        location: customer.next_of_kin_location || '',
        occupation: customer.next_of_kin_occupation || ''
      },
      status: backOfficeStatusForCustomer(customer),
      screeningNotes: '',
      rejectionReason: '',
      infoRequiredMessage: '',
      duplicateNationalId: false,
      documents,
      verification: {}
    };
  }

  return {
    id: application.id,
    customerId: application.customer_id,
    agentId: application.agent_id || customer.agent_id || '',
    bikeId: application.product_id || bike?.id || '',
    productType: customer.product_type || bike?.productType || 'product',
    productModel: customer.product_model || customer.bike_model || bike?.model || '',
    depositAmount: Number(customer.paid_amount || 0),
    installmentPlan: customer.daily_installment
      ? `Daily KES ${Number(customer.daily_installment || 0).toLocaleString('en-KE')}`
      : 'Daily repayment',
    submittedAt: application.created_at || customer.created_at || '',
    reviewedAt: application.reviewed_at || '',
    reviewedBy: application.reviewed_by || '',
    customerOtpVerified: customer.customer_activation_otp_status === 'verified',
    nextOfKinOtpVerified: customer.next_of_kin_otp_status === 'verified',
    nextOfKin: {
      name: customer.next_of_kin_name || '',
      phone: customer.next_of_kin_phone || '',
      relationship: customer.next_of_kin_relationship || '',
      nationalId: customer.next_of_kin_national_id || '',
      gender: customer.next_of_kin_gender || '',
      location: customer.next_of_kin_location || '',
      occupation: customer.next_of_kin_occupation || ''
    },
    status: application.status || backOfficeStatusForCustomer(customer),
    screeningNotes: application.review_reason || '',
    rejectionReason: application.rejection_reason || '',
    infoRequiredMessage: application.info_required_message || '',
    duplicateNationalId: Boolean(application.duplicate_national_id),
    documents,
    verification: application.verification || {}
  };
}

function mapBike(product = {}, customer = {}) {
  if (!product) {
    return {
      id: '',
      productType: customer.product_type || 'product',
      model: customer.product_model || customer.bike_model || '',
      imageUrl: '',
      serialNumber: customer.serial_number || '',
      chassisNumber: customer.chassis_number || '',
      imei1: '',
      imei2: '',
      status: customer.status || 'available',
      assignedCustomerId: customer.id,
      assignedAgentId: customer.agent_id || '',
      assignedAgentCode: customer.agent_id || '',
      createdAt: customer.created_at || ''
    };
  }

  const productType = String(product.product_type || '').toLowerCase() || 'product';
  const isPhone = productType === 'phone';
  const phoneProfile = Array.isArray(product.inventory_phone_profiles)
    ? product.inventory_phone_profiles[0] || {}
    : product.inventory_phone_profiles || {};

  return {
    id: product.id,
    productType,
    model: product.product_model || '',
    imageUrl: isPhone ? '' : (product.image_url || ''),
    serialNumber: isPhone ? (phoneProfile.imei_1 || product.imei_1 || product.serial_number || '') : (product.serial_number || ''),
    chassisNumber: isPhone ? (phoneProfile.imei_2 || product.imei_2 || product.chassis_number || '') : (product.chassis_number || ''),
    imei1: isPhone ? (product.imei_1 || phoneProfile.imei_1 || '') : '',
    imei2: isPhone ? (product.imei_2 || phoneProfile.imei_2 || '') : '',
    status: product.status || 'available',
    assignedCustomerId: product.assigned_customer_id || null,
    assignedAgentId: product.assigned_agent_id || null,
    assignedAgentCode: product.assigned_agent_code || null,
    createdAt: product.created_at || ''
  };
}

function mapPayment(payment = {}) {
  return {
    id: payment.id,
    customerId: payment.customer_id || '',
    agentId: payment.agent_id || '',
    customerName: payment.customer_name || '',
    amount: amount(payment),
    receipt: payment.receipt || '',
    status: payment.status || payment.payment_status || '',
    reconciliationStatus: payment.reconciliation_status || 'matched',
    productType: payment.product_type || 'bike',
    productModel: payment.product_model || payment.bike_model || '',
    chassisNumber: payment.chassis_number || '',
    dailyTarget: Number(payment.daily_target || payment.daily_installment || 0),
    overdueDays: Number(payment.overdue_days || 0),
    balance: Number(payment.balance || 0),
    totalPayable: Number(payment.total_payable || 0),
    paidAmount: Number(payment.paid_amount ?? amount(payment)),
    paidAt: payment.paid_at || payment.provider_paid_at || payment.date || '',
    date: formatDate(payment.date || payment.paid_at || payment.provider_paid_at || ''),
    dateIso: payment.date || payment.paid_at || payment.provider_paid_at || ''
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    await requirePortalUser(req, ['admin', 'finance']);
    const id = String(req.query?.id || req.url.split('/').slice(-2)[0] || '').trim();

    if (!id) {
      sendJson(res, 400, { message: 'Customer id is required.' });
      return;
    }

    const customerResult = await getSupabase()
      .from('customers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (customerResult.error) throw customerResult.error;
    if (!customerResult.data) {
      sendJson(res, 404, { message: 'Customer not found.' });
      return;
    }

    const [applicationResult, productsResult, paymentsResult, documents] = await Promise.all([
      getSupabase()
        .from('customer_applications')
        .select('*')
        .eq('customer_id', id)
        .order('created_at', { ascending: false })
        .limit(1),
      getSupabase()
        .from('inventory_products')
        .select('*, inventory_phone_profiles(*)')
        .eq('assigned_customer_id', id)
        .order('created_at', { ascending: false })
        .limit(10),
      getSupabase()
        .from('payments')
        .select('*')
        .eq('customer_id', id)
        .order('date', { ascending: false })
        .limit(200),
      buildCustomerDocuments(customerResult.data || {})
    ]);

    if (applicationResult.error) throw applicationResult.error;
    if (productsResult.error) throw productsResult.error;
    if (paymentsResult.error) throw paymentsResult.error;

    const customer = customerResult.data || {};
    const application = applicationResult.data?.[0] || null;
    const products = productsResult.data || [];
    const primaryProduct = products.find((product) => String(product.product_type || '').toLowerCase() === String(customer.product_type || '').toLowerCase())
      || products[0]
      || null;

    const bike = mapBike(primaryProduct, customer);
    const customerDetails = mapCustomer(customer, application, bike);
    const applicationDetails = mapApplication(application, customer, documents, bike);

    sendJson(res, 200, {
      customer: customerDetails,
      application: applicationDetails,
      bike,
      payments: (paymentsResult.data || []).map(mapPayment),
      documents
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
