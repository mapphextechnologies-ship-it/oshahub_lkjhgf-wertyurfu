import { supabaseBrowser } from '../services/supabaseBrowser.js';
import { getTrialRequestState } from './trialRequestState.js';

const fail = (result) => { if (result.error) throw result.error; return result.data || []; };
const time = (value) => value ? new Date(value).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
const day = (value) => value ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'New';

export async function loadLiveWorkspace(user) {
  const tenantId = user.tenant_id;
  if (!tenantId) throw new Error('This account has no business workspace assigned.');
  const isWasher = user.role === 'Washer';
  const canSeeMoney = ['Business Admin', 'Receptionist'].includes(user.role);
  let tenantSettingsReady = true;
  let tenantRes = await supabaseBrowser.from('carwash_tenants').select('id,name,owner_name,status,settings,trial_extension_used_at').eq('id', tenantId).single();
  if (tenantRes.error && /settings|trial_extension_used_at/i.test(tenantRes.error.message || '')
    && (['42703', 'PGRST204'].includes(tenantRes.error.code) || /does not exist|schema cache/i.test(tenantRes.error.message || ''))) {
    const settingsColumnMissing = /settings/i.test(tenantRes.error.message || '');
    tenantSettingsReady = !settingsColumnMissing;
    const columns = settingsColumnMissing ? 'id,name,owner_name,status' : 'id,name,owner_name,status,settings';
    tenantRes = await supabaseBrowser.from('carwash_tenants').select(columns).eq('id', tenantId).single();
  }
  const [staffRes, serviceRes, customerRes, vehicleRes, orderRes, orderServiceRes, paymentRes, commissionRes, loyaltyRes, auditRes, plansRes, subscriptionsRes, subscriptionPaymentsRes, billingRequestsRes] = await Promise.all([
    supabaseBrowser.from('carwash_memberships').select('id,role,full_name,phone,branch,status,user_id').eq('tenant_id', tenantId),
    isWasher ? Promise.resolve({ data: [], error: null }) : supabaseBrowser.from('carwash_services').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supabaseBrowser.from('carwash_customers').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supabaseBrowser.from('carwash_vehicles').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    (isWasher ? supabaseBrowser.from('carwash_orders').select('id,tenant_id,customer_id,vehicle_id,washer_membership_id,status,payment_status,checked_in_at,scheduled_at') : supabaseBrowser.from('carwash_orders').select('*')).eq('tenant_id', tenantId).order('checked_in_at', { ascending: false }),
    (isWasher ? supabaseBrowser.from('carwash_order_services').select('tenant_id,order_id,service_id,service_name_snapshot') : supabaseBrowser.from('carwash_order_services').select('*')).eq('tenant_id', tenantId),
    canSeeMoney ? supabaseBrowser.from('carwash_payments').select('*').eq('tenant_id', tenantId).order('recorded_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    user.role === 'Business Admin' ? supabaseBrowser.from('carwash_commission_ledger').select('*').eq('tenant_id', tenantId).order('recorded_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    canSeeMoney ? supabaseBrowser.from('carwash_loyalty_accounts').select('*').eq('tenant_id', tenantId) : Promise.resolve({ data: [], error: null }),
    user.role === 'Business Admin' ? supabaseBrowser.from('carwash_audit_logs').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [], error: null }),
    canSeeMoney ? supabaseBrowser.from('carwash_plans').select('id,name,price_kes,duration_days,feature_flags').eq('active', true).is('deleted_at', null).order('price_kes') : Promise.resolve({ data: [], error: null }),
    user.role === 'Business Admin' ? supabaseBrowser.from('carwash_subscriptions').select('*').eq('tenant_id', tenantId).order('starts_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    user.role === 'Business Admin' ? supabaseBrowser.from('carwash_subscription_payments').select('*').eq('tenant_id', tenantId).order('paid_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    user.role === 'Business Admin' ? supabaseBrowser.from('carwash_billing_requests').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [tenantRes, staffRes, serviceRes, customerRes, vehicleRes, orderRes, orderServiceRes, paymentRes, commissionRes, loyaltyRes, auditRes, plansRes, subscriptionsRes, subscriptionPaymentsRes]) fail(result);
  const tenant = tenantRes.data;
  const staff = staffRes.data.map((row) => ({ id: row.id, name: row.full_name, email: row.user_id === user.authUserId ? user.email : '', role: ({ BUSINESS_ADMIN: 'Business Admin', RECEPTIONIST: 'Receptionist', WASHER: 'Washer' })[row.role] || row.role, branch: row.branch || 'Main branch', status: row.status === 'ACTIVE' ? 'Active' : row.status === 'PENDING' ? 'Pending approval' : 'Inactive', tenant_id: tenantId }));
  const services = serviceRes.data.map((row) => ({ id: row.id, name: row.name, category: row.category || 'Wash service', price: Number(row.price_kes), commission: Number(row.commission_kes), duration: row.estimated_minutes, active: row.active, tenant_id: tenantId }));
  const customers = customerRes.data.map((row) => ({ id: row.id, name: row.full_name, phone: row.phone, email: row.email || '', points: 0, visits: 0, lastVisit: 'New', tenant_id: tenantId }));
  const vehicles = vehicleRes.data.map((row) => ({ id: row.id, customerId: row.customer_id, registration: row.registration, make: row.make, model: row.model, color: row.color || '', tenant_id: tenantId }));
  const orderServices = orderServiceRes.data;
  const orderServicesByOrder = new Map();
  for (const line of orderServices) {
    const lines = orderServicesByOrder.get(line.order_id) || [];
    lines.push(line);
    orderServicesByOrder.set(line.order_id, lines);
  }
  const paidByOrder = new Map();
  for (const payment of paymentRes.data) {
    if (payment.status === 'PAID') paidByOrder.set(payment.order_id, (paidByOrder.get(payment.order_id) || 0) + Number(payment.amount_kes));
  }
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const jobs = orderRes.data.map((row) => {
    const lines = orderServicesByOrder.get(row.id) || [];
    const paid = paidByOrder.get(row.id) || 0;
    const paymentStatus = paid >= Number(row.subtotal_kes) ? 'PAID' : paid ? 'PARTIAL' : row.payment_status;
    const job = { id: row.id, tenant_id: tenantId, customerId: row.customer_id, vehicleId: row.vehicle_id, washerId: row.washer_membership_id, serviceIds: lines.map((line) => line.service_id), serviceNames: lines.map((line) => line.service_name_snapshot), total: isWasher ? 0 : Number(row.subtotal_kes), paidAmount: paid, commission: isWasher ? 0 : lines.reduce((sum, line) => sum + Number(line.commission_kes_snapshot||0), 0), status: row.status, paymentStatus, paymentMethod: '', scheduledAt: row.scheduled_at||null, checkedInAt: row.checked_in_at, createdAt: time(row.checked_in_at) };
    const customer = customerById.get(job.customerId);
    if (customer) { customer.visits++; customer.lastVisit = day(row.checked_in_at); }
    return job;
  });
  const payments = paymentRes.data.map((row) => ({ id: row.id, tenant_id: tenantId, jobId: row.order_id, amount: Number(row.amount_kes), method: row.method, status: row.status, reference: row.external_reference || '', time: time(row.recorded_at), recordedAt: row.recorded_at }));
  const commissions = commissionRes.data.map((row) => ({ id: row.id, tenant_id: tenantId, jobId: row.order_id, workerId: row.worker_membership_id, amount: Number(row.amount_kes), status: row.status, recordedAt: row.recorded_at, date: day(row.recorded_at) }));
  for (const row of loyaltyRes.data) { const customer = customers.find((entry) => entry.id === row.customer_id); if (customer) customer.points = Number(row.balance_points); }
  const audit = auditRes.data.map((row) => ({ id: row.id, tenant_id: tenantId, action: row.action.replaceAll('_', ' ').toLowerCase(), detail: row.details?.order_id || row.entity_id || '', time: time(row.created_at) }));
  const settings = tenant.settings || {};
  const plans = plansRes.data.map((row) => ({ id: row.id, name: row.name, tier: row.feature_flags?.tier || row.name.split(' · ')[0], term: row.feature_flags?.term || (row.duration_days >= 360 ? 'Yearly' : `${Math.round(row.duration_days / 30)} months`), months: Number(row.feature_flags?.months || Math.max(1, Math.round(row.duration_days / 30))), branchLimit: Number(row.feature_flags?.branches ?? 1), price: Number(row.price_kes), days: row.duration_days, features: row.feature_flags?.description || 'Business workspace and team tools' }));
  const subscriptions = subscriptionsRes.data || [];
  const subscriptionPayments = subscriptionPaymentsRes.data || [];
  const currentSubscription = subscriptions[0] || null;
  const currentPlan = plansRes.data.find((row) => row.id === currentSubscription?.plan_id) || null;
  const billingRequests = billingRequestsRes.error ? [] : billingRequestsRes.data || [];
  const trialExtensionUsedAt = tenant.trial_extension_used_at || null;
  const trialRequestState = getTrialRequestState(currentSubscription, billingRequests, subscriptionPayments, Date.now(), Boolean(trialExtensionUsedAt));
  const pendingRequest = billingRequests.find((row) => row.status === 'PENDING') || null;
  const billing = { plans, subscriptions, payments: subscriptionPayments, currentSubscription, currentPlan, onboardingFee: 8500, onboardingFeeDue: subscriptionPayments.length === 0, requests: billingRequests, trialExtensionUsedAt, trialExtensionRequested: trialRequestState.trialRequestPending, ...trialRequestState, pendingRequest };
  return { tenant, db: { activeTenantId: tenantId, tenants: [{ id: tenantId, name: tenant.name, owner: tenant.owner_name, plan: currentPlan?.name || user.planName || 'Free trial', status: tenant.status, branches: currentSubscription?.branch_count || 1 }], staff, services, customers, vehicles, jobs, payments, commissions, loyalty: [], audit, billing, settingsSchemaReady: tenantSettingsReady, settings: { businessName: tenant.name, branch: settings.branch || user.branch || 'Main branch', currency: 'KES', loyaltyRate: Number(settings.loyaltyRate ?? 1) } } };
}

// Keep the team approval list lightweight: refresh only the tenant's memberships
// instead of reloading customer, billing, and wash-order data while an admin is
// reviewing new registrations.
export async function loadLiveStaff(user) {
  const tenantId = user?.tenant_id;
  if (!tenantId) throw new Error('This account has no business workspace assigned.');
  const { data, error } = await supabaseBrowser.from('carwash_memberships')
    .select('id,role,full_name,phone,branch,status,user_id')
    .eq('tenant_id', tenantId);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    name: row.full_name || 'Team member',
    email: row.user_id === user.authUserId ? user.email : '',
    role: ({ BUSINESS_ADMIN: 'Business Admin', RECEPTIONIST: 'Receptionist', WASHER: 'Washer' })[row.role] || row.role,
    branch: row.branch || 'Main branch',
    status: row.status === 'ACTIVE' ? 'Active' : row.status === 'PENDING' ? 'Pending approval' : 'Inactive',
    tenant_id: tenantId,
  })).sort((a, b) => Number(b.status === 'Pending approval') - Number(a.status === 'Pending approval'));
}

