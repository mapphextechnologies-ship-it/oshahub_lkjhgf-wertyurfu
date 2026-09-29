let runtimeSession = null;
const seenUsers = new Set();

const initialState = {
  tenants: [
    { id:'tenant-1', name:'Sparkle Auto Spa', owner:'Grace Wanjiku', plan:'Growth', status:'ACTIVE', endsAt:'2026-10-24', branches:2, createdAt:'2026-08-15' },
    { id:'tenant-2', name:'BlueWave Car Care', owner:'James Otieno', plan:'Starter', status:'TRIAL', endsAt:'2026-10-01', branches:1, createdAt:'2026-09-17' },
    { id:'tenant-3', name:'Nairobi Shine', owner:'Amina Hassan', plan:'Growth', status:'EXPIRING SOON', endsAt:'2026-09-29', branches:3, createdAt:'2026-07-10' }
  ],
  activeTenantId:'tenant-1',
  staff:[
    { id:'staff-1', name:'Kevin Otieno', email:'washer@carwash.demo', role:'Washer', branch:'Westlands', status:'Active', tenant_id:'tenant-1' },
    { id:'staff-2', name:'Juma Kamau', email:'juma@carwash.demo', role:'Washer', branch:'Westlands', status:'Active', tenant_id:'tenant-1' },
    { id:'staff-3', name:'Faith Njeri', email:'reception@carwash.demo', role:'Receptionist', branch:'Westlands', status:'Active', tenant_id:'tenant-1' },
    { id:'staff-4', name:'Peter Mwangi', email:'peter@carwash.demo', role:'Business Admin', branch:'Kilimani', status:'Active', tenant_id:'tenant-1' }
  ],
  services:[
    { id:'svc-basic', name:'Basic Wash', category:'Exterior', price:300, commission:50, duration:25, active:true, tenant_id:'tenant-1' },
    { id:'svc-premium', name:'Premium Wash', category:'Full service', price:500, commission:100, duration:40, active:true, tenant_id:'tenant-1' },
    { id:'svc-detail', name:'Full Detail', category:'Detailing', price:1500, commission:300, duration:120, active:true, tenant_id:'tenant-1' },
    { id:'svc-interior', name:'Interior Cleaning', category:'Interior', price:700, commission:140, duration:50, active:true, tenant_id:'tenant-1' }
  ],
  customers:[
    { id:'cust-1', name:'Mary Njeri', phone:'0711 220 330', email:'mary@example.com', points:320, visits:8, lastVisit:'Today', tenant_id:'tenant-1' },
    { id:'cust-2', name:'Peter Mwangi', phone:'0724 880 116', email:'peter@example.com', points:145, visits:4, lastVisit:'Today', tenant_id:'tenant-1' },
    { id:'cust-3', name:'Amina Hassan', phone:'0705 331 992', email:'amina@example.com', points:510, visits:12, lastVisit:'Yesterday', tenant_id:'tenant-1' },
    { id:'cust-4', name:'James Kariuki', phone:'0722 445 210', email:'', points:82, visits:2, lastVisit:'18 Sep 2026', tenant_id:'tenant-1' }
  ],
  vehicles:[
    { id:'veh-1', customerId:'cust-1', registration:'KDA 123A', make:'Toyota', model:'Axio', color:'Silver', tenant_id:'tenant-1' },
    { id:'veh-2', customerId:'cust-2', registration:'KCB 902Q', make:'Mazda', model:'CX-5', color:'Blue', tenant_id:'tenant-1' },
    { id:'veh-3', customerId:'cust-3', registration:'KDD 551M', make:'Nissan', model:'Note', color:'White', tenant_id:'tenant-1' },
    { id:'veh-4', customerId:'cust-4', registration:'KCU 448D', make:'Honda', model:'Fit', color:'Red', tenant_id:'tenant-1' }
  ],
  jobs:[
    { id:'CW-2084', customerId:'cust-1', vehicleId:'veh-1', serviceIds:['svc-basic','svc-interior'], washerId:'staff-1', status:'IN PROGRESS', total:1000, paymentStatus:'PAID', paymentMethod:'M-Pesa', commission:190, createdAt:'10:24', tenant_id:'tenant-1' },
    { id:'CW-2085', customerId:'cust-2', vehicleId:'veh-2', serviceIds:['svc-premium'], washerId:'staff-2', status:'READY', total:500, paymentStatus:'PAID', paymentMethod:'Cash', commission:100, createdAt:'10:42', tenant_id:'tenant-1' },
    { id:'CW-2086', customerId:'cust-3', vehicleId:'veh-3', serviceIds:['svc-detail'], washerId:'staff-1', status:'ASSIGNED', total:1500, paymentStatus:'UNPAID', paymentMethod:'M-Pesa', commission:300, createdAt:'11:06', tenant_id:'tenant-1' },
    { id:'CW-2087', customerId:'cust-4', vehicleId:'veh-4', serviceIds:['svc-basic'], washerId:'staff-2', status:'WAITING', total:300, paymentStatus:'PAID', paymentMethod:'Card', commission:50, createdAt:'11:19', tenant_id:'tenant-1' },
    { id:'CW-2081', customerId:'cust-2', vehicleId:'veh-2', serviceIds:['svc-premium'], washerId:'staff-1', status:'CLOSED', total:500, paymentStatus:'PAID', paymentMethod:'Cash', commission:100, createdAt:'09:12', tenant_id:'tenant-1' }
  ],
  payments:[
    { id:'pay-1', jobId:'CW-2084', customerId:'cust-1', amount:1000, method:'M-Pesa', status:'PAID', reference:'QJ82KLM3', time:'10:26', tenant_id:'tenant-1' },
    { id:'pay-2', jobId:'CW-2085', customerId:'cust-2', amount:500, method:'Cash', status:'PAID', reference:'CASH-2085', time:'10:43', tenant_id:'tenant-1' },
    { id:'pay-3', jobId:'CW-2087', customerId:'cust-4', amount:300, method:'Card', status:'PAID', reference:'CARD-2087', time:'11:20', tenant_id:'tenant-1' }
  ],
  commissions:[
    { id:'com-1', jobId:'CW-2081', workerId:'staff-1', amount:100, status:'APPROVED', date:'Today', tenant_id:'tenant-1' }
  ],
  audit:[
    { id:'evt-1', action:'Wash started', detail:'Kevin Otieno started CW-2084 · KDA 123A', time:'10:24', tenant_id:'tenant-1' },
    { id:'evt-2', action:'Payment recorded', detail:'KES 500 cash · CW-2085', time:'10:43', tenant_id:'tenant-1' },
    { id:'evt-3', action:'Vehicle checked in', detail:'CW-2087 · KCU 448D', time:'11:19', tenant_id:'tenant-1' }
  ],
  settings:{ businessName:'Sparkle Auto Spa', branch:'Westlands', currency:'KES', loyaltyRate:1 }
};

