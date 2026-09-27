import { sendJson } from '../_lib/http.js';
import { ensureMissingSaleCommissions } from '../_lib/database.js';
import { getActiveAdminProfile, getSupabase, requirePortalUser } from '../_lib/supabase.js';
import { listSmsDeliveryReports, summarizeSmsDeliveryReports } from '../_lib/sms-delivery-reports.js';
import {
  dedupeFinancialPayments,
  financialPaymentAmount,
  isSuccessfulFinancialPayment
} from '../../src/utils/financialLedger.js';
import { inferCommissionProductType } from '../../src/utils/commissionLedger.js';
import { computeCustomerArrears } from '../../src/utils/paygo.js';

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function countsForOutstanding(customer = {}) {
  const status = String(customer.status || '').toLowerCase();
  const applicationStatus = String(customer.application_status || '').toLowerCase();
  return status !== 'rejected' && applicationStatus !== 'rejected';
}

function collectedAmountForCustomer(customer = {}) {
  const totalPayable = Number(customer.total_payable || 0);
  const paidAmount = Number(customer.paid_amount || 0);
  if (Number.isFinite(totalPayable) && totalPayable > 0) {
    return Math.max(totalPayable - Number(customer.balance || 0), 0);
  }
  return paidAmount;
}

function isTrustonicLockerProvider(value) {
  return ['trustonic', 'trust', 'ttp', 'telecoms-platform', 'trustonic-v2'].includes(
    String(value || '').trim().toLowerCase()
  );
}