// Poll only the tenant and subscription rows for status changes made by platform admins.
export async function loadLiveBillingStatus(user) {
  const tenantId = user?.tenant_id;
  if (!tenantId) throw new Error('This account has no business workspace assigned.');
  let tenantRes = await supabaseBrowser.from('carwash_tenants').select('id,status,trial_extension_used_at').eq('id', tenantId).single();
  if (tenantRes.error && /trial_extension_used_at/i.test(tenantRes.error.message || '')
    && (['42703', 'PGRST204'].includes(tenantRes.error.code) || /does not exist|schema cache/i.test(tenantRes.error.message || ''))) {
    tenantRes = await supabaseBrowser.from('carwash_tenants').select('id,status').eq('id', tenantId).single();
  }
  const subscriptionsRes = await supabaseBrowser.from('carwash_subscriptions').select('*').eq('tenant_id', tenantId).order('starts_at', { ascending: false });
  if (tenantRes.error) throw tenantRes.error;
  if (subscriptionsRes.error) throw subscriptionsRes.error;
  return { tenant: tenantRes.data, subscriptions: subscriptionsRes.data || [] };
}

export function dbMethod(method = 'CASH') {
  return ({ CASH: 'CASH', CARD: 'CARD', 'M-PESA': 'M-PESA', 'M-Pesa': 'M-PESA', WALLET: 'WALLET', LOYALTY: 'LOYALTY' })[method] || 'CASH';
}