export function readDb() { return structuredClone(initialState); }
// Demo edits deliberately remain in memory. Real customer data belongs in the secured database.
export function clearDemoData() { runtimeSession = null; }
export function clearSession() { runtimeSession = null; }
export function getSession() { return runtimeSession; }
export function saveSession(session) { runtimeSession = session; }
export function wasUserSeen(email) { return seenUsers.has(email); }
export function markUserSeen(email) { seenUsers.add(email); }
export function clearLegacyBrowserData() {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(Boolean);
    const projectRef = import.meta.env?.VITE_SUPABASE_URL?.match(/^https?:\/\/([^.]+)/)?.[1];
    for (const key of keys) {
      if (key.startsWith('carwash-os-') || (projectRef && key === `sb-${projectRef}-auth-token`)) localStorage.removeItem(key);
    }
  } catch { /* Browser storage may be disabled; the app itself does not use it. */ }
}
export const demoUsers = [
  { role:'Business Admin', email:'admin@carwash.demo', name:'Peter Mwangi', tenant_id:'tenant-1' },
  { role:'Receptionist', email:'reception@carwash.demo', name:'Faith Njeri', tenant_id:'tenant-1' },
  { role:'Washer', email:'washer@carwash.demo', name:'Kevin Otieno', tenant_id:'tenant-1' }
];
export const newId = (prefix='rec') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
export const todayLabel = () => new Intl.DateTimeFormat('en-KE',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
export const formatKes = (amount) => `KES ${Number(amount || 0).toLocaleString('en-KE')}`;
