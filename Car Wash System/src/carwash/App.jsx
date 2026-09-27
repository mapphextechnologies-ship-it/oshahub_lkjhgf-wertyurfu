import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, BadgeCheck, Banknote,
  Bell, CalendarDays, CarFront, Check, CheckCircle2, ChevronDown, ChevronRight,
  CircleDollarSign, Clock3, CreditCard, Droplets, FileBarChart2, Gauge,
  History, LayoutDashboard, Languages, LogOut, Menu, MoreHorizontal, Play, Plus, Search,
  Settings, ShieldCheck, Sparkles, Store, UserRound, Users, Wallet, Waves, X, Zap
} from 'lucide-react';
import { supabaseBrowser } from '../services/supabaseBrowser.js';
import {
  clearLegacyBrowserData, clearSession, demoUsers, formatKes, getSession, markUserSeen,
  newId, readDb, saveSession, todayLabel, wasUserSeen
} from './model.js';

const ROLE_NAV = {
  'SaaS Super Admin': [
    ['overview','Overview',LayoutDashboard],['tenants','Businesses',Store],['plans','Plans & billing',Wallet],['reports','Platform reports',FileBarChart2],['audit','Audit & security',ShieldCheck]
  ],
  'Business Admin': [
    ['overview','Overview',LayoutDashboard],['jobs','Wash queue',Waves],['customers','Customers & vehicles',Users],['services','Services & pricing',Sparkles],['staff','Staff',Users],['payments','Payments',CreditCard],['commissions','Commissions',CircleDollarSign],['loyalty','Loyalty',BadgeCheck],['reports','Reports',FileBarChart2],['settings','Settings',Settings]
  ],
  Receptionist: [
    ['overview','Today’s operations',LayoutDashboard],['jobs','Wash queue',Waves],['customers','Customers & vehicles',Users],['payments','Payments',CreditCard]
  ],
  Washer: [
    ['overview','My jobs',LayoutDashboard],['jobs','Assigned jobs',Waves],['earnings','My earnings',CircleDollarSign],['history','Job history',History]
  ]
};

const ROLE_COPY = {
  'SaaS Super Admin':'Platform control plane',
  'Business Admin':'Business workspace',
  Receptionist:'Front desk workspace',
  Washer:'Washer mobile workspace'
};
const NAV_TITLES = Object.fromEntries(Object.values(ROLE_NAV).flatMap((items)=>items.map(([key,label])=>[key,label])));
const K = (value) => Number(value || 0);
const shortTime = () => new Intl.DateTimeFormat('en-KE',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());