function resolveRouteLockerProvider(product = {}, profile = {}) {
  const productProvider = String(product.locker_provider || product.lockerProvider || '').trim();
  const profileProvider = String(profile.locker_provider || profile.lockerProvider || '').trim();
  if ([productProvider, profileProvider].some(isTrustonicLockerProvider)) return 'trustonic';
  return productProvider || profileProvider || 'honor';
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

function backOfficeStatusForCustomer(customer = {}) {
  const status = String(customer.status || '').toLowerCase();
  const applicationStatus = String(customer.application_status || '').toLowerCase();

  if ([
    'next_of_kin_pending',
    'pending_screening',
    'info_required',
    'rejected',
    'approved'
  ].includes(applicationStatus)) {
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

async function ensureCustomerApplicationRows({ customers = [], applications = [] } = {}) {
  const existingCustomerIds = new Set((applications || []).map((item) => item.customer_id).filter(Boolean));
  const missingCustomers = (customers || [])
    .filter((customer) => customer?.id && !existingCustomerIds.has(customer.id));

  if (missingCustomers.length === 0) return applications || [];

  const records = missingCustomers.map((customer) => ({
    customer_id: customer.id,
    national_id: customer.national_id || '',
    agent_name: customer.agent_name || null,
    agent_id: customer.agent_id || null,
    product_id: null,
    status: backOfficeStatusForCustomer(customer),
    review_reason: customer.screening_reason || null,
    created_at: customer.created_at || new Date().toISOString(),
    verification: {}
  }));

  const inserted = await getSupabase()
    .from('customer_applications')
    .insert(records)
    .select('*, customers(*)');

  if (inserted.error) throw inserted.error;
  return [...(applications || []), ...(inserted.data || [])];
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    const user = await requirePortalUser(req, ['admin', 'finance']);
    const adminProfile = await getActiveAdminProfile(user);
    const today = new Date().toISOString().slice(0, 10);
    const inventorySelect =
      '*, image_url, inventory_phone_profiles(*)';
    const fallbackInventorySelect =
      '*, inventory_phone_profiles(*)';

    await ensureMissingSaleCommissions().catch(() => null);

    const [agents, customers, payments, commissions, reconciliation, applications, audits, financeAuthUsers, financeNotifications, agentNotifications] = await Promise.all([
      getSupabase().from('agents').select('*').order('created_at', { ascending: false }).limit(200),
      getSupabase().from('customers').select('*').order('created_at', { ascending: false }).limit(5000),
      getSupabase().from('payments').select('*').order('date', { ascending: false }).limit(5000),
      getSupabase().from('commissions').select('*').order('earned_at', { ascending: false }).limit(5000),
      getSupabase().from('reconciliation').select('*').order('date', { ascending: false }).limit(5000),
      getSupabase().from('customer_applications').select('*, customers(*)').order('created_at', { ascending: false }).limit(100),
      getSupabase()
        .from('admin_audit_logs')
        .select('*')
        .eq('actor_email', user.email)
        .order('created_at', { ascending: false })
        .limit(100),
      getSupabase().auth.admin.listUsers({ page: 1, perPage: 200 }),
      getSupabase().from('finance_notifications').select('*').order('created_at', { ascending: false }).limit(100),
      getSupabase().from('agent_notifications').select('*').order('created_at', { ascending: false }).limit(100)
    ]);

    let products = await getSupabase()
      .from('inventory_products')
      .select(inventorySelect)
      .order('created_at', { ascending: false })
      .limit(200);

    if (products.error) {
      const message = String(products.error.message || '').toLowerCase();
      if (message.includes('image_url') || message.includes('lock_reason') || message.includes('last_sync_at')) {
        products = await getSupabase()
          .from('inventory_products')
          .select(fallbackInventorySelect)
          .order('created_at', { ascending: false })
          .limit(200);
      }
    }

    [agents, customers, products, payments, commissions, reconciliation, applications, audits, financeAuthUsers, financeNotifications, agentNotifications].forEach(({ error }) => {
      if (error) throw error;
    });
    if (financeAuthUsers.error) throw financeAuthUsers.error;

    const customerRows = customers.data || [];
    const customerById = new Map(customerRows.map((item) => [item.id, item]));
    const paymentRows = dedupeFinancialPayments(payments.data || []);
    const paymentsByCustomer = paymentRows.reduce((groups, payment) => {
      if (!payment.customer_id) return groups;
      if (!groups.has(payment.customer_id)) groups.set(payment.customer_id, []);
      groups.get(payment.customer_id).push(payment);
      return groups;
    }, new Map());
    const arrearsByCustomer = new Map(customerRows.map((customer) => [
      customer.id,
      computeCustomerArrears({
        customer,
        payments: paymentsByCustomer.get(customer.id) || [],
        now: new Date()
      })
    ]));
    const paymentById = new Map((payments.data || []).map((item) => [item.id, item]));
    const commissionRows = commissions.data || [];
    const smsDeliveryReports = await listSmsDeliveryReports({ limit: 100 });
    const smsDeliverySummary = summarizeSmsDeliveryReports(smsDeliveryReports);
    const normalizedApplicationRows = await ensureCustomerApplicationRows({
      customers: customerRows,
      applications: applications.data || []
    });
    const applicationRows = await Promise.all(normalizedApplicationRows.map(async (item) => {
      const assignedProduct = (products.data || []).find((product) => product.assigned_customer_id === item.customer_id);
      return {
        id: item.id,
        customerId: item.customer_id,
        customerName: item.customers?.customer_name || '',
        phone: item.customers?.customer_phone || '',
        nationalId: item.national_id || item.customers?.national_id || '',
        agentName: item.agent_name || '',
        agentId: item.agent_id || '',
        bikeId: item.product_id || assignedProduct?.id || '',
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
        documents: [],
        verification: item.verification || {},
        status: item.status || 'pending_screening',
        reason: item.review_reason || '',
        reviewedAt: item.reviewed_at || '',
        reviewedBy: item.reviewed_by || '',
        submittedAt: item.created_at || '',
        createdAt: formatDate(item.created_at)
      };
    }));

    sendJson(res, 200, {
      portal: {
        admin: {
          id: user.id,
          email: user.email,
          fullName: adminProfile?.full_name || user.user_metadata?.full_name || user.email,
          role: adminProfile?.role || 'admin'
        },
        summary: {
          agents: (agents.data || []).length,
          customers: customerRows.length,
          pendingApplications: normalizedApplicationRows.filter((item) => item.status === 'pending_screening').length,
          activeProducts: (products.data || []).filter((item) => item.status !== 'sold').length,
          totalCollected: customerRows
            .filter(countsForOutstanding)
            .reduce((total, item) => total + collectedAmountForCustomer(item), 0),
          totalBalance: customerRows
            .filter(countsForOutstanding)
            .reduce((total, item) => total + Number(item.balance || 0), 0),
          todayCollections: paymentRows
            .filter((item) => isSuccessfulFinancialPayment(item) && String(item.date || '').startsWith(today))
            .reduce((total, item) => total + financialPaymentAmount(item), 0),
          pendingCommissions: commissionRows.filter((item) => String(item.status || '').toLowerCase() !== 'paid').reduce((total, item) => total + Number(item.amount || 0), 0),
          smsAccepted: smsDeliverySummary.provider_accepted + smsDeliverySummary.sent + smsDeliverySummary.submitted + smsDeliverySummary.queued,
          smsDelivered: smsDeliverySummary.delivered,
          smsFailed: smsDeliverySummary.failed + smsDeliverySummary.rejected + smsDeliverySummary.expired + smsDeliverySummary.blacklisted + smsDeliverySummary.invalid_phone_number
        },
        agents: (agents.data || []).map((item) => ({
          id: item.id,
          agentCode: item.agent_code || '',
          name: item.full_name || item.agent_name || '',
          nationalId: item.national_id || '',
          email: item.email || '',
          phone: item.phone || '',
          region: item.region || '',
          role: 'field_agent',
          status: item.status || 'active',
          totalCustomers: customerRows.filter((customer) => customer.agent_id === item.agent_code).length,
          commissionBalance: commissionRows
            .filter((commission) => commission.agent_code === item.agent_code && commission.status !== 'paid')
            .reduce((total, commission) => total + Number(commission.amount || 0), 0)
        })),
        customers: customerRows.map((item) => ({
          id: item.id,
          name: item.customer_name || '',
          nationalId: item.national_id || '',
          phone: item.customer_phone || '',
          email: item.email || '',
          dateOfBirth: item.date_of_birth || '',
          gender: item.gender || '',
          location: item.location || '',
          occupation: item.occupation || '',
          agentId: item.agent_id || '',
          agentName: item.agent_name || '',
          nextOfKin: {
            name: item.next_of_kin_name || '',
            phone: item.next_of_kin_phone || '',
            relationship: item.next_of_kin_relationship || '',
            nationalId: item.next_of_kin_national_id || '',
            gender: item.next_of_kin_gender || '',
            location: item.next_of_kin_location || '',
            occupation: item.next_of_kin_occupation || ''
          },
          productType: item.product_type || 'product',
          productModel: item.product_model || item.bike_model || '',
          balance: countsForOutstanding(item) ? Number(item.balance || 0) : 0,
          totalPayable: Number(item.total_payable || 0),
          paidAmount: Number(item.paid_amount || 0),
          dailyInstallment: Number(item.daily_installment || 0),
          dueDate: item.due_date || '',
          unlockUntil: item.unlock_until || '',
          overdueDays: arrearsByCustomer.get(item.id)?.overdueDays ?? Number(item.overdue_days || 0),
          overdueAmount: arrearsByCustomer.get(item.id)?.overdueAmount ?? 0,
          applicationStatus: item.application_status || item.status || 'active',
          repaymentStatus: item.status || 'active',
          status: item.status || 'active',
          nextOfKinOtpStatus: item.next_of_kin_otp_status || '',
          paygoScheduleStatus: item.paygo_schedule_status || '',
          createdAt: item.created_at || ''
        })),
        products: await Promise.all((products.data || []).map(async (item) => {
          const productType = item.product_type || 'product';
          const isPhone = productType === 'phone';
          const phoneProfile = Array.isArray(item.inventory_phone_profiles)
            ? item.inventory_phone_profiles[0] || {}
            : item.inventory_phone_profiles || {};

          return {
            id: item.id,
            productType,
            productModel: item.product_model || '',
            imageUrl: isPhone ? '' : (item.image_url || ''),
            serialNumber: isPhone ? (phoneProfile.imei_1 || item.imei_1 || '') : (item.serial_number || ''),
            chassisNumber: isPhone ? (phoneProfile.imei_2 || item.imei_2 || '') : (item.chassis_number || ''),
            imei1: isPhone ? (item.imei_1 || phoneProfile.imei_1 || '') : '',
            imei2: isPhone ? (item.imei_2 || phoneProfile.imei_2 || '') : '',
            lockerId: isPhone ? (item.locker_id || phoneProfile.locker_id || item.imei_1 || '') : '',
            lockerProvider: isPhone ? resolveRouteLockerProvider(item, phoneProfile) : '',
            providerState: isPhone ? (phoneProfile.provider_state || item.provider_state || phoneProfile.honor_device_state || item.honor_device_state || '') : '',
            providerLockStatus: isPhone ? (phoneProfile.provider_lock_status || item.provider_lock_status || phoneProfile.final_device_state || item.final_device_state || phoneProfile.lock_status || item.lock_status || phoneProfile.honor_lock_status || item.honor_lock_status || phoneProfile.locker_sync_status || item.locker_sync_status || '') : '',
            finalDeviceState: isPhone ? (phoneProfile.final_device_state || item.final_device_state || phoneProfile.provider_lock_status || item.provider_lock_status || phoneProfile.lock_status || item.lock_status || '') : '',
            providerTaskId: isPhone ? (phoneProfile.provider_task_id || item.provider_task_id || phoneProfile.honor_task_id || item.honor_task_id || '') : '',
            providerRequestId: isPhone ? (phoneProfile.provider_request_id || item.provider_request_id || '') : '',
            providerResponse: isPhone ? (phoneProfile.provider_response || item.provider_response || null) : null,
            providerErrorCode: isPhone ? (phoneProfile.provider_error_code || item.provider_error_code || '') : '',
            providerErrorMessage: isPhone ? (phoneProfile.provider_error_message || item.provider_error_message || '') : '',
            syncStatus: isPhone ? (phoneProfile.sync_status || item.sync_status || phoneProfile.locker_sync_status || item.locker_sync_status || '') : '',
            commandStatus: isPhone ? (phoneProfile.command_status || item.command_status || '') : '',
            lastProviderSyncAt: isPhone ? (phoneProfile.last_provider_sync_at || item.last_provider_sync_at || phoneProfile.locker_last_synced_at || item.locker_last_synced_at || '') : '',
            lastCommandAt: isPhone ? (phoneProfile.last_command_at || item.last_command_at || phoneProfile.locker_last_request_at || phoneProfile.last_lock_request_at || item.locker_last_request_at || item.last_lock_request_at || '') : '',
            lastVerifiedAt: isPhone ? (phoneProfile.last_verified_at || item.last_verified_at || '') : '',
            unlockUntilAt: isPhone ? (phoneProfile.unlock_until_at || item.unlock_until_at || '') : '',
            honorTaskId: isPhone ? (phoneProfile.honor_task_id || item.honor_task_id || '') : '',
            lockStatus: isPhone ? (phoneProfile.provider_lock_status || item.provider_lock_status || phoneProfile.final_device_state || item.final_device_state || phoneProfile.lock_status || item.lock_status || phoneProfile.honor_lock_status || item.honor_lock_status || phoneProfile.locker_sync_status || item.locker_sync_status || '') : '',
            honorLockStatus: isPhone ? (phoneProfile.provider_lock_status || item.provider_lock_status || phoneProfile.honor_lock_status || item.honor_lock_status || phoneProfile.locker_sync_status || item.locker_sync_status || '') : '',
            honorLastResponse: isPhone ? (phoneProfile.honor_last_response || item.honor_last_response || phoneProfile.provider_response || item.provider_response || null) : null,
            lockerSyncStatus: isPhone ? (phoneProfile.locker_sync_status || item.locker_sync_status || phoneProfile.sync_status || item.sync_status || '') : '',
            lockerLastSyncedAt: isPhone ? (phoneProfile.locker_last_synced_at || item.locker_last_synced_at || '') : '',
            lockerLastError: isPhone ? (phoneProfile.locker_last_error || item.locker_last_error || phoneProfile.provider_error_message || item.provider_error_message || '') : '',
            lockerLastRequestAt: isPhone ? (phoneProfile.locker_last_request_at || phoneProfile.last_lock_request_at || item.locker_last_request_at || item.last_lock_request_at || phoneProfile.last_command_at || item.last_command_at || '') : '',
            lastLockRequestAt: isPhone ? (phoneProfile.last_lock_request_at || phoneProfile.locker_last_request_at || item.last_lock_request_at || item.locker_last_request_at || phoneProfile.last_command_at || item.last_command_at || '') : '',
            lockReason: isPhone ? (phoneProfile.lock_reason || item.lock_reason || '') : '',
            lockedAt: isPhone ? (phoneProfile.locked_at || item.locked_at || '') : '',
            unlockedAt: isPhone ? (phoneProfile.unlocked_at || item.unlocked_at || '') : '',
            lastSyncAt: isPhone ? (phoneProfile.last_sync_at || item.last_sync_at || '') : '',
            lockerAppId: isPhone ? (phoneProfile.locker_app_id || item.locker_app_id || '') : '',
            lockerSyncPayload: isPhone ? (phoneProfile.locker_sync_payload || item.locker_sync_payload || {}) : {},
            branch: item.branch || '',
            status: item.status || 'available',
            assignedCustomerId: item.assigned_customer_id || null,
            assignedAgentId: item.assigned_agent_id || null,
            assignedAgentCode: item.assigned_agent_code || null,
            createdAt: item.created_at || ''
          };
        })),
        payments: paymentRows.map((item) => ({
          id: item.id,
          customerId: item.customer_id || '',
          agentId: item.agent_id || '',
          customerName: item.customer_name || '',
          amount: financialPaymentAmount(item),
          depositCredit: Number(item.deposit_credit || 0),
          paygoPayment: Number(item.paygo_payment || 0),
          receipt: item.receipt || '',
          providerReference: item.provider_reference || '',
          providerTransactionId: item.provider_transaction_id || '',
          method: item.method || '',
          status: item.status || '',
          reconciliationStatus: item.reconciliation_status || 'matched',
          productType: item.product_type || 'bike',
          productModel: item.product_model || item.bike_model || '',
          chassisNumber: item.chassis_number || '',
          dailyTarget: Number(customerById.get(item.customer_id)?.daily_installment ?? item.daily_target ?? item.daily_installment ?? 0),
          overdueDays: arrearsByCustomer.get(item.customer_id)?.overdueDays ?? Number(customerById.get(item.customer_id)?.overdue_days ?? item.overdue_days ?? 0),
          overdueAmount: arrearsByCustomer.get(item.customer_id)?.overdueAmount ?? 0,
          paygoState: customerById.get(item.customer_id)?.paygo_schedule_status || customerById.get(item.customer_id)?.status || item.paygo_state || '',
          repaymentStatus: customerById.get(item.customer_id)?.status || item.repayment_status || '',
          balance: Number(customerById.get(item.customer_id)?.balance ?? item.balance ?? 0),
          totalPayable: Number(customerById.get(item.customer_id)?.total_payable ?? item.total_payable ?? 0),
          paidAmount: financialPaymentAmount(item),
          customerPaidAmount: Number(customerById.get(item.customer_id)?.paid_amount ?? 0),
          paidAt: item.paid_at || item.date || '',
          date: formatDate(item.date),
          dateIso: item.date || '',
          sourcePortal: item.source_portal || 'finance',
          createdAt: item.created_at || ''
        })),
        commissions: commissionRows.map((item) => {
          const payment = paymentById.get(item.payment_id) || {};
          const customer = customerById.get(payment.customer_id) || {};
          const classified = {
            ...customer,
            ...payment,
            ...item,
            product_model: item.product_model || payment.product_model || payment.bike_model || customer.product_model || customer.bike_model || '',
            serial_number: item.serial_number || payment.serial_number || customer.serial_number || '',
            chassis_number: item.chassis_number || payment.chassis_number || customer.chassis_number || ''
          };

          return {
            id: item.id,
            paymentId: item.payment_id || '',
            agentName: item.agent_name || '',
            agentCode: item.agent_code || '',
            agentPhone: item.agent_phone || '',
            customerName: item.customer_name || '',
            productType: inferCommissionProductType(classified),
            productModel: classified.product_model,
            serialNumber: classified.serial_number,
            chassisNumber: classified.chassis_number,
            type: item.type || '',
            amount: Number(item.amount || 0),
            status: item.status || '',
            earnedAt: item.earned_at || '',
            paidAt: item.paid_at || ''
          };
        }),
        reconciliation: (reconciliation.data || []).map((item) => ({
          id: item.id,
          paymentId: item.payment_id || '',
          receipt: item.receipt || '',
          customerName: item.customer_name || '',
          nationalId: item.national_id || '',
          providerAmount: Number(item.provider_amount || 0),
          systemAmount: item.system_amount !== null && item.system_amount !== undefined ? Number(item.system_amount) : null,
          date: item.date || '',
          status: item.status || 'unmatched',
          sourcePortal: item.source_portal || 'finance',
          createdAt: item.created_at || '',
          updatedAt: item.updated_at || ''
        })),
        financeUsers: (financeAuthUsers.data?.users || [])
          .filter((item) => ['admin', 'super_admin', 'back_office_officer', 'finance', 'agent', 'customer'].includes(item.app_metadata?.role || item.user_metadata?.role))
          .map((item) => ({
            id: item.id,
            email: item.email || '',
            name: item.user_metadata?.full_name || item.email || '',
            phone: item.user_metadata?.phone || '',
            role: item.app_metadata?.display_role || item.user_metadata?.display_role || item.app_metadata?.role || item.user_metadata?.role || 'finance_officer',
            status: item.app_metadata?.status || item.user_metadata?.status || 'pending',
            createdAt: formatDate(item.created_at)
          })),
        applications: applicationRows,
        notifications: [
          ...(financeNotifications.data || []).map((item) => ({
            id: item.id,
            title: item.title || item.type || 'Finance notification',
            message: item.message || '',
            channel: item.channel || 'in_app',
            status: item.status === 'read' ? 'read' : 'unread',
            createdAt: item.created_at || '',
            priority: item.severity || 'normal'
          })),
          ...(agentNotifications.data || []).map((item) => ({
            id: item.id,
            title: item.customer_name ? `Agent follow-up: ${item.customer_name}` : 'Agent notification',
            message: item.message || '',
            channel: 'sms',
            status: item.status === 'read' ? 'read' : 'unread',
            createdAt: item.created_at || '',
            priority: 'normal'
          }))
        ],
        audits: (audits.data || []).map((item) => ({
          id: item.id,
          actorEmail: item.actor_email || '',
          action: item.action || '',
          targetTable: item.target_table || '',
          targetId: item.target_id || '',
          createdAt: item.created_at || ''
        })),
        smsDeliveryReports
      }
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
