import { supabaseBrowser } from '../services/supabaseBrowser.js';

const fail = (result) => { if (result.error) throw result.error; return result.data || []; };
const time = (value) => value ? new Date(value).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
const day = (value) => value ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'New';

export async function loadLiveWorkspace(user) {
  const tenantId = user.tenant_id;
  if (!tenantId) throw new Error('This account has no business workspace assigned.');
  const isWasher = user.role === 'Washer';
  const canSeeMoney = ['Business Admin', 'Receptionist'].includes(user.role);
  let tenantSettingsReady = true;
  let tenantRes = await supabaseBrowser.from('carwash_tenants').select('id,name,owner_name,status,settings').eq('id', tenantId).single();
  if (tenantRes.error && /settings/i.test(tenantRes.error.message || '')
    && (['42703', 'PGRST204'].includes(tenantRes.error.code) || /does not exist|schema cache/i.test(tenantRes.error.message || ''))) {
    tenantSettingsReady = false;
    tenantRes = await supabaseBrowser.from('carwash_tenants').select('id,name,owner_name,status').eq('id', tenantId).single();
  }
  const [staffRes, serviceRes, customerRes, vehicleRes, orderRes, orderServiceRes, paymentRes, commissionRes, loyaltyRes, auditRes] = await Promise.all([
    supabaseBrowser.from('carwash_memberships').select('id,role,full_name,phone,branch,status,user_id').eq('tenant_id', tenantId),
    supabaseBrowser.from('carwash_services').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supabaseBrowser.from('carwash_customers').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supabaseBrowser.from('carwash_vehicles').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    supabaseBrowser.from('carwash_orders').select('*').eq('tenant_id', tenantId).order('checked_in_at', { ascending: false }),
    supabaseBrowser.from('carwash_order_services').select('*').eq('tenant_id', tenantId),
    canSeeMoney ? supabaseBrowser.from('carwash_payments').select('*').eq('tenant_id', tenantId).order('recorded_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    supabaseBrowser.from('carwash_commission_ledger').select('*').eq('tenant_id', tenantId).order('recorded_at', { ascending: false }),
    canSeeMoney ? supabaseBrowser.from('carwash_loyalty_accounts').select('*').eq('tenant_id', tenantId) : Promise.resolve({ data: [], error: null }),
    user.role === 'Business Admin' ? supabaseBrowser.from('carwash_audit_logs').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [tenantRes, staffRes, serviceRes, customerRes, vehicleRes, orderRes, orderServiceRes, paymentRes, commissionRes, loyaltyRes, auditRes]) fail(result);
  const tenant = tenantRes.data;
  const staff = staffRes.data.map((row) => ({ id: row.id, name: row.full_name, email: row.user_id === user.authUserId ? user.email : '', role: ({ BUSINESS_ADMIN: 'Business Admin', RECEPTIONIST: 'Receptionist', WASHER: 'Washer' })[row.role] || row.role, branch: row.branch || 'Main branch', status: row.status === 'ACTIVE' ? 'Active' : 'Inactive', tenant_id: tenantId }));
  const services = serviceRes.data.map((row) => ({ id: row.id, name: row.name, category: row.category || 'Wash service', price: Number(row.price_kes), commission: Number(row.commission_kes), duration: row.estimated_minutes, active: row.active, tenant_id: tenantId }));
  const customers = customerRes.data.map((row) => ({ id: row.id, name: row.full_name, phone: row.phone, email: row.email || '', points: 0, visits: 0, lastVisit: 'New', tenant_id: tenantId }));
  const vehicles = vehicleRes.data.map((row) => ({ id: row.id, customerId: row.customer_id, registration: row.registration, make: row.make, model: row.model, color: row.color || '', tenant_id: tenantId }));
  const orderServices = orderServiceRes.data;
  const jobs = orderRes.data.map((row) => {
    const lines = orderServices.filter((line) => line.order_id === row.id);
    const paid = paymentRes.data.filter((payment) => payment.order_id === row.id && payment.status === 'PAID').reduce((sum, payment) => sum + Number(payment.amount_kes), 0);
    const paymentStatus = paid >= Number(row.subtotal_kes) ? 'PAID' : paid ? 'PARTIAL' : row.payment_status;
    const job = { id: row.id, tenant_id: tenantId, customerId: row.customer_id, vehicleId: row.vehicle_id, washerId: row.washer_membership_id, serviceIds: lines.map((line) => line.service_id), serviceNames: lines.map((line) => line.service_name_snapshot), total: Number(row.subtotal_kes), paidAmount: paid, commission: lines.reduce((sum, line) => sum + Number(line.commission_kes_snapshot), 0), status: row.status, paymentStatus, paymentMethod: '', createdAt: time(row.checked_in_at) };
    for (const customer of customers) if (customer.id === job.customerId) { customer.visits++; customer.lastVisit = day(row.checked_in_at); }
    return job;
  });
  const payments = paymentRes.data.map((row) => ({ id: row.id, tenant_id: tenantId, jobId: row.order_id, amount: Number(row.amount_kes), method: row.method, status: row.status, reference: row.external_reference || '', time: time(row.recorded_at) }));
  const commissions = commissionRes.data.map((row) => ({ id: row.id, tenant_id: tenantId, jobId: row.order_id, workerId: row.worker_membership_id, amount: Number(row.amount_kes), status: row.status, date: day(row.recorded_at) }));
  for (const row of loyaltyRes.data) { const customer = customers.find((entry) => entry.id === row.customer_id); if (customer) customer.points = Number(row.balance_points); }
  const audit = auditRes.data.map((row) => ({ id: row.id, tenant_id: tenantId, action: row.action.replaceAll('_', ' ').toLowerCase(), detail: row.details?.order_id || row.entity_id || '', time: time(row.created_at) }));
  const settings = tenant.settings || {};
  return { tenant, db: { activeTenantId: tenantId, tenants: [{ id: tenantId, name: tenant.name, owner: tenant.owner_name, plan: user.planName || 'Business', status: tenant.status, branches: 1 }], staff, services, customers, vehicles, jobs, payments, commissions, loyalty: [], audit, settingsSchemaReady: tenantSettingsReady, settings: { businessName: tenant.name, branch: settings.branch || user.branch || 'Main branch', currency: 'KES', loyaltyRate: Number(settings.loyaltyRate ?? 1) } } };
}

export function dbMethod(method = 'CASH') {
  return ({ CASH: 'CASH', CARD: 'CARD', 'M-PESA': 'M-PESA', 'M-Pesa': 'M-PESA', WALLET: 'WALLET', LOYALTY: 'LOYALTY' })[method] || 'CASH';
}