export default function CarWashApp() {
  const [db, setDb] = useState(readDb);
  const [user, setUser] = useState(() => supabaseBrowser ? null : getSession());
  const inviteLink = new URLSearchParams(window.location.search).has('invite');
  const initialAuthRoute=window.location.hash.match(/^#\/(login|register)(?:\?.*)?$/)?.[1];
  const [showLogin, setShowLogin] = useState(()=>inviteLink||Boolean(initialAuthRoute)||window.sessionStorage.getItem('cw-auth-view')==='login');
  const [authMode, setAuthMode] = useState(()=>inviteLink?'register':initialAuthRoute==='register'?'register':initialAuthRoute==='login'?'login':window.sessionStorage.getItem('cw-auth-mode')||'login');
  const [screen, setScreen] = useState(()=>window.sessionStorage.getItem('cw-workspace-screen')||'overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState('');
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');

  useEffect(()=>{ clearLegacyBrowserData(); },[]);
  useEffect(()=>{ if(!toast)return; const id=setTimeout(()=>setToast(''),2700); return()=>clearTimeout(id); },[toast]);
  useEffect(()=>{
    if(!user)return;
    const key=`cw-workspace-scroll:${screen}`;
    window.scrollTo({top:Number(window.sessionStorage.getItem(key)||0),behavior:'instant'});
    window.sessionStorage.setItem('cw-workspace-screen',screen);
  },[user?.id,screen]);
  useEffect(()=>{
    if(!user)return;
    const key=`cw-workspace-scroll:${screen}`;
    const save=()=>window.sessionStorage.setItem(key,String(window.scrollY));
    window.addEventListener('scroll',save,{passive:true});
    return()=>window.removeEventListener('scroll',save);
  },[user?.id,screen]);
  useEffect(()=>{
    if(user||!showLogin)return;
    window.scrollTo({top:Number(window.sessionStorage.getItem('cw-auth-scroll')||0),behavior:'instant'});
    const save=()=>window.sessionStorage.setItem('cw-auth-scroll',String(window.scrollY));
    window.addEventListener('scroll',save,{passive:true});
    return()=>window.removeEventListener('scroll',save);
  },[user?.id,showLogin,authMode]);

  const role = user?.role || '';
  const tenantId = user?.tenant_id || db.activeTenantId;
  const tenant = db.tenants.find((item)=>item.id===tenantId) || db.tenants[0];
  const scoped = (rows) => rows.filter((item)=>role==='SaaS Super Admin'||item.tenant_id===tenantId);
  const scopedJobs = scoped(db.jobs);
  const scopedCustomers = scoped(db.customers);
  const scopedStaff = scoped(db.staff);
  const scopedServices = scoped(db.services);
  const workerJobs = role==='Washer' ? scopedJobs.filter((job)=>job.washerId===user.staffId || job.washerId===scopedStaff.find((staff)=>staff.email===user.email)?.id) : scopedJobs;
  const myNav = ROLE_NAV[role] || [];

  function patchDb(edit) { setDb((old)=>edit(JSON.parse(JSON.stringify(old)))); }
  function notify(message) { setToast(message); }
  function navigate(key) { setScreen(key); setMenuOpen(false); setQuery(''); setFilter('All'); }
  function login(selected) {
    if(!selected)return;
    const staff = selected.role==='Washer' ? db.staff.find((item)=>item.email===selected.email) : null;
    const session={...selected, ...(staff?{staffId:staff.id}:{}), signedAt:new Date().toISOString()};
    setToast(selected.activationMessage || `${wasUserSeen(selected.email)?'Welcome back':'Welcome'}, ${selected.name.split(' ')[0]}`);
    markUserSeen(selected.email);
    window.sessionStorage.removeItem('cw-auth-view');window.sessionStorage.removeItem('cw-auth-mode');window.location.hash='/';
    saveSession(session); setUser(session); setScreen('overview');
  }
  function logout() { if(supabaseBrowser&&user?.authUserId)supabaseBrowser.auth.signOut(); clearSession(); setUser(null); setScreen('overview'); setModal(''); window.location.hash='/'; }

  function updateJob(id, action) {
    const transitions={ assign:['WAITING','ASSIGNED'], start:['ASSIGNED','IN PROGRESS'], complete:['IN PROGRESS','COMPLETED'], ready:['COMPLETED','READY'], deliver:['READY','DELIVERED'], close:['DELIVERED','CLOSED'] };
    const [from,to]=transitions[action]||[];
    let affected;
    patchDb((next)=>{
      const job=next.jobs.find((item)=>item.id===id&&item.tenant_id===tenantId);
      if(!job||job.status!==from){affected=false;return next;}
      if(action==='deliver'&&job.paymentStatus!=='PAID'){affected=false;return next;}
      job.status=to; job.updatedAt=shortTime(); affected=true;
      if(action==='assign')job.washerId=next.staff.find((person)=>person.tenant_id===tenantId&&person.role==='Washer'&&person.status==='Active')?.id||null;
      next.audit.unshift({id:newId('evt'),tenant_id:job.tenant_id,action:`Wash ${to.toLowerCase()}`,detail:`${user.name} moved ${job.id} to ${to}`,time:shortTime()});
      if(action==='complete'&&!next.commissions.some((entry)=>entry.jobId===job.id))next.commissions.unshift({id:newId('com'),tenant_id:job.tenant_id,jobId:job.id,workerId:job.washerId,amount:job.commission,status:'PENDING',date:todayLabel()});
      if(action==='close'&&!job.loyaltyPosted){const customer=next.customers.find((item)=>item.id===job.customerId);if(customer){customer.points+=Math.floor(job.total*K(next.settings.loyaltyRate));customer.visits+=1;customer.lastVisit='Today';next.loyalty.unshift({id:newId('loy'),tenant_id:job.tenant_id,customerId:customer.id,jobId:job.id,points:Math.floor(job.total*K(next.settings.loyaltyRate)),type:'Earned',date:todayLabel()});job.loyaltyPosted=true;}}
      return next;
    });
    if(affected===false&&action==='deliver')notify('Record payment before collection.');
    else if(affected)notify(action==='complete'?'Wash completed · commission added to the ledger.':`Job moved to ${to.toLowerCase()}.`);
  }

  function recordPayment(job) {
    if(job.paymentStatus==='PAID')return;
    patchDb((next)=>{
      const item=next.jobs.find((row)=>row.id===job.id);if(!item||item.paymentStatus==='PAID')return next;
      item.paymentStatus='PAID';item.paymentMethod='Cash';
      next.payments.unshift({id:newId('pay'),tenant_id:item.tenant_id,jobId:item.id,customerId:item.customerId,amount:item.total,method:'Cash',status:'PAID',reference:`CASH-${item.id}`,time:shortTime()});
      next.audit.unshift({id:newId('evt'),tenant_id:item.tenant_id,action:'Payment recorded',detail:`${formatKes(item.total)} cash · ${item.id}`,time:shortTime()});return next;
    }); notify('Payment recorded.');
  }

  function submitModal(form) {
    const tenant_id=tenantId;
    patchDb((next)=>{
      if(modal==='order'){
        let customer=next.customers.find((item)=>item.phone.trim()===form.phone.trim()&&item.tenant_id===tenant_id);
        if(!customer){customer={id:newId('cust'),tenant_id,name:form.customer.trim(),phone:form.phone.trim(),email:form.email.trim(),points:0,visits:0,lastVisit:'New'};next.customers.unshift(customer);}
        let vehicle=next.vehicles.find((item)=>item.registration.toLowerCase()===form.registration.trim().toLowerCase()&&item.tenant_id===tenant_id);
        if(!vehicle){vehicle={id:newId('veh'),tenant_id,customerId:customer.id,registration:form.registration.trim().toUpperCase(),make:form.make.trim(),model:form.model.trim(),color:form.color.trim()};next.vehicles.unshift(vehicle);}
        const services=form.serviceIds.map((id)=>next.services.find((item)=>item.id===id&&item.tenant_id===tenant_id)).filter(Boolean);
        const total=services.reduce((sum,item)=>sum+K(item.price),0), commission=services.reduce((sum,item)=>sum+K(item.commission),0);
        const id=`CW-${String(Date.now()).slice(-5)}`,method=form.method||'Cash';
        const paid=form.paymentStatus==='PAID';
        const job={id,tenant_id,customerId:customer.id,vehicleId:vehicle.id,serviceIds:services.map((item)=>item.id),washerId:form.washerId||null,status:form.washerId?'ASSIGNED':'WAITING',total,commission,paymentStatus:paid?'PAID':'UNPAID',paymentMethod:method,createdAt:shortTime()};
        next.jobs.unshift(job);
        if(paid)next.payments.unshift({id:newId('pay'),tenant_id,jobId:id,customerId:customer.id,amount:total,method,status:'PAID',reference:method==='Cash'?`CASH-${id}`:'',time:shortTime()});
        next.audit.unshift({id:newId('evt'),tenant_id,action:'Vehicle checked in',detail:`${job.id} · ${vehicle.registration} · ${customer.name}`,time:shortTime()});
      } else if(modal==='customer'){
        const customer={id:newId('cust'),tenant_id,name:form.name.trim(),phone:form.phone.trim(),email:form.email.trim(),points:0,visits:0,lastVisit:'New'};next.customers.unshift(customer);
        if(form.registration.trim())next.vehicles.unshift({id:newId('veh'),tenant_id,customerId:customer.id,registration:form.registration.trim().toUpperCase(),make:form.make.trim(),model:form.model.trim(),color:form.color.trim()});
      } else if(modal==='service')next.services.unshift({id:newId('svc'),tenant_id,name:form.name.trim(),category:form.category.trim(),price:K(form.price),commission:K(form.commission),duration:K(form.duration),active:true});
      else if(modal==='staff')next.staff.unshift({id:newId('staff'),tenant_id,name:form.name.trim(),email:form.email.trim(),role:form.role,branch:form.branch.trim()||tenant.name,status:'Active'});
      else if(modal==='tenant')next.tenants.unshift({id:newId('tenant'),name:form.name.trim(),owner:form.owner.trim(),plan:form.plan||'Starter',status:'TRIAL',endsAt:form.endsAt||'2026-10-24',branches:1,createdAt:new Date().toISOString().slice(0,10)});
      else if(modal==='plan')next.plans=[...(next.plans||[]),{id:newId('plan'),name:form.name.trim(),price:K(form.price),days:K(form.days),features:form.features.trim(),active:true}];
      return next;
    });
    setModal('');notify(modal==='order'?'Vehicle checked in and washer assigned.':'Saved successfully.');
  }

  const dailyRevenue=useMemo(()=>scoped(db.payments).filter((payment)=>payment.status==='PAID').reduce((sum,payment)=>sum+K(payment.amount),0),[db.payments,tenantId,role]);
  const activeCount=workerJobs.filter((job)=>['ASSIGNED','IN PROGRESS'].includes(job.status)).length;
  const readyCount=workerJobs.filter((job)=>job.status==='READY').length;
  const routeJobs=screen==='history'?workerJobs.filter((job)=>['COMPLETED','READY','DELIVERED','CLOSED'].includes(job.status)):workerJobs;
  const filteredJobs=routeJobs.filter((job)=>{
    const v=db.vehicles.find((item)=>item.id===job.vehicleId),c=db.customers.find((item)=>item.id===job.customerId),w=db.staff.find((item)=>item.id===job.washerId);
    const matches=`${job.id} ${v?.registration||''} ${v?.make||''} ${v?.model||''} ${c?.name||''} ${w?.name||''} ${job.status}`.toLowerCase().includes(query.toLowerCase());
    return matches&&(filter==='All'||job.status===filter);
  });

  if(!user&&!showLogin)return <PublicLandingPage onLogin={()=>{window.sessionStorage.setItem('cw-auth-view','login');window.sessionStorage.setItem('cw-auth-mode','login');window.location.hash='/login';setAuthMode('login');setShowLogin(true)}} onRegister={()=>{window.sessionStorage.setItem('cw-auth-view','login');window.sessionStorage.setItem('cw-auth-mode','register');window.location.hash='/register';setAuthMode('register');setShowLogin(true)}} />;
  if(!user)return <LoginScreen initialMode={authMode} onLogin={login} onBack={()=>{window.sessionStorage.removeItem('cw-auth-view');window.sessionStorage.removeItem('cw-auth-mode');window.sessionStorage.removeItem('cw-auth-scroll');window.location.hash='/';window.scrollTo({top:0,behavior:'instant'});setShowLogin(false)}}/>;
  if(user.authUserId)return <SupabasePortalGate user={user} onLogout={logout}/>;

  return <div className="cw-shell">
    <aside className={`cw-sidebar ${menuOpen?'is-open':''}`}>
      <div className="cw-brand"><img src="/osha-hub-logo.svg" alt="OshaHub"/><button className="cw-icon-button cw-mobile-close" onClick={()=>setMenuOpen(false)} aria-label="Close menu"><X size={19}/></button></div>
      <div className="cw-workspace"><div className="cw-workspace-mark"><Store size={16}/></div><div className="cw-workspace-copy"><b>{role==='SaaS Super Admin'?'Platform owner':tenant?.name||db.settings.businessName}</b><span>{ROLE_COPY[role]}</span></div><ChevronDown size={15}/></div>
      <div className="cw-nav-label">WORKSPACE</div>
      <nav className="cw-nav">{myNav.map(([key,label,Icon])=><button key={key} className={`cw-nav-item ${screen===key?'active':''}`} onClick={()=>navigate(key)}><Icon size={18}/><span>{label}</span>{key==='jobs'&&activeCount>0&&<i>{activeCount}</i>}</button>)}</nav>
      <div className="cw-sidebar-bottom"><div className="cw-plan-card"><div className="cw-plan-icon"><Sparkles size={15}/></div><div><b>{role==='SaaS Super Admin'?'Platform health':`${tenant?.plan||'Growth'} plan`}</b><small>{role==='SaaS Super Admin'?'All services operational':`${tenant?.status||'ACTIVE'} subscription`}</small></div><ArrowRight size={15}/></div><button className="cw-user-menu" onClick={()=>navigate('profile')}><div className="cw-avatar">{user.name.split(' ').map((part)=>part[0]).slice(0,2).join('')}</div><span><b>{user.name}</b><small>{user.role}</small></span><MoreHorizontal size={17}/></button><button className="cw-signout" onClick={logout}><LogOut size={16}/>Sign out</button></div>
    </aside>
    {menuOpen&&<button className="cw-mobile-scrim" onClick={()=>setMenuOpen(false)} aria-label="Close navigation"/>}
    <main className="cw-main">
      <header className="cw-topbar"><button className="cw-icon-button cw-mobile-menu" onClick={()=>setMenuOpen(true)} aria-label="Open menu"><Menu size={21}/></button><div className="cw-crumb"><span>{role==='SaaS Super Admin'?'Platform':tenant?.name}</span><ChevronRight size={14}/><b>{NAV_TITLES[screen]||'My profile'}</b></div><div className="cw-top-actions"><span className="cw-date"><CalendarDays size={15}/>{todayLabel()}</span><button className="cw-icon-button cw-notification" onClick={()=>notify('You’re all caught up.')} aria-label="Notifications"><Bell size={18}/></button><div className="cw-top-avatar">{user.name.split(' ').map((part)=>part[0]).slice(0,2).join('')}</div></div></header>
      <section className="cw-page">
        {screen==='overview'&&<Overview db={db} role={role} user={user} jobs={workerJobs} revenue={dailyRevenue} active={activeCount} ready={readyCount} onNavigate={navigate} onCreate={()=>setModal('order')} onTransition={updateJob} onPayment={recordPayment}/>}
        {screen==='jobs'&&<JobsPage jobs={filteredJobs} db={db} role={role} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onCreate={()=>setModal('order')} onTransition={updateJob} onPayment={recordPayment}/>}
        {screen==='history'&&<JobsPage jobs={filteredJobs} db={db} role={role} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} history onTransition={updateJob} onPayment={recordPayment}/>}
        {screen==='customers'&&<CustomersPage customers={scopedCustomers} vehicles={scoped(db.vehicles)} query={query} setQuery={setQuery} onAdd={()=>setModal('customer')}/>}
        {screen==='services'&&<ServicesPage services={scopedServices} onAdd={()=>setModal('service')} onChange={(service)=>patchDb((next)=>{const item=next.services.find((row)=>row.id===service.id);if(item)item.active=!item.active;return next;})}/>}
        {screen==='staff'&&<StaffPage staff={scopedStaff} jobs={scopedJobs} onAdd={()=>setModal('staff')} onChange={(person)=>patchDb((next)=>{const item=next.staff.find((row)=>row.id===person.id);if(item)item.status=item.status==='Active'?'Inactive':'Active';return next;})}/>}
        {screen==='payments'&&<PaymentsPage payments={scoped(db.payments)} jobs={scopedJobs} customers={scopedCustomers} onPayment={recordPayment}/>}
        {screen==='commissions'&&<LedgerPage title="Commission ledger" subtitle="Worker earnings are recorded against completed wash jobs." rows={scoped(db.commissions)} db={db} onReview={(entry,status)=>{patchDb((next)=>{const row=next.commissions.find((item)=>item.id===entry.id);if(row)row.status=status;return next;});notify(status==='APPROVED'?'Commission approved.':'Commission payout recorded.');}}/>}
        {screen==='earnings'&&<EarningsPage user={user} jobs={workerJobs} commissions={scoped(db.commissions)} db={db}/>}
        {screen==='loyalty'&&<LoyaltyPage customers={scopedCustomers} ledger={scoped(db.loyalty||[])} db={db}/>}
        {screen==='reports'&&<ReportsPage jobs={scopedJobs} payments={scoped(db.payments)} commissions={scoped(db.commissions)} db={db} role={role}/>}
        {screen==='tenants'&&<TenantsPage tenants={db.tenants} onAdd={()=>setModal('tenant')} onChange={(item,status)=>patchDb((next)=>{const row=next.tenants.find((x)=>x.id===item.id);if(row)row.status=status;return next;})}/>}
        {screen==='plans'&&<PlansPage plans={db.plans||[]} tenants={db.tenants} onAdd={()=>setModal('plan')}/>}
        {screen==='audit'&&<AuditPage rows={scoped(db.audit)}/>}
        {screen==='settings'&&<SettingsPage db={db} onSave={(form)=>{patchDb((next)=>{next.settings={...next.settings,...form};return next;});notify('Business settings updated.');}}/>}
        {screen==='profile'&&<ProfilePage user={user} tenant={tenant} onLogout={logout}/>}
      </section>
    </main>
    {modal&&<FormModal type={modal} db={db} tenantId={tenantId} onClose={()=>setModal('')} onSubmit={submitModal}/>}
    {!!toast&&<div className="cw-toast"><CheckCircle2 size={18}/>{toast}</div>}
  </div>;
}

function SupabasePortalGate({user,onLogout}){
  const [requests,setRequests]=useState([]),[loading,setLoading]=useState(true),[notice,setNotice]=useState('');
  const [invitePhone,setInvitePhone]=useState(''),[inviteRole,setInviteRole]=useState('WASHER'),[whatsAppLink,setWhatsAppLink]=useState('');
  const canReview=user.role==='SaaS Super Admin';
  async function refresh(){
    setLoading(true);
    const {data,error}=await supabaseBrowser.from('carwash_access_requests').select('id,tenant_name,owner_name,phone,status,created_at').eq('status','PENDING').order('created_at',{ascending:true});
    if(error)setNotice(error.message);else setRequests(data||[]);
    setLoading(false);
  }
  useEffect(()=>{if(canReview)refresh();},[canReview]);
  async function review(id,approve){
    setNotice('');
    const {error}=await supabaseBrowser.rpc('carwash_review_business_request',{p_request:id,p_approve:approve});
    if(error){setNotice(error.message);return;}
    setNotice(approve?'Business approved and activation message delivered to the in-app inbox.':'Request declined and the applicant was notified in-app.');
    await refresh();
  }
  async function createStaffInvite(event){
    event.preventDefault();setNotice('');setWhatsAppLink('');
    const {data:token,error}=await supabaseBrowser.rpc('carwash_create_staff_invite',{target_tenant:user.tenant_id,target_phone:invitePhone,target_role:inviteRole==='Washer'?'WASHER':'RECEPTIONIST'});
    if(error){setNotice(error.message);return;}
    const inviteUrl=new URL(window.location.origin);inviteUrl.searchParams.set('invite',token);
    const digits=invitePhone.replace(/\D/g,'');
    const text=`You’re invited to join ${user.tenant_name||'OshaHub Carwash'} as ${inviteRole}. Open this secure link to register your account: ${inviteUrl.toString()} (expires in 72 hours).`;
    setWhatsAppLink(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`);
    setNotice('Invitation created. Open WhatsApp and tap Send to deliver the secure, one-time link.');
  }
  return <div className="cw-authenticated-gate"><div className="cw-gate-card"><img src="/osha-hub-logo-light.svg" alt="OshaHub"/><span className="cw-login-kicker">{canReview?'PLATFORM CONTROL':'SECURE PORTAL'}</span><h1>{canReview?'Business access requests':`Welcome, ${user.name.split(' ')[0]}`}</h1><p>{canReview?'Review new business registrations. Approval creates the tenant and Business Admin membership in one database transaction.':`You’re signed in to the ${user.role} portal${user.tenant_name?` for ${user.tenant_name}`:''}. Account approval is active. The live wash operations workspace is not connected to this Supabase project yet.`}</p>
  {canReview&&<><div className="cw-gate-section-head"><b>Pending business requests</b><button onClick={refresh}>Refresh</button></div>{loading?<p>Loading requests…</p>:requests.length?<div className="cw-approval-list">{requests.map((request)=><article key={request.id}><div><b>{request.tenant_name}</b><span>{request.owner_name} · {request.phone}</span><small>{new Date(request.created_at).toLocaleDateString()}</small></div><div className="cw-approval-actions"><button onClick={()=>review(request.id,false)}>Decline</button><button onClick={()=>review(request.id,true)}>Approve</button></div></article>)}</div>:<p>No requests waiting for review.</p>}</>}
  {user.role==='Business Admin'&&<section className="cw-invite-panel"><div className="cw-gate-section-head"><b>Invite a team member</b></div><p>Add an employee to the right portal. The invite link expires after 72 hours.</p><form onSubmit={createStaffInvite}><label>WhatsApp number<input type="tel" autoComplete="tel" required minLength="7" placeholder="+254 7xx xxx xxx" value={invitePhone} onChange={(e)=>setInvitePhone(e.target.value)}/></label><label>Portal<select value={inviteRole} onChange={(e)=>setInviteRole(e.target.value)}><option value="WASHER">Washer</option><option value="Receptionist">Receptionist</option></select></label><button className="cw-primary" type="submit">Create secure invitation</button></form>{whatsAppLink&&<a className="cw-whatsapp-link" href={whatsAppLink} target="_blank" rel="noreferrer">Open WhatsApp and send link <ArrowRight size={15}/></a>}</section>}
  {!!notice&&<div className="cw-auth-alert" role="status">{notice}</div>}<button className="cw-primary cw-enter" onClick={onLogout}>Sign out</button></div></div>;
}

function PublicLandingPage({onLogin,onRegister}){
  const [menuOpen,setMenuOpen]=useState(false);
  const [languageOpen,setLanguageOpen]=useState(false);
  const [page,setPage]=useState(()=>window.location.hash.startsWith('#/')?window.location.hash.slice(2).split('?')[0]:'home');
  useEffect(()=>{const syncPage=()=>setPage(window.location.hash.startsWith('#/')?window.location.hash.slice(2).split('?')[0]:'home');window.addEventListener('hashchange',syncPage);return()=>window.removeEventListener('hashchange',syncPage)},[]);
  useEffect(()=>{const key=`cw-public-scroll:${page}`;window.scrollTo({top:page==='home'?0:Number(window.sessionStorage.getItem(key)||0),behavior:'instant'});setMenuOpen(false)},[page]);
  useEffect(()=>{const key=`cw-public-scroll:${page}`;const save=()=>window.sessionStorage.setItem(key,String(window.scrollY));window.addEventListener('scroll',save,{passive:true});return()=>window.removeEventListener('scroll',save)},[page]);
  const closeMenu=()=>{setMenuOpen(false);setLanguageOpen(false)};
  return <div className="cw-landing">
    <header className="cw-landing-header"><div className="cw-landing-nav"><a className="cw-landing-brand" href="#/" aria-label="OshaHub home" onClick={closeMenu}><img src="/osha-hub-logo-light.svg" alt="OshaHub"/></a><nav id="cw-landing-nav" className={menuOpen?'is-open':''} aria-label="Main navigation"><a href="#/product" onClick={closeMenu}>Product</a><a href="#/pricing" onClick={closeMenu}>Pricing</a><a href="#/platforms" onClick={closeMenu}>Platforms</a><a href="#/developers" onClick={closeMenu}>Developers</a><a href="#/about" onClick={closeMenu}>About Us</a><a href="#/faq" onClick={closeMenu}>FAQ</a></nav><div className="cw-landing-actions"><div className="cw-landing-language-wrap"><button className="cw-landing-language" type="button" aria-label="Language options" aria-expanded={languageOpen} onClick={()=>setLanguageOpen((open)=>!open)}><Languages size={19}/></button>{languageOpen&&<div className="cw-language-menu" role="menu"><b>LANGUAGE</b><span className="selected">English · Kenya</span><span className="unavailable">Swahili · Coming soon</span></div>}</div><button className="cw-landing-account" type="button" onClick={onLogin} aria-label="Team sign in"><UserRound size={20}/></button><button className="cw-primary cw-landing-get-started" onClick={onRegister}>Get started <ArrowRight size={15}/></button><button className="cw-landing-menu-button" type="button" aria-label={menuOpen?'Close menu':'Open menu'} aria-expanded={menuOpen} aria-controls="cw-landing-nav" onClick={()=>setMenuOpen((open)=>!open)}>{menuOpen?<X size={20}/>:<Menu size={20}/>}</button></div></div></header>
    <main id="home">
      {page==='home'||page===''?<>
      <section className="cw-landing-hero"><div className="cw-landing-video-stage" aria-label="Landing page video placeholder"><span><Play size={15} fill="currentColor"/> CAR WASH VIDEO SPACE · FOOTAGE CAN BE ADDED LATER</span></div><div className="cw-landing-copy"><span className="cw-landing-eyebrow"><i/> CAR WASH OPERATIONS, CONNECTED</span><h1>A smoother day<br/>at <em>every wash.</em></h1><p>Keep the front desk, wash team and business owner in sync with one clear workspace for the work that moves your car wash forward.</p><div className="cw-landing-cta"><button className="cw-primary" onClick={onRegister}>Bring your wash online <ArrowRight size={17}/></button><a href="#benefits">Explore the platform <ArrowUpRight size={16}/></a></div><div className="cw-landing-trust"><ShieldCheck size={16}/><span>Role-based access · Secure account approval · Built for mobile</span></div></div>
        <div className="cw-landing-visual" aria-label="Animated illustration of a car in a wash"><div className="cw-landing-orbit orbit-one"/><div className="cw-landing-orbit orbit-two"/><div className="cw-landing-water water-one"/><div className="cw-landing-water water-two"/><div className="cw-landing-water water-three"/><div className="cw-landing-car"><div className="cw-landing-car-window"/><CarFront size={210} strokeWidth={1.2}/><div className="cw-landing-headlights"><i/><i/></div></div><div className="cw-landing-wash-beam"/><div className="cw-landing-status"><i/> WASH FLOOR · READY</div><div className="cw-video-slot cw-video-slot-landing" aria-label="Car wash video placeholder"><span className="cw-video-play"><Play size={18} fill="currentColor"/></span><span><b>CAR WASH VIDEO</b><small>Video preview coming soon</small></span></div><div className="cw-landing-float-card"><span><Waves size={16}/></span><div><b>Every role, in step</b><small>Owner · Front desk · Wash team</small></div><CheckCircle2 size={17}/></div></div>
      </section>
      <section className="cw-landing-trust-strip"><p>ONE CONNECTED WORKSPACE FOR YOUR WASH</p><div><span><ShieldCheck size={17}/> Role-based access</span><span><Waves size={17}/> Clear wash queue</span><span><Users size={17}/> Connected teams</span><span><CarFront size={18}/> Ready for mobile</span></div></section>
      <section className="cw-landing-portals" id="benefits"><div className="cw-landing-section-title"><span>THE OSHAHUB WORKSPACE</span><h2>Made for every part of the wash.</h2><p>Each team member gets a focused view with access set for their role.</p></div><div className="cw-landing-portal-grid" id="portals"><article><span><Store size={19}/></span><h3>Business Admin</h3><p>Review staff, services, subscriptions and the wash floor.</p><a href="#how">Manage your wash <ArrowRight size={14}/></a></article><article><span><Wallet size={19}/></span><h3>Front desk</h3><p>Check in vehicles, organize the queue and keep customer visits clear.</p><a href="#how">Follow each visit <ArrowRight size={14}/></a></article><article><span><Droplets size={19}/></span><h3>Wash team</h3><p>See assigned work and move each wash through its next step.</p><a href="#how">Keep work moving <ArrowRight size={14}/></a></article><article><span><ShieldCheck size={19}/></span><h3>Platform Admin</h3><p>Review business requests and manage platform access.</p><a href="#how">Approve access <ArrowRight size={14}/></a></article></div></section>
      <section className="cw-landing-how" id="how"><div className="cw-landing-section-title"><span>FROM SIGN-UP TO WASH FLOOR</span><h2>Get started in three simple steps.</h2><p>Clear onboarding for owners, followed by the right workspace for the team.</p></div><div className="cw-landing-step-grid"><article><div><span><Users size={22}/></span><b>01</b></div><h3>Request business access</h3><p>Share your business details and verify the email address for your account.</p></article><article><div><span><BadgeCheck size={22}/></span><b>02</b></div><h3>Get reviewed</h3><p>The platform team reviews the business request and activates approved access.</p></article><article><div><span><CarFront size={22}/></span><b>03</b></div><h3>Bring the team in</h3><p>Invite the front desk and wash team to their own role-based portals.</p></article></div></section>
      <section className="cw-landing-control"><div><span>CONTROL FROM ONE PLACE</span><h2>Know what’s happening<br/>across the wash floor.</h2><p>Keep today’s jobs, people and customer visits easy to follow as vehicles move through your wash.</p><div className="cw-landing-feature-list"><span><Check size={15}/> Follow wash progress</span><span><Check size={15}/> Give each role the right view</span><span><Check size={15}/> Keep a clear visit history</span><span><Check size={15}/> Work on phone or desktop</span></div></div><div className="cw-landing-control-art"><span className="cw-control-halo"/><span className="cw-control-orbit orbit-a">CHECK IN</span><span className="cw-control-orbit orbit-b">IN PROGRESS</span><span className="cw-control-orbit orbit-c"><ShieldCheck size={14}/> READY</span><div className="cw-control-core"><Waves size={38}/><small>WASH FLOOR</small><b>Work in motion</b></div></div></section>
      <section className="cw-landing-plans" id="pricing"><div><span>FLEXIBLE SUBSCRIPTION TERMS</span><h2>A plan that can grow<br/>with your wash.</h2><p>Explore monthly, quarterly and annual subscription terms. We’ll confirm available features and pricing during onboarding.</p><div className="cw-landing-quote"><p>Start with a clear view of the work. Add your team and branches as your wash grows.</p><small>Simple, guided business onboarding.</small></div></div><div className="cw-landing-plan-card"><div className="cw-plan-mark"><Sparkles size={18}/></div><small>OSHAHUB CAR WASH</small><h3>Flexible subscription</h3><p>Choose a term with the platform team and find the fit for your business.</p><ul><li><Check size={15}/> Business workspace</li><li><Check size={15}/> Role-based team portals</li><li><Check size={15}/> Mobile-ready experience</li><li><Check size={15}/> Guided approval and onboarding</li></ul><button className="cw-primary" onClick={onRegister}>Request business access <ArrowRight size={16}/></button><div className="cw-plan-reassurance"><ShieldCheck size={14}/> Account access is reviewed before activation.</div></div></section>
      <section className="cw-landing-bottom"><img src="/osha-hub-logo.svg" alt="OshaHub"/><div><b>Bring your wash team together.</b><span>Request business access to get started with OshaHub.</span></div><button className="cw-primary" onClick={onRegister}>Start your request <ArrowRight size={16}/></button></section>
      </>:<PublicInfoPage page={page} onLogin={onLogin} onRegister={onRegister}/>}
    </main><footer className="cw-landing-footer"><div className="cw-landing-footer-brand"><img src="/osha-hub-logo.svg" alt="OshaHub"/><p><strong>Keep every wash moving.</strong><br/>Connected tools for car wash teams, owners and operators.</p></div><div className="cw-landing-footer-links"><div><b>PLATFORM</b><a href="#/product">Product</a><a href="#/platforms">Platforms</a><a href="#/pricing">Pricing</a></div><div><b>GET STARTED</b><a href="#/how-it-works">How it works</a><a href="#/faq">FAQs</a><button onClick={onRegister}>Request access</button></div><div><b>YOUR ACCOUNT</b><button onClick={onLogin}>Team sign in</button><a href="#/">Back to top</a></div><div><b>COMPANY</b><a href="#/about">About OshaHub</a><a href="#/faq">Contact &amp; FAQs</a><a href="#/developers">Integrations</a></div><div><b>SECURITY</b><a href="#/faq">Account approval</a><a href="#/platforms">Role-based access</a><a href="#/privacy">Privacy &amp; data</a></div></div><div className="cw-landing-footer-bottom"><span>© 2026 OshaHub · Car Wash Operations</span><span>Built for teams that keep Kenya moving.</span></div></footer>
  </div>;
}

function PublicInfoPage({page,onLogin,onRegister}){
  const content={
    product:{kicker:'OSHAHUB PRODUCT',title:'One clear view of every wash.',intro:'Keep the front desk, wash team and business owner working from the same wash queue.',cards:[['Vehicle check-in','Record customer, vehicle, services and payment against one wash order.'],['Wash-floor progress','Move work through waiting, assigned, in progress, ready and delivered.'],['Business insight','Review payments, service performance, team commissions and repeat visits.']]},
    platforms:{kicker:'CONNECTED WORKSPACES',title:'The right view for every role.',intro:'Each account is assigned a role and access is limited to the work that role needs.',cards:[['Business Admin','Manage services, staff invitations, wash performance and business settings.'],['Front desk','Check in vehicles, manage the queue and record customer payments.'],['Wash team','See assigned jobs, update wash progress and review earnings.'],['Platform Admin','Review business requests and manage the platform workspace.']]},
    pricing:{kicker:'SUBSCRIPTIONS',title:'A plan that fits your wash.',intro:'Monthly, quarterly, annual and custom terms can be discussed during business onboarding. Final pricing and enabled features are confirmed with the platform team.',cards:[['Monthly','A short commitment for a single wash location.'],['Quarterly','A longer billing period for established teams.'],['Annual or custom','Discuss multiple locations, team size and deployment needs.']]},
    'how-it-works':{kicker:'HOW IT WORKS',title:'From access request to wash floor.',intro:'OshaHub keeps onboarding and daily work in one connected flow.',cards:[['1. Request access','Register the business and verify the owner’s email.'],['2. Get approved','A platform administrator reviews the account before access is activated.'],['3. Invite the team','Business Admin invites reception and washers to their own portal.']]},
    developers:{kicker:'DEVELOPERS & DEPLOYMENT',title:'A clear foundation for your rollout.',intro:'OshaHub is built as a separate car-wash application with a Supabase data layer and Vercel deployment configuration.',cards:[['Supabase','Use a dedicated project and apply the carwash schema before enabling live accounts.'],['Vercel','Set the public Supabase URL and anon key in the project environment. Never expose a service-role secret in browser settings.'],['Mobile','The responsive web app includes a PWA manifest and can be installed from a supported browser.']]},
    about:{kicker:'ABOUT OSHAHUB',title:'Technology for the people behind every wash.',intro:'OshaHub brings the daily work of a car wash into one place so owners and teams can keep vehicles moving and customers returning.',cards:[['Built for operations','A practical workspace for check-in, wash progress and handover.'],['Made for teams','Role-based portals keep front desk and wash-floor work in step.'],['Designed for growth','Business records are organized by car wash workspace.']]},
    privacy:{kicker:'PRIVACY & DATA',title:'Your business workspace stays scoped.',intro:'OshaHub uses account roles and business workspaces to organize operational data. Review your deployment privacy terms with the platform administrator before entering live customer records.',cards:[['Account access','Email verification and administrator review are part of account onboarding.'],['Workspace access','Business data is scoped to the signed-in organization and role.'],['Questions','Contact your OshaHub administrator for data access and correction requests.']]}
  };
  const faq=[['Who can create a business account?','A business owner can request access. A platform administrator reviews each request before activating a Business Admin account.'],['How do I add reception or wash staff?','The Business Admin creates an invitation for the selected role. The invitee verifies their email and accepts the time-limited invitation.'],['Can I use OshaHub on a phone?','The interface is responsive and includes an installable PWA manifest. Some installation features depend on the browser and device.'],['How are M-Pesa payments handled?','The wash team can record a payment method and reference in the payment workflow. Automated Daraja collection requires the business credentials and payment integration to be configured.'],['How do loyalty points work?','The workspace tracks repeat visits and points earned under the business loyalty settings.']];
  const isFaq=page==='faq', item=content[page]||content.product;
  return (
    <section className={`cw-info-page ${page}-page ${isFaq?'is-faq':''}`}>
      <div className="cw-info-hero">
        {['product','pricing'].includes(page)&&<div className="cw-info-media-placeholder" aria-label={`${page} video placeholder`}><span><Play size={15} fill="currentColor"/> {page==='pricing'?'PRICING':'PRODUCT'} VIDEO SPACE · FOOTAGE CAN BE ADDED LATER</span></div>}
        <header className="cw-info-heading">
          <a className="cw-info-home" href="#/"><ArrowRight size={14}/> Back to home</a>
          <span>{isFaq?'FREQUENTLY ASKED QUESTIONS':item.kicker}</span>
          <h1>{isFaq?'Good to know before you start.':item.title}</h1>
          <p>{isFaq?'How business access, team invitations and wash operations work.':item.intro}</p>
          <div><button className="cw-primary" onClick={onRegister}>Get started <ArrowRight size={16}/></button><button className="cw-info-back" onClick={onLogin}>Team sign in</button></div>
        </header>
        {!['pricing'].includes(page)&&<div className="cw-info-visual">
          <div className="cw-info-video-slot"><span className="cw-video-play"><Play size={19} fill="currentColor"/></span><div className="cw-info-video-art"><CarFront size={126} strokeWidth={1.25}/><i/><i/></div><div className="cw-info-video-label"><b>CAR WASH VIDEO</b><small>Video preview coming soon</small></div></div>
          <div className="cw-info-visual-caption"><Waves size={16}/><span><b>ONE PLATFORM. EVERY WASH.</b><small>Operations that move in sync</small></span><CheckCircle2 size={17}/></div>
        </div>}
        {!isFaq&&<div className="cw-info-cards">{item.cards.map(([title,text],i)=><article key={title}><i>{String(i+1).padStart(2,'0')}</i><h2>{title}</h2><p>{text}</p></article>)}</div>}
      </div>
      {isFaq&&<div className="cw-faq-list">{faq.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}<button className="cw-primary" onClick={onRegister}>Request business access <ArrowRight size={16}/></button></div>}
    </section>
  );
}

function LoginScreen({onLogin,onBack,initialMode='login'}){
  const inviteToken=new URLSearchParams(window.location.search).get('invite')||'';
  const [mode,setMode]=useState(()=>inviteToken?'register':initialMode);
  const [portal,setPortal]=useState('Business Admin');
  const [form,setForm]=useState({name:'',business:'',phone:'',email:'',password:''});
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [selected,setSelected]=useState(demoUsers[1]);
  const demoEnabled=import.meta.env.VITE_CARWASH_DEMO_MODE==='true';
  const set=(key,value)=>setForm((old)=>({...old,[key]:value}));
  useEffect(()=>{
    if(!supabaseBrowser)return;
    let active=true;
    supabaseBrowser.auth.getSession().then(async({data,error:sessionError})=>{
      if(!active)return;
      if(sessionError){setError(sessionError.message);return;}
      if(data.session?.user){try{await openWorkspace(data.session.user);}catch(e){if(active)setError(e?.message||'Unable to load your account.');}}
    });
    return()=>{active=false;};
  },[]);
  async function openWorkspace(authUser){
    let {data:membership,error:membershipError}=await supabaseBrowser.from('carwash_memberships')
      .select('id,role,tenant_id,full_name,status').eq('user_id',authUser.id).eq('status','ACTIVE').maybeSingle();
    if(membershipError)throw membershipError;
    if(!membership&&authUser.user_metadata?.invite_token){
      const accepted=await supabaseBrowser.rpc('carwash_accept_staff_invitation',{invite_token:authUser.user_metadata.invite_token,staff_name:authUser.user_metadata.full_name||authUser.email});
      if(accepted.error)throw accepted.error;
      const refreshed=await supabaseBrowser.from('carwash_memberships').select('id,role,tenant_id,full_name,status').eq('user_id',authUser.id).eq('status','ACTIVE').maybeSingle();
      if(refreshed.error)throw refreshed.error;
      membership=refreshed.data;
    }
    if(!membership){
      const meta=authUser.user_metadata||{};
      let {data:request}=await supabaseBrowser.from('carwash_access_requests').select('status').eq('user_id',authUser.id).maybeSingle();
      if(!request&&meta.business_name){
        const result=await supabaseBrowser.rpc('carwash_submit_business_request',{p_tenant_name:meta.business_name,p_owner_name:meta.full_name||authUser.email,p_phone:meta.phone||'Not provided'});
        if(result.error)throw result.error;
        request=result.data;
      }
      const {data:inbox}=await supabaseBrowser.from('carwash_user_messages').select('id,body').eq('user_id',authUser.id).is('read_at',null).order('created_at',{ascending:false}).limit(1);
      if(inbox?.[0])await supabaseBrowser.from('carwash_user_messages').update({read_at:new Date().toISOString()}).eq('id',inbox[0].id);
      setMessage(inbox?.[0]?.body||(request?.status==='REJECTED'?'Your request needs attention. Please update your details and submit again.':'Your email is verified. Your account is waiting for administrator approval. We’ll post the activation update here.'));
      return;
    }
    const roleNames={SUPER_ADMIN:'SaaS Super Admin',BUSINESS_ADMIN:'Business Admin',RECEPTIONIST:'Receptionist',WASHER:'Washer'};
    const {data:tenant}=membership.tenant_id?await supabaseBrowser.from('carwash_tenants').select('name').eq('id',membership.tenant_id).maybeSingle():{data:null};
    const {data:messages}=await supabaseBrowser.from('carwash_user_messages').select('id,subject,body').eq('user_id',authUser.id).is('read_at',null).order('created_at',{ascending:false}).limit(1);
    if(messages?.[0])await supabaseBrowser.from('carwash_user_messages').update({read_at:new Date().toISOString()}).eq('id',messages[0].id);
    const role=roleNames[membership.role];
    if(!role)throw new Error('This account has no supported portal role. Contact your administrator.');
    setPortal(role);
    onLogin({id:authUser.id,authUserId:authUser.id,email:authUser.email,name:membership.full_name||authUser.user_metadata?.full_name||authUser.email,role,tenant_id:membership.tenant_id,tenant_name:tenant?.name,activationMessage:messages?.[0]?.body});
  }
  async function submit(event){
    event.preventDefault();setError('');setMessage('');setLoading(true);
    try{
      if(!supabaseBrowser)throw new Error('Supabase is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the deployment environment.');
      if(mode==='register'){
        const staffInvite=inviteToken.length===64;
        const metadata=staffInvite?{full_name:form.name.trim(),invite_token:inviteToken}:{full_name:form.name.trim(),business_name:form.business.trim(),phone:form.phone.trim()};
        const callback=new URL(window.location.origin);if(staffInvite)callback.searchParams.set('invite',inviteToken);
        const {data,error:signUpError}=await supabaseBrowser.auth.signUp({email:form.email.trim(),password:form.password,options:{emailRedirectTo:callback.toString(),data:metadata}});
        if(signUpError)throw signUpError;
        if(data.session&&data.user){
          if(staffInvite){await openWorkspace(data.user);}
          else {const result=await supabaseBrowser.rpc('carwash_submit_business_request',{p_tenant_name:form.business.trim(),p_owner_name:form.name.trim(),p_phone:form.phone.trim()});if(result.error)throw result.error;}
        }
        setMode('login');setMessage(staffInvite?'Check your email, verify your account, then sign in to activate the invited portal.':data.session?'Your registration is submitted. Sign in after administrator review.':'Check your email for the Supabase verification code/link. Verify your address, then sign in; your business request will be submitted securely.');
      }else{
        const {data,error:signInError}=await supabaseBrowser.auth.signInWithPassword({email:form.email.trim(),password:form.password});
        if(signInError)throw signInError;
        await openWorkspace(data.user);
      }
    }catch(e){setError(e?.message||'Unable to complete the request. Please try again.');}
    finally{setLoading(false);}
  }
  async function demoEnter(){setLoading(true);await new Promise((resolve)=>setTimeout(resolve,650));onLogin(selected);setLoading(false);}
  return <div className="cw-login">
    {loading&&<div className="cw-wash-loader"><div className="cw-loader-logo"><Droplets size={22}/><b>OSHA<i>HUB</i></b></div><div className="cw-loader-car"><CarFront size={116}/><span className="cw-loader-spray"/></div><h2>Connecting to your secure wash floor…</h2><p>Getting your workspace ready</p><div className="cw-loader-track"><i/></div></div>}
    <div className="cw-login-visual"><div className="cw-login-nav"><img src="/osha-hub-logo.svg" alt="OshaHub"/><span><ShieldCheck size={15}/> SECURE OPERATIONS</span></div><div className="cw-login-art" aria-label="Animated car wash scene"><div className="cw-drop d1"/><div className="cw-drop d2"/><div className="cw-drop d3"/><div className="cw-car-glow"><CarFront size={220} strokeWidth={1.1}/><div className="cw-art-sheen"/></div><div className="cw-art-caption"><i/> ONE PLATFORM. EVERY WASH.</div></div><div className="cw-login-pitch"><span>OSHAHUB · CAR WASH OPERATIONS</span><h1>Every wash.<br/>Running smoothly.</h1><p>Run your car wash with a clear view of jobs, people and payments, all in one place.</p><div className="cw-login-points"><div><Check size={15}/> Live wash queue</div><div><Check size={15}/> Customer loyalty</div><div><Check size={15}/> Clear earnings</div></div><div className="cw-pitch-products"><div><small>CONNECTED PORTALS</small><b>Owner · Front desk · Wash team · Platform</b></div><div><small>SUBSCRIPTION PLANS</small><b>Monthly · Quarterly · Annual · Custom</b></div></div></div><div className="cw-login-legal">© 2026 OshaHub <span>Made for the people who keep Kenya moving.</span></div></div>
    <div className="cw-login-panel"><div className="cw-login-mobile-logo"><img src="/osha-hub-logo-light.svg" alt="OshaHub"/></div><div className="cw-login-content">{onBack&&<button type="button" className="cw-back-to-site" onClick={onBack}>← Back to OshaHub</button>}<span className="cw-login-kicker">WELCOME TO OSHAHUB</span><h2>{mode==='register'?'Bring your wash online.':'Your wash floor, at a glance.'}</h2><p className="cw-login-intro">{mode==='register'?'Create a business account request. We’ll verify your email before an administrator reviews activation.':'Sign in securely to the portal assigned to your account.'}</p><div className="cw-auth-mobile-products"><b>Business · Front desk · Wash team · Platform</b><span>Flexible monthly, quarterly, annual and custom subscriptions</span></div>
      {supabaseBrowser&&<div className="cw-auth-tabs">{['Business Admin','Receptionist','Washer','SaaS Super Admin'].map((item)=><button type="button" key={item} className={portal===item?'active':''} onClick={()=>setPortal(item)}>{item==='SaaS Super Admin'?'Platform':item.replace('Business ','')}</button>)}</div>}
      <form className="cw-auth-form" onSubmit={submit}>
        {mode==='register'&&<><label>{inviteToken.length===64?'Employee’s full name':'Owner’s full name'}<input autoComplete="name" required minLength="2" value={form.name} onChange={(e)=>set('name',e.target.value)}/></label>{inviteToken.length!==64&&<><label>Business name<input required minLength="2" value={form.business} onChange={(e)=>set('business',e.target.value)}/></label><label>Phone number<input autoComplete="tel" required minLength="7" value={form.phone} onChange={(e)=>set('phone',e.target.value)}/></label></>}</>}
        <label>Email address<input type="email" autoComplete="email" required value={form.email} onChange={(e)=>set('email',e.target.value)}/></label>
        <label>Password<input type="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength="10" value={form.password} onChange={(e)=>set('password',e.target.value)}/></label>
        <button className="cw-primary cw-enter" type="submit" disabled={loading||(!supabaseBrowser&&!demoEnabled)}>{loading?<><span className="cw-spinner"/>Connecting securely</>:mode==='register'?'Request business access':'Sign in securely'} <ArrowRight size={17}/></button>
      </form>
      {!supabaseBrowser&&!demoEnabled&&<div className="cw-auth-alert" role="status">Secure sign-in is disabled until this project is connected to its own Supabase URL and public anon key.</div>}
      {error&&<div className="cw-auth-alert error" role="alert">{error}</div>}{message&&<div className="cw-auth-alert" role="status">{message}</div>}
      <button className="cw-auth-switch" onClick={()=>{setError('');setMessage('');setMode(mode==='login'?'register':'login')}}>{mode==='login'?<>New business? <b>Request access</b></>:<>Already registered? <b>Sign in</b></>}</button>
      {demoEnabled&&<details className="cw-demo-access"><summary>Explore sample workspace</summary><div className="cw-role-options">{demoUsers.map((item)=>{const Icon=item.role==='SaaS Super Admin'?Gauge:item.role==='Business Admin'?Store:item.role==='Receptionist'?Users:Waves;return <button type="button" key={item.role} className={`cw-role-option ${selected.role===item.role?'selected':''}`} onClick={()=>setSelected(item)}><span className="cw-role-icon"><Icon size={17}/></span><span><b>{item.role}</b><small>{item.email}</small></span><span className="cw-role-radio"/></button>})}</div><button type="button" className="cw-primary cw-enter" onClick={demoEnter} disabled={loading}>Enter sample workspace <ArrowRight size={17}/></button><div className="cw-demo-note"><ShieldCheck size={16}/><span><b>Demo data only</b><br/>Demo changes reset when you reload.</span></div></details>}
    </div><div className="cw-login-foot">Email verification and account approval are handled by Supabase <span>·</span> Secure workspace access</div></div>
  </div>;
}

function Overview({db,role,user,jobs,revenue,active,ready,onNavigate,onCreate,onTransition,onPayment}){
  const metrics=role==='SaaS Super Admin' ? [
    ['Total businesses',db.tenants.length,'Across all plans',Store,'blue'],['Active subscriptions',db.tenants.filter((item)=>item.status==='ACTIVE').length,'Operating today',BadgeCheck,'green'],['Monthly revenue',formatKes(db.tenants.filter((item)=>item.status==='ACTIVE').length*4900),'Recurring subscription revenue',Wallet,'blue'],['Expiring soon',db.tenants.filter((item)=>['EXPIRING SOON','TRIAL'].includes(item.status)).length,'Needs attention',Clock3,'amber']
  ] : role==='Washer' ? [
    ['Assigned today',active,'Jobs ready for you',Waves,'blue'],['In progress',jobs.filter((job)=>job.status==='IN PROGRESS').length,'Keep up the shine',Activity,'amber'],['Completed',jobs.filter((job)=>['COMPLETED','READY','DELIVERED','CLOSED'].includes(job.status)).length,'Your finished washes',CheckCircle2,'green'],['Commission',formatKes(db.commissions.filter((row)=>row.workerId===user.staffId).reduce((n,row)=>n+K(row.amount),0)),'Recorded earnings',CircleDollarSign,'blue']
  ] : [
    ['Collected today',formatKes(revenue),'Across recorded payments',Banknote,'blue'],['Active washes',active,'Vehicles being washed',Waves,'amber'],['Ready for pickup',ready,'Quality check passed',CheckCircle2,'green'],['Vehicles checked in',jobs.length,'Today’s wash queue',CarFront,'blue']
  ];
  const viewJobs=(role==='Washer'?jobs.filter((job)=>['ASSIGNED','IN PROGRESS'].includes(job.status)):jobs.filter((job)=>job.status!=='CLOSED')).slice(0,5);
  return <>
    <div className="cw-page-heading"><div><div className="cw-overline">{role==='SaaS Super Admin'?'PLATFORM OVERVIEW':role==='Washer'?'YOUR WASH FLOOR':`${tenantName(db,user)} · ${todayLabel().toUpperCase()}`}</div><h1>{role==='SaaS Super Admin'?'Good morning, Miriam':role==='Washer'?`Ready for your next wash, ${user.name.split(' ')[0]}?`:`Good morning, ${user.name.split(' ')[0]}`}</h1><p>{role==='SaaS Super Admin'?'Here’s how your car wash network is performing.':role==='Washer'?'Here are the jobs assigned to you today.':'Here’s what’s happening across your wash floor today.'}</p></div><div className="cw-heading-actions"><button className="cw-secondary" onClick={()=>onNavigate('reports')}><FileBarChart2 size={16}/> View reports</button>{['Receptionist','Business Admin'].includes(role)&&<button className="cw-primary" onClick={onCreate}><Plus size={17}/> New wash order</button>}</div></div>
    <div className="cw-metrics">{metrics.map(([label,value,note,Icon,tone])=><div className="cw-metric" key={label}><div className="cw-metric-top"><span>{label}</span><i className={`tone-${tone}`}><Icon size={18}/></i></div><strong>{value}</strong><small>{note}</small></div>)}</div>
    {role==='SaaS Super Admin'?<PlatformPanels db={db} onNavigate={onNavigate}/>:<>
      {role==='Receptionist'&&<div className="cw-workflow-strip">{[['01','Arrive'],['02','Identify'],['03','Build order'],['04','Pay & assign'],['05','Ready'],['06','Collect']].map(([num,label],index)=><div key={num} className={index===0?'current':''}><i>{num}</i><b>{label}</b>{index<5&&<ArrowRight size={13}/>}</div>)}</div>}
      <div className="cw-content-grid"><div className="cw-panel cw-queue-panel"><div className="cw-panel-head"><div><h2>{role==='Washer'?'My assigned jobs':'Live wash queue'}</h2><p>{role==='Washer'?'Work through your assigned vehicles.':'Every vehicle in today’s operation.'}</p></div><button className="cw-text-action" onClick={()=>onNavigate(role==='Washer'?'jobs':'jobs')}>View queue <ArrowRight size={14}/></button></div><JobTable jobs={viewJobs} db={db} role={role} onTransition={onTransition} onPayment={onPayment} compact empty="No open washes right now."/></div><aside className="cw-panel cw-side-panel"><div className="cw-panel-head"><div><h2>Shift pulse</h2><p>Live operation status</p></div><span className="cw-live"><i/> LIVE</span></div><div className="cw-pulse-ring"><div><strong>{active}</strong><span>active washes</span></div><svg viewBox="0 0 200 100" aria-hidden="true"><path d="M14 78 C44 67 52 24 85 47 S132 76 151 45 S175 27 188 18"/></svg></div><div className="cw-pulse-legend"><span><i className="blue-dot"/>In progress <b>{jobs.filter((job)=>job.status==='IN PROGRESS').length}</b></span><span><i className="amber-dot"/>Waiting / assigned <b>{jobs.filter((job)=>['WAITING','ASSIGNED'].includes(job.status)).length}</b></span><span><i className="green-dot"/>Ready to collect <b>{ready}</b></span></div>{role!=='Washer'&&<button className="cw-secondary cw-wide" onClick={()=>onNavigate('customers')}><Users size={16}/> Find a customer</button>}</aside></div>
      <div className="cw-lower-grid"><div className="cw-panel"><div className="cw-panel-head"><div><h2>Weekly sales</h2><p>Paid wash orders · KES</p></div><span className="cw-period">THIS WEEK <ChevronDown size={13}/></span></div><SalesChart/></div><div className="cw-panel"><div className="cw-panel-head"><div><h2>Team on shift</h2><p>Assigned wash floor staff</p></div><button className="cw-text-action" onClick={()=>onNavigate('staff')}>See team <ArrowRight size={14}/></button></div>{db.staff.filter((person)=>person.tenant_id===user.tenant_id&&person.status==='Active').slice(0,4).map((person,index)=><div className="cw-team-row" key={person.id}><div className={`cw-team-avatar avatar-${index}`}>{person.name.split(' ').map((part)=>part[0]).slice(0,2).join('')}</div><span><b>{person.name}</b><small>{person.role} · {person.branch}</small></span><i className="cw-presence"/></div>)}</div></div>
    </>}
  </>;
}

function tenantName(db,user){return db.tenants.find((item)=>item.id===user.tenant_id)?.name||db.settings.businessName;}
function PlatformPanels({db,onNavigate}){return <div className="cw-content-grid"><div className="cw-panel"><div className="cw-panel-head"><div><h2>Subscription health</h2><p>Business accounts that need your attention</p></div><button className="cw-text-action" onClick={()=>onNavigate('tenants')}>All businesses <ArrowRight size={14}/></button></div><TenantsTable tenants={db.tenants.slice(0,4)} compact/></div><aside className="cw-panel"><div className="cw-panel-head"><div><h2>Platform status</h2><p>System services</p></div><span className="cw-live"><i/> NORMAL</span></div>{[['Core API','Operational'],['Tenant isolation','Enforced'],['Data services','Connected'],['Audit logging','Recording']].map(([label,value])=><div className="cw-health-row" key={label}><span><CheckCircle2 size={15}/>{label}</span><b>{value}</b></div>)}</aside></div>}

function JobsPage({jobs,db,role,query,setQuery,filter,setFilter,history=false,onCreate,onTransition,onPayment}){return <><PageHeading title={history?'Job history':role==='Washer'?'Assigned jobs':'Wash queue'} subtitle={history?'Completed work and earnings history.':'Track every vehicle as it moves through the wash floor.'} action={role==='Receptionist'||role==='Business Admin'?<button className="cw-primary" onClick={onCreate}><Plus size={16}/> Check in vehicle</button>:null}/><div className="cw-toolbar"><div className="cw-search"><Search size={16}/><input placeholder="Search plate, customer, washer…" value={query} onChange={(event)=>setQuery(event.target.value)}/></div><div className="cw-filter">{(history?['All','COMPLETED','READY','DELIVERED','CLOSED']:['All','WAITING','ASSIGNED','IN PROGRESS','COMPLETED','READY']).map((value)=><button key={value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{value==='IN PROGRESS'?'In progress':value.charAt(0)+value.slice(1).toLowerCase()}</button>)}</div></div><div className="cw-panel cw-table-panel"><JobTable jobs={jobs} db={db} role={role} onTransition={onTransition} onPayment={onPayment} history={history}/></div></>}
function JobTable({jobs,db,role,onTransition,onPayment,compact=false,history=false,empty='No wash orders match this view.'}){
  return <div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>VEHICLE</th><th>SERVICE</th><th>WASHER</th><th>PAYMENT</th><th>STATUS</th><th className="align-right">TOTAL</th><th/></tr></thead><tbody>{jobs.map((job)=>{const vehicle=db.vehicles.find((item)=>item.id===job.vehicleId),customer=db.customers.find((item)=>item.id===job.customerId),washer=db.staff.find((item)=>item.id===job.washerId),services=job.serviceIds.map((id)=>db.services.find((item)=>item.id===id)?.name).filter(Boolean);return <tr key={job.id}><td><div className="cw-vehicle-cell"><div className="cw-vehicle-icon"><CarFront size={19}/></div><span><b>{vehicle?.registration||'Vehicle'}</b><small>{vehicle?.make} {vehicle?.model} · {customer?.name}</small></span></div></td><td><b className="cw-cell-primary">{services.join(' + ')||'Wash service'}</b><small className="cw-cell-sub">{job.id}</small></td><td><span className="cw-washer-cell"><i>{washer?.name?.split(' ').map((part)=>part[0]).join('')||'—'}</i>{washer?.name||'Unassigned'}</span></td><td><span className={`cw-pay-state ${job.paymentStatus==='PAID'?'paid':'unpaid'}`}>{job.paymentStatus==='PAID'?<CheckCircle2 size={13}/>:<Clock3 size={13}/>} {job.paymentStatus}</span></td><td><StatusPill status={job.status}/></td><td className="align-right"><b className="cw-cell-primary">{formatKes(job.total)}</b><small className="cw-cell-sub">{formatKes(job.commission)} commission</small></td><td><div className="cw-row-actions">{job.paymentStatus!=='PAID'&&['Receptionist','Business Admin'].includes(role)&&<button className="cw-small-action secondary" onClick={()=>onPayment(job)}>Pay</button>}<JobAction job={job} role={role} history={history} onTransition={onTransition}/></div></td></tr>;})}{!jobs.length&&<tr><td colSpan="7"><div className="cw-table-empty"><Waves size={24}/><b>{empty}</b><span>New activity will appear here.</span></div></td></tr>}</tbody></table></div>;
}
function JobAction({job,role,history,onTransition}){if(history||job.status==='CLOSED')return <span className="cw-dash">—</span>;const map={WAITING:['assign','Assign washer'],ASSIGNED:['start','Start wash'],'IN PROGRESS':['complete','Complete wash'],COMPLETED:['ready','Mark ready'],READY:['deliver','Collected'],DELIVERED:['close','Close order']};let[action,label]=map[job.status]||[];if(['ASSIGNED','IN PROGRESS'].includes(job.status)&&role!=='Washer')action=null;if(['COMPLETED','READY'].includes(job.status)&&role==='Washer')action=null;if(job.status==='WAITING'&&!['Receptionist','Business Admin'].includes(role))action=null;if(job.status==='DELIVERED'&&role!=='Business Admin')action=null;if(!action)return <span className="cw-dash">{['ASSIGNED','IN PROGRESS'].includes(job.status)?'Washer working':'—'}</span>;return <button className={`cw-small-action ${action==='complete'?'success':''}`} onClick={()=>onTransition(job.id,action)}>{label}</button>;}
function StatusPill({status}){const kind=status.toLowerCase().replaceAll(' ','-');return <span className={`cw-status status-${kind}`}><i/>{status}</span>}

function CustomersPage({customers,vehicles,query,setQuery,onAdd}){const visible=customers.filter((item)=>`${item.name} ${item.phone} ${item.email} ${vehicles.filter((v)=>v.customerId===item.id).map((v)=>v.registration).join(' ')}`.toLowerCase().includes(query.toLowerCase()));return <><PageHeading title="Customers & vehicles" subtitle="Customer profiles, vehicles and visit history in one place." action={<button className="cw-primary" onClick={onAdd}><Plus size={16}/> Add customer</button>}/><div className="cw-toolbar"><div className="cw-search"><Search size={16}/><input placeholder="Search customer, phone or plate…" value={query} onChange={(event)=>setQuery(event.target.value)}/></div><span className="cw-record-count">{customers.length} customers · {vehicles.length} vehicles</span></div><div className="cw-panel cw-table-panel"><div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>CUSTOMER</th><th>VEHICLES</th><th>VISITS</th><th>LOYALTY POINTS</th><th>LAST VISIT</th></tr></thead><tbody>{visible.map((customer,index)=>{const owned=vehicles.filter((vehicle)=>vehicle.customerId===customer.id);return <tr key={customer.id}><td><div className="cw-person-cell"><div className={`cw-person-avatar avatar-${index%4}`}>{customer.name.split(' ').map((part)=>part[0]).slice(0,2).join('')}</div><span><b>{customer.name}</b><small>{customer.phone}{customer.email?` · ${customer.email}`:''}</small></span></div></td><td>{owned.length?owned.map((vehicle)=><span className="cw-plate-tag" key={vehicle.id}>{vehicle.registration}<small>{vehicle.make} {vehicle.model}</small></span>):<span className="cw-cell-sub">No vehicle added</span>}</td><td>{customer.visits}</td><td><b className="cw-points">✦ {customer.points}</b></td><td>{customer.lastVisit}</td></tr>;})}{!visible.length&&<tr><td colSpan="5"><div className="cw-table-empty">No customers found.</div></td></tr>}</tbody></table></div></div></>}

function ServicesPage({services,onAdd,onChange}){return <><PageHeading title="Services & pricing" subtitle="Configure wash services, customer prices and worker commission rules." action={<button className="cw-primary" onClick={onAdd}><Plus size={16}/> Add service</button>}/><div className="cw-service-grid">{services.map((service,index)=><article className="cw-service-card" key={service.id}><div className="cw-service-head"><div className={`cw-service-icon service-${index%4}`}><Sparkles size={19}/></div><span className={`cw-active-tag ${service.active?'':'inactive'}`}><i/>{service.active?'ACTIVE':'PAUSED'}</span></div><span className="cw-service-category">{service.category}</span><h2>{service.name}</h2><p>Average time · {service.duration} min</p><div className="cw-service-price"><span>Customer price</span><b>{formatKes(service.price)}</b></div><div className="cw-service-price commission-line"><span>Washer commission</span><b>{formatKes(service.commission)}</b></div><button className="cw-secondary cw-wide" onClick={()=>onChange(service)}>{service.active?'Pause service':'Activate service'}</button></article>)}{!services.length&&<EmptyPanel title="No services yet" text="Add the services your car wash offers."/>}</div></>}

function StaffPage({staff,jobs,onAdd,onChange}){
  return <>
    <PageHeading title="Staff" subtitle="Manage your team, branch assignments and access roles." action={<button className="cw-primary" onClick={onAdd}><Plus size={16}/> Add team member</button>}/>
    <div className="cw-panel cw-table-panel"><div className="cw-table-wrap"><table className="cw-table">
      <thead><tr><th>TEAM MEMBER</th><th>ROLE</th><th>BRANCH</th><th>STATUS</th><th>JOBS TODAY</th><th/></tr></thead>
      <tbody>{staff.map((person,index)=><tr key={person.id}>
        <td><div className="cw-person-cell"><div className={`cw-person-avatar avatar-${index%4}`}>{person.name.split(' ').map((part)=>part[0]).slice(0,2).join('')}</div><span><b>{person.name}</b><small>{person.email}</small></span></div></td>
        <td>{person.role}</td><td>{person.branch}</td>
        <td><span className={`cw-active-tag ${person.status==='Active'?'':'inactive'}`}><i/>{person.status}</span></td>
        <td>{person.role==='Washer'?jobs.filter((job)=>job.washerId===person.id).length:'—'}</td>
        <td><button className="cw-secondary cw-mini-button" onClick={()=>onChange(person)}>{person.status==='Active'?'Deactivate':'Reactivate'}</button></td>
      </tr>)}</tbody>
    </table></div></div>
  </>;
}

function PaymentsPage({payments,jobs,customers,onPayment}){const unpaid=jobs.filter((job)=>job.paymentStatus!=='PAID');return <><PageHeading title="Payments" subtitle="Cash, card and mobile money records for wash orders."/><div className="cw-metrics small-metrics"><MetricCard label="Collected" value={formatKes(payments.reduce((sum,row)=>sum+K(row.amount),0))} note={`${payments.length} transactions`} icon={Banknote}/><MetricCard label="Unpaid orders" value={unpaid.length} note="Awaiting payment" icon={Clock3}/><MetricCard label="M-Pesa" value={payments.filter((row)=>row.method==='M-Pesa').length} note="Recorded references" icon={CreditCard}/><MetricCard label="Refunds" value="KES 0" note="No refunds this period" icon={ArrowDownLeft}/></div>{unpaid.length>0&&<div className="cw-notice"><Clock3 size={17}/><span><b>{unpaid.length} order{unpaid.length===1?'':'s'} need payment</b><small>Record payment before handing the vehicle back.</small></span>{unpaid.slice(0,1).map((job)=><button key={job.id} onClick={()=>onPayment(job)}>Record payment</button>)}</div>}<div className="cw-panel cw-table-panel"><div className="cw-panel-head pad-head"><div><h2>Transaction history</h2><p>Most recent payment records</p></div><span className="cw-live"><i/> UP TO DATE</span></div><div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>REFERENCE</th><th>CUSTOMER</th><th>WASH ORDER</th><th>METHOD</th><th>TIME</th><th>STATUS</th><th className="align-right">AMOUNT</th></tr></thead><tbody>{payments.map((payment)=><tr key={payment.id}><td><b className="cw-cell-primary">{payment.reference||'—'}</b></td><td>{customers.find((c)=>c.id===payment.customerId)?.name||'Customer'}</td><td>{payment.jobId}</td><td><span className="cw-method"><CreditCard size={14}/>{payment.method}</span></td><td>{payment.time}</td><td><StatusPill status={payment.status}/></td><td className="align-right"><b>{formatKes(payment.amount)}</b></td></tr>)}{!payments.length&&<tr><td colSpan="7"><div className="cw-table-empty">No payments recorded.</div></td></tr>}</tbody></table></div></div></>}

function LedgerPage({title,subtitle,rows,db,onReview}){const total=rows.reduce((sum,row)=>sum+K(row.amount),0);return <><PageHeading title={title} subtitle={subtitle}/><div className="cw-metrics small-metrics"><MetricCard label="Total commission" value={formatKes(total)} note="Recorded earnings" icon={CircleDollarSign}/><MetricCard label="Pending approval" value={rows.filter((row)=>row.status==='PENDING').length} note="Needs reconciliation" icon={Clock3}/><MetricCard label="Approved" value={rows.filter((row)=>row.status==='APPROVED').length} note="Ready for payout" icon={CheckCircle2}/></div><div className="cw-panel cw-table-panel"><div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>WASHER</th><th>WASH ORDER</th><th>RULE SNAPSHOT</th><th>DATE</th><th>STATUS</th><th className="align-right">AMOUNT</th><th/></tr></thead><tbody>{rows.map((row)=><tr key={row.id}><td>{db.staff.find((item)=>item.id===row.workerId)?.name||'Washer'}</td><td>{row.jobId}</td><td>Service commission at completion</td><td>{row.date}</td><td><StatusPill status={row.status}/></td><td className="align-right"><b className="cw-commission-amount">{formatKes(row.amount)}</b></td><td>{row.status==='PENDING'?<button className="cw-small-action" onClick={()=>onReview(row,'APPROVED')}>Approve</button>:row.status==='APPROVED'?<button className="cw-small-action success" onClick={()=>onReview(row,'PAID')}>Record payout</button>:<span className="cw-dash">—</span>}</td></tr>)}{!rows.length&&<tr><td colSpan="7"><div className="cw-table-empty">Commissions appear when washes are completed.</div></td></tr>}</tbody></table></div></div></>}

function EarningsPage({user,jobs,commissions,db}){const own=commissions.filter((row)=>row.workerId===user.staffId),total=own.reduce((sum,row)=>sum+K(row.amount),0),done=jobs.filter((job)=>job.washerId===user.staffId&&['COMPLETED','READY','DELIVERED','CLOSED'].includes(job.status));return <><PageHeading title="My earnings" subtitle="Your daily, weekly and monthly commission totals."/><div className="cw-earn-hero"><div><span>COMMISSION EARNED THIS MONTH</span><h2>{formatKes(total)}</h2><small>{done.length} completed washes · ledger backed</small></div><div className="cw-earn-hero-icon"><CircleDollarSign size={30}/></div></div><div className="cw-metrics small-metrics"><MetricCard label="Today" value={formatKes(total)} note="Commission earned" icon={Zap}/><MetricCard label="This week" value={formatKes(total)} note="Current week" icon={CalendarDays}/><MetricCard label="Completed washes" value={done.length} note="Your work this period" icon={CheckCircle2}/></div><div className="cw-panel cw-table-panel"><div className="cw-panel-head pad-head"><div><h2>My completed work</h2><p>Each commission is tied to the completed wash order.</p></div></div><div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>WASH ORDER</th><th>VEHICLE</th><th>SERVICE</th><th>DATE</th><th className="align-right">COMMISSION</th></tr></thead><tbody>{own.map((row)=><tr key={row.id}><td>{row.jobId}</td><td>{db.vehicles.find((v)=>v.id===jobs.find((j)=>j.id===row.jobId)?.vehicleId)?.registration||'—'}</td><td>{db.services.find((s)=>s.id===jobs.find((j)=>j.id===row.jobId)?.serviceIds?.[0])?.name||'Wash service'}</td><td>{row.date}</td><td className="align-right cw-commission-amount">{formatKes(row.amount)}</td></tr>)}</tbody></table></div></div></>}

function LoyaltyPage({customers,ledger,db}){return <><PageHeading title="Loyalty" subtitle="Reward repeat customers with transparent points and a traceable ledger."/><div className="cw-metrics small-metrics"><MetricCard label="Members" value={customers.filter((c)=>c.points>0).length} note="Customers earning points" icon={Users}/><MetricCard label="Points balance" value={customers.reduce((n,c)=>n+K(c.points),0).toLocaleString()} note="Across all customers" icon={BadgeCheck}/><MetricCard label="Earn rate" value={`${db.settings.loyaltyRate} pt / KES`} note="Tenant policy" icon={Sparkles}/></div><div className="cw-panel cw-table-panel"><div className="cw-panel-head pad-head"><div><h2>Customer balances</h2><p>Points change only when a wash order is closed.</p></div></div><div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>CUSTOMER</th><th>VISITS</th><th>LAST VISIT</th><th className="align-right">POINTS BALANCE</th></tr></thead><tbody>{customers.map((item)=><tr key={item.id}><td>{item.name}<small className="cw-cell-sub">{item.phone}</small></td><td>{item.visits}</td><td>{item.lastVisit}</td><td className="align-right"><b className="cw-points">✦ {item.points.toLocaleString()} pts</b></td></tr>)}</tbody></table></div></div></>}

function ReportsPage({jobs,payments,commissions,db,role}){const revenue=payments.reduce((n,p)=>n+K(p.amount),0),closed=jobs.filter((j)=>j.status==='CLOSED'||j.status==='DELIVERED'),staff=role==='SaaS Super Admin'?db.tenants:db.staff;return <><PageHeading title={role==='SaaS Super Admin'?'Platform reports':'Reports & insights'} subtitle="A clear view of sales, wash volume, payments and team performance."/><div className="cw-metrics small-metrics"><MetricCard label="Sales" value={formatKes(revenue)} note="Recorded payments" icon={Banknote}/><MetricCard label="Wash orders" value={jobs.length} note="Current records" icon={CarFront}/><MetricCard label="Collected / closed" value={closed.length} note="Customer handoffs" icon={CheckCircle2}/><MetricCard label="Commission expense" value={formatKes(commissions.reduce((n,c)=>n+K(c.amount),0))} note="Worker earnings" icon={CircleDollarSign}/></div><div className="cw-lower-grid report-grid"><div className="cw-panel"><div className="cw-panel-head"><div><h2>Sales trend</h2><p>Paid wash jobs across the week</p></div></div><SalesChart/></div><div className="cw-panel"><div className="cw-panel-head"><div><h2>{role==='SaaS Super Admin'?'Business accounts':'Team performance'}</h2><p>{role==='SaaS Super Admin'?'Subscription status by account':'Completed wash work'}</p></div></div>{staff.slice(0,6).map((item,index)=><div className="cw-report-row" key={item.id}><div className={`cw-team-avatar avatar-${index%4}`}>{(item.name||item.owner).split(' ').map((part)=>part[0]).slice(0,2).join('')}</div><span><b>{item.name||item.owner}</b><small>{item.role||item.plan}</small></span><strong>{item.status}</strong></div>)}</div></div></>}

function TenantsPage({tenants,onAdd,onChange}){return <><PageHeading title="Businesses" subtitle="Manage tenant access, subscription health and commercial status." action={<button className="cw-primary" onClick={onAdd}><Plus size={16}/> Add business</button>}/><div className="cw-metrics small-metrics"><MetricCard label="All businesses" value={tenants.length} note="Registered tenants" icon={Store}/><MetricCard label="Active" value={tenants.filter((t)=>t.status==='ACTIVE').length} note="Currently operating" icon={CheckCircle2}/><MetricCard label="Trials" value={tenants.filter((t)=>t.status==='TRIAL').length} note="Evaluation accounts" icon={Zap}/><MetricCard label="Attention needed" value={tenants.filter((t)=>['EXPIRING SOON','EXPIRED','SUSPENDED'].includes(t.status)).length} note="Renew or review" icon={Clock3}/></div><div className="cw-panel cw-table-panel"><TenantsTable tenants={tenants} onChange={onChange}/></div></>}
function TenantsTable({tenants,onChange,compact=false}){return <div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>BUSINESS</th><th>OWNER</th><th>PLAN</th><th>BRANCHES</th><th>SUBSCRIPTION</th><th>ENDS</th>{!compact&&<th/>}</tr></thead><tbody>{tenants.map((item,index)=><tr key={item.id}><td><div className="cw-person-cell"><div className={`cw-tenant-avatar avatar-${index%4}`}><Store size={16}/></div><span><b>{item.name}</b><small>Joined {item.createdAt}</small></span></div></td><td>{item.owner}</td><td><span className="cw-plan-chip">{item.plan}</span></td><td>{item.branches}</td><td><StatusPill status={item.status}/></td><td>{item.endsAt}</td>{!compact&&<td><select className="cw-status-select" value={item.status} onChange={(event)=>onChange(item,event.target.value)}><option>TRIAL</option><option>ACTIVE</option><option>EXPIRING SOON</option><option>EXPIRED</option><option>SUSPENDED</option></select></td>}</tr>)}</tbody></table></div>}

function PlansPage({plans,tenants,onAdd}){const defaults=[{name:'Starter',price:2900,days:30,features:'1 branch · 3 staff · Core operations'}, {name:'Growth',price:4900,days:30,features:'3 branches · 15 staff · Reports & loyalty'}, {name:'Enterprise',price:9900,days:30,features:'Unlimited branches · Priority support'}];const items=[...defaults,...plans];return <><PageHeading title="Plans & billing" subtitle="Flexible subscription periods and plan controls for car wash tenants." action={<button className="cw-primary" onClick={onAdd}><Plus size={16}/> Create plan</button>}/><div className="cw-service-grid plan-grid">{items.map((plan,index)=><article className="cw-service-card cw-plan-product" key={`${plan.name}-${index}`}><div className="cw-service-head"><div className={`cw-service-icon service-${index%4}`}><Wallet size={19}/></div><span className="cw-active-tag"><i/>AVAILABLE</span></div><span className="cw-service-category">{plan.days||30} DAY SUBSCRIPTION</span><h2>{plan.name}</h2><p>{plan.features}</p><div className="cw-service-price"><span>Subscription price</span><b>{formatKes(plan.price)}<small> / period</small></b></div><div className="cw-service-price"><span>Businesses on plan</span><b>{tenants.filter((tenant)=>tenant.plan===plan.name).length}</b></div><span className="cw-plan-status">Available for tenant assignment</span></article>)}</div><div className="cw-note-box"><ShieldCheck size={17}/><span>Expired accounts enter restricted mode. Their records remain available for billing, audit and reactivation.</span></div></>}

function AuditPage({rows}){return <><PageHeading title="Audit & security" subtitle="Recent operational events and sensitive account activity."/><div className="cw-security-banner"><ShieldCheck size={23}/><span><b>Tenant isolation is enforced</b><small>Business records are scoped to the signed in workspace.</small></span><StatusPill status="ACTIVE"/></div><div className="cw-panel cw-table-panel"><div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>EVENT</th><th>DETAIL</th><th>TIME</th><th>RESULT</th></tr></thead><tbody>{rows.map((row)=><tr key={row.id}><td><b>{row.action}</b></td><td>{row.detail}</td><td>{row.time}</td><td><span className="cw-pay-state paid"><CheckCircle2 size={13}/> Recorded</span></td></tr>)}</tbody></table></div></div></>}

function SettingsPage({db,onSave}){const [name,setName]=useState(db.settings.businessName);const [branch,setBranch]=useState(db.settings.branch);const [rate,setRate]=useState(String(db.settings.loyaltyRate));return <><PageHeading title="Business settings" subtitle="Set the workspace details used across your operations."/><div className="cw-settings-grid"><div className="cw-panel cw-settings-panel"><div className="cw-panel-head"><div><h2>Business profile</h2><p>Workspace identity and branch settings</p></div></div><label className="cw-form-label">BUSINESS NAME<input value={name} onChange={(e)=>setName(e.target.value)}/></label><label className="cw-form-label">PRIMARY BRANCH<input value={branch} onChange={(e)=>setBranch(e.target.value)}/></label><label className="cw-form-label">LOYALTY EARN RATE<input type="number" min="0" value={rate} onChange={(e)=>setRate(e.target.value)}/><small>Points awarded for each KES spent on a closed order.</small></label><button className="cw-primary" onClick={()=>onSave({businessName:name,branch,loyaltyRate:Math.max(0,K(rate))})}>Save settings <Check size={16}/></button></div><div className="cw-panel cw-info-panel"><ShieldCheck size={22}/><h3>Your workspace is tenant scoped</h3><p>Business users see records belonging to their own organization. Role access determines which actions appear in the workspace.</p><div><span>Business</span><b>{db.settings.businessName}</b></div><div><span>Currency</span><b>Kenyan Shilling (KES)</b></div><div><span>Workspace role</span><b>Business Admin</b></div></div></div></>}

function ProfilePage({user,tenant,onLogout}){return <><PageHeading title="My profile" subtitle="Your account and workspace access."/><div className="cw-profile-card"><div className="cw-profile-avatar">{user.name.split(' ').map((part)=>part[0]).slice(0,2).join('')}</div><h2>{user.name}</h2><span>{user.role}</span><div className="cw-profile-detail"><small>EMAIL</small><b>{user.email}</b></div><div className="cw-profile-detail"><small>WORKSPACE</small><b>{tenant?.name||'Platform owner'}</b></div><button className="cw-secondary" onClick={onLogout}><LogOut size={16}/> Sign out</button></div></>}

function PageHeading({title,subtitle,action}){return <div className="cw-page-heading compact"><div><h1>{title}</h1><p>{subtitle}</p></div>{action&&<div className="cw-heading-actions">{action}</div>}</div>}
function MetricCard({label,value,note,icon:Icon}){return <div className="cw-metric"><div className="cw-metric-top"><span>{label}</span><i className="tone-blue"><Icon size={18}/></i></div><strong>{value}</strong><small>{note}</small></div>}
function EmptyPanel({title,text}){return <div className="cw-empty-panel"><Sparkles size={23}/><b>{title}</b><span>{text}</span></div>}
function SalesChart(){const data=[['Mon',38],['Tue',55],['Wed',43],['Thu',76],['Fri',61],['Sat',91],['Sun',48]];return <div className="cw-chart"><div className="cw-chart-y"><span>30k</span><span>20k</span><span>10k</span><span>0</span></div><div className="cw-chart-body"><div className="cw-chart-grid"><i/><i/><i/><i/></div><div className="cw-bars">{data.map(([day,height],index)=><div className="cw-bar-col" key={day}><div className={`cw-bar ${index===5?'highlight':''}`} style={{height:`${height}%`}}><i/></div><small>{day}</small></div>)}</div></div></div>}

function FormModal({type,db,tenantId,onClose,onSubmit}){const [form,setForm]=useState({serviceIds:db.services.filter((item)=>item.tenant_id===tenantId&&item.active).slice(0,1).map((item)=>item.id),paymentStatus:'PAID',method:'Cash',role:'Washer',plan:'Starter',days:'30',endsAt:'2026-10-24'});const [saving,setSaving]=useState(false);const set=(key,value)=>setForm((current)=>({...current,[key]:value}));function field(key,label,placeholder='',kind='text',required=true){return <label className="cw-form-label">{label}<input required={required} type={kind} placeholder={placeholder} value={form[key]??''} onChange={(event)=>set(key,event.target.value)}/></label>;}
  const title={order:'Check in a vehicle',customer:'Add a customer',service:'Add a service',staff:'Add team member',tenant:'Add business',plan:'Create subscription plan'}[type]||'Add record';
  function submit(event){event.preventDefault();setSaving(true);onSubmit(form);setSaving(false);}
  return <div className="cw-modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><form className="cw-modal" onSubmit={submit}><div className="cw-modal-head"><div><span className="cw-overline">{type==='order'?'FRONT DESK':type==='tenant'?'PLATFORM CONTROL':'WORKSPACE'}</span><h2>{title}</h2><p>{type==='order'?'Customer, vehicle, service, payment and washer assignment.':'Enter the details to add this record.'}</p></div><button type="button" className="cw-icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div><div className="cw-modal-fields">
    {type==='order'&&<><div className="cw-form-section">CUSTOMER DETAILS</div>{field('customer','Customer name','e.g. Grace Wanjiku')}{field('phone','Phone number','07xx xxx xxx','tel')}{field('email','Email (optional)','name@email.com','email',false)}<div className="cw-form-section">VEHICLE</div>{field('registration','Registration','KDA 123A')}{field('make','Make','Toyota')}{field('model','Model','Axio')}<div className="cw-two-fields">{field('color','Color','Silver','text',false)}<label className="cw-form-label">WASHER<select required value={form.washerId||''} onChange={(e)=>set('washerId',e.target.value)}><option value="">Leave in waiting queue</option>{db.staff.filter((item)=>item.tenant_id===tenantId&&item.role==='Washer'&&item.status==='Active').map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div><div className="cw-form-section">SERVICE & PAYMENT</div><label className="cw-form-label">SERVICE<select required multiple value={form.serviceIds} onChange={(event)=>set('serviceIds',Array.from(event.target.selectedOptions).map((option)=>option.value))} size="3">{db.services.filter((item)=>item.tenant_id===tenantId&&item.active).map((item)=><option value={item.id} key={item.id}>{item.name} — {formatKes(item.price)}</option>)}</select><small>Use Ctrl / Command to select more than one service.</small></label><div className="cw-two-fields"><label className="cw-form-label">PAYMENT STATUS<select value={form.paymentStatus} onChange={(e)=>set('paymentStatus',e.target.value)}><option value="PAID">Paid at reception</option><option value="UNPAID">Pay at collection</option></select></label><label className="cw-form-label">METHOD<select value={form.method} onChange={(e)=>set('method',e.target.value)}><option>Cash</option><option>M-Pesa</option><option>Card</option><option>Wallet</option></select></label></div></>}
    {type==='customer'&&<>{field('name','Full name','Customer name')}{field('phone','Phone number','07xx xxx xxx','tel')}{field('email','Email (optional)','name@email.com','email',false)}<div className="cw-form-section">VEHICLE (OPTIONAL)</div>{field('registration','Registration','KDA 123A','text',false)}<div className="cw-two-fields">{field('make','Make','Toyota','text',false)}{field('model','Model','Axio','text',false)}</div></>}
    {type==='service'&&<>{field('name','Service name','e.g. Engine bay clean')}{field('category','Category','Exterior / Interior') }<div className="cw-two-fields">{field('price','Customer price (KES)','500','number')}{field('commission','Washer commission (KES)','100','number')}</div>{field('duration','Estimated minutes','30','number')}</>}
    {type==='staff'&&<>{field('name','Full name','Team member')}{field('email','Email','worker@example.com','email')}<label className="cw-form-label">ROLE<select value={form.role} onChange={(e)=>set('role',e.target.value)}><option>Washer</option><option>Receptionist</option><option>Business Admin</option></select></label>{field('branch','Branch','Westlands', 'text',false)}</>}
    {type==='tenant'&&<>{field('name','Business name','Car wash name')}{field('owner','Business owner','Owner name')}<label className="cw-form-label">PLAN<select value={form.plan} onChange={(e)=>set('plan',e.target.value)}><option>Starter</option><option>Growth</option><option>Enterprise</option></select></label>{field('endsAt','Subscription ends','2026-10-24','date')}</>}
    {type==='plan'&&<>{field('name','Plan name','Growth')}{field('price','Price per period (KES)','4900','number')}{field('days','Subscription length in days','30','number')}{field('features','Included features','Branches, users, reports')}</>}
  </div><div className="cw-modal-actions"><button type="button" className="cw-secondary" onClick={onClose}>Cancel</button><button className="cw-primary" disabled={saving}>{saving?<span className="cw-spinner"/>:<><Check size={16}/>{type==='order'?'Create wash order':'Save record'}</>}</button></div></form></div>;
}
