import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, BadgeCheck, Banknote,
  Bell, CalendarDays, CarFront, Check, CheckCircle2, ChevronDown, ChevronRight,
  CircleDollarSign, Clock3, CreditCard, Droplets, FileBarChart2, Gauge,
  Download, History, LayoutDashboard, Languages, LogOut, Menu, MoreHorizontal, Play, Plus, Search,
  Settings, ShieldCheck, Sparkles, Store, Sun, Moon, UserRound, Users, Wallet, Waves, X, Zap, Eye, EyeOff
} from 'lucide-react';
import { supabaseBrowser, supabaseConfigMessage } from '../services/supabaseBrowser.js';
import { dbMethod, loadLiveWorkspace } from './liveWorkspace.js';
import {
  clearLegacyBrowserData, clearSession, demoUsers, formatKes, getSession, markUserSeen,
  newId, readDb, saveSession, todayLabel, wasUserSeen
} from './model.js';

const ROLE_NAV = {
  'SaaS Super Admin': [
    ['overview','Overview',LayoutDashboard],['tenants','Businesses',Store],['plans','Plans & billing',Wallet],['reports','Platform reports',FileBarChart2],['audit','Audit & security',ShieldCheck]
  ],
  'Business Admin': [
    ['overview','Overview',LayoutDashboard],['jobs','Wash queue',Waves],['customers','Customers & vehicles',Users],['services','Services & pricing',Sparkles],['staff','Staff',Users],['payments','Payments',CreditCard],['commissions','Commissions',CircleDollarSign],['loyalty','Loyalty',BadgeCheck],['reports','Reports',FileBarChart2],['plans-billing','Plans & billing',Wallet],['settings','Settings',Settings]
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
const IDLE_LOGOUT_MS = 30 * 60 * 1000;
const activityKey = (userId) => `osha-cw-last-activity:${userId}`;

export default function CarWashApp() {
  const [db, setDb] = useState(readDb);
  const [user, setUser] = useState(() => supabaseBrowser ? null : getSession());
  const [authLoading, setAuthLoading] = useState(Boolean(supabaseBrowser));
  const [authRestoreError, setAuthRestoreError] = useState('');
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const inviteLink = new URLSearchParams(window.location.search).has('invite');
  const initialAuthRoute=window.location.hash.match(/^#\/(login|register)(?:\?.*)?$/)?.[1];
  const [showLogin, setShowLogin] = useState(()=>inviteLink||Boolean(initialAuthRoute)||window.sessionStorage.getItem('cw-auth-view')==='login');
  const [authMode, setAuthMode] = useState(()=>inviteLink?'register':initialAuthRoute==='register'?'register':initialAuthRoute==='admin'||initialAuthRoute==='login'?'login':window.sessionStorage.getItem('cw-auth-mode')||'login');
  const [screen, setScreen] = useState(()=>window.sessionStorage.getItem('cw-workspace-screen')||'overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme,setTheme]=useState(()=>window.localStorage.getItem('osha-cw-theme')==='dark'?'dark':'light');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notificationsRef = useRef([]);
  const sidebarRef=useRef(null);
  const [modal, setModal] = useState('');
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState('');

  useEffect(()=>{ clearLegacyBrowserData(); },[]);
  useEffect(()=>{window.localStorage.setItem('osha-cw-theme',theme);},[theme]);
  useEffect(()=>{if(!user?.authUserId||!supabaseBrowser)return undefined;let active=true;supabaseBrowser.auth.getUser().then(({data,error})=>{if(active&&!error){const preference=data?.user?.user_metadata?.oshaHubTheme;if(['light','dark'].includes(preference))setTheme(preference);}});return()=>{active=false;};},[user?.authUserId]);
  function closeMenuFromOutside(event){if(sidebarRef.current?.contains(event.target))return;if(window.matchMedia('(max-width: 980px)').matches){if(menuOpen)setMenuOpen(false);return;}if(!sidebarCollapsed)setSidebarCollapsed(true);}
  useEffect(()=>{
    if(!supabaseBrowser){setAuthLoading(false);return undefined;}
    let active=true;
    const restore=async()=>{
      setAuthLoading(true);setAuthRestoreError('');
      try{
        const {data,error}=await supabaseBrowser.auth.getSession();
        if(error)throw error;
        if(!active)return;
        const authUser=data.session?.user;
        if(!authUser)return;
        const key=activityKey(authUser.id);
        const lastActivity=Number(window.localStorage.getItem(key)||0);
        if(lastActivity&&Date.now()-lastActivity>=IDLE_LOGOUT_MS){
          await supabaseBrowser.auth.signOut();
          window.localStorage.removeItem(key);clearSession();setUser(null);setShowLogin(false);window.location.hash='/';
          return;
        }
        if(!lastActivity)window.localStorage.setItem(key,String(Date.now()));
        const {data:memberships,error:membershipError}=await supabaseBrowser.from('carwash_memberships').select('id,role,tenant_id,full_name,phone,branch,status').eq('user_id',authUser.id).eq('status','ACTIVE').order('role').limit(10);
        if(membershipError)throw membershipError;
        const membership=(memberships||[]).find((item)=>['BUSINESS_ADMIN','RECEPTIONIST','WASHER'].includes(item.role));
        if(!membership){await supabaseBrowser.auth.signOut();window.localStorage.removeItem(key);setShowLogin(true);setAuthRestoreError('This account has no active business workspace membership. Sign in with an approved business or staff account.');return;}
        const role=({BUSINESS_ADMIN:'Business Admin',RECEPTIONIST:'Receptionist',WASHER:'Washer'})[membership.role];
        const {data:tenant,error:tenantError}=await supabaseBrowser.from('carwash_tenants').select('name').eq('id',membership.tenant_id).single();
        if(tenantError)throw tenantError;
        const {data:canOperate,error:billingError}=await supabaseBrowser.rpc('carwash_can_operate',{target_tenant:membership.tenant_id});
        if(billingError)throw billingError;
        {const {error:noticeError}=await supabaseBrowser.rpc('carwash_notify_billing_status',{target_tenant:membership.tenant_id});if(noticeError)throw noticeError;}
        const {data:messages,error:messageError}=await supabaseBrowser.from('carwash_user_messages').select('id,body').eq('user_id',authUser.id).is('read_at',null).order('created_at',{ascending:false}).limit(1);
        if(messageError)throw messageError;
        if(active){const session={id:authUser.id,authUserId:authUser.id,staffId:membership.id,email:authUser.email,name:membership.full_name||authUser.email,role,tenant_id:membership.tenant_id,tenant_name:tenant.name,branch:membership.branch,billingRestricted:canOperate===false,activationMessage:canOperate===false?`Your ${tenant.name} workspace is restricted because its plan has expired. Make a payment to continue using ${tenant.name}.`:messages?.[0]?.body};saveSession(session);setUser(session);}
      }catch(error){if(active)setAuthRestoreError(error.message||'Unable to reconnect your workspace. Check your connection and retry.');}
      finally{if(active)setAuthLoading(false);}
    };
    restore();
    return()=>{active=false;};
  },[restoreAttempt]);
  useEffect(()=>{
    if(!user?.authUserId||!user.tenant_id)return;
    let active=true; setLiveLoading(true); setLiveError('');
    loadLiveWorkspace(user).then(({db:liveDb})=>{if(active)setDb(liveDb);}).catch((error)=>{if(active)setLiveError(error?.message||'Unable to load this business workspace.');}).finally(()=>{if(active)setLiveLoading(false);});
    return()=>{active=false;};
  },[user?.authUserId,user?.tenant_id]);
  useEffect(()=>{
    if(!user?.authUserId)return;
    let active=true;
    const refresh=()=>supabaseBrowser.from('carwash_user_messages').select('id,kind,subject,body,read_at,created_at,reference_key').eq('user_id',user.authUserId).order('created_at',{ascending:false}).limit(50)
      .then(({data,error})=>{if(!active||error)return;const next=data||[];const fresh=next.find((item)=>item.reference_key?.startsWith('PLAN_REMINDER:')||item.reference_key?.startsWith('PLAN_OVERDUE:'));if(fresh&&!notificationsRef.current.some((item)=>item.id===fresh.id))setToast(fresh.body);notificationsRef.current=next;setNotifications(next);});
    refresh();
    const timer=window.setInterval(async()=>{
      const {error:reminderError}=await supabaseBrowser.rpc('carwash_notify_billing_status',{target_tenant:user.tenant_id});
      const {data:canOperate,error:billingError}=await supabaseBrowser.rpc('carwash_can_operate',{target_tenant:user.tenant_id});
      if(!active)return;
      if(!reminderError&&!billingError&&Boolean(canOperate)!==Boolean(user.billingRestricted)){
        const next={...user,billingRestricted:canOperate===false,activationMessage:canOperate===false?`Your ${user.tenant_name||'business'} workspace is restricted because its plan has expired. Make a payment to continue using ${user.tenant_name||'your business workspace'}.`:''};
        setUser(next);saveSession(next);
        if(canOperate===false)setToast(next.activationMessage);
      }
      refresh();
    },60000);
    const messageTimer=window.setInterval(refresh,30000);
    return()=>{active=false;window.clearInterval(timer);window.clearInterval(messageTimer);};
  },[user?.authUserId,user?.tenant_id,user?.billingRestricted]);
  useEffect(()=>{
    if(!user?.authUserId)return undefined;
    const key=activityKey(user.authUserId);
    const updateActivity=()=>window.localStorage.setItem(key,String(Date.now()));
    const expireIfIdle=()=>{
      const lastActivity=Number(window.localStorage.getItem(key)||Date.now());
      if(Date.now()-lastActivity<IDLE_LOGOUT_MS)return;
      window.localStorage.removeItem(key);
      void supabaseBrowser.auth.signOut().finally(()=>{clearSession();setUser(null);setMenuOpen(false);setModal('');setShowLogin(false);window.location.hash='/';});
    };
    if(!window.localStorage.getItem(key))updateActivity();
    const timer=window.setInterval(expireIfIdle,15000);
    window.addEventListener('pointerdown',updateActivity,{passive:true});
    window.addEventListener('keydown',updateActivity);
    window.addEventListener('touchstart',updateActivity,{passive:true});
    window.addEventListener('scroll',updateActivity,{passive:true});
    window.addEventListener('storage',expireIfIdle);
    return()=>{window.clearInterval(timer);window.removeEventListener('pointerdown',updateActivity);window.removeEventListener('keydown',updateActivity);window.removeEventListener('touchstart',updateActivity);window.removeEventListener('scroll',updateActivity);window.removeEventListener('storage',expireIfIdle);};
  },[user?.authUserId]);
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

  useEffect(()=>{
    if(!user)return;
    const saved=window.sessionStorage.getItem('cw-workspace-screen');
    if(!myNav.some(([key])=>key===screen))setScreen(myNav.some(([key])=>key===saved)?saved:'overview');
  },[user?.id,role]);

  function patchDb(edit) { setDb((old)=>edit(JSON.parse(JSON.stringify(old)))); }
  function notify(message) { setToast(message); }
  async function changeTheme(nextTheme){setTheme(nextTheme);if(!user?.authUserId||!supabaseBrowser)return;try{const {error}=await supabaseBrowser.auth.updateUser({data:{oshaHubTheme:nextTheme}});if(error)notify('Theme updated on this device, but could not sync to your OshaHub account.');}catch{notify('Theme updated on this device, but could not sync to your OshaHub account.');}}
  function navigate(key) { setScreen(key); setMenuOpen(false); setQuery(''); setFilter('All'); }
  function login(selected) {
    if(!selected)return;
    const staff = selected.role==='Washer' ? db.staff.find((item)=>item.email===selected.email) : null;
    const session={...selected, ...(staff?{staffId:staff.id}:{}), signedAt:new Date().toISOString()};
    setToast(selected.activationMessage || `${wasUserSeen(selected.email)?'Welcome back':'Welcome'}, ${selected.name.split(' ')[0]}`);
    markUserSeen(selected.email);
    window.sessionStorage.removeItem('cw-auth-view');window.sessionStorage.removeItem('cw-auth-mode');window.location.hash='/';
    saveSession(session); setUser(session);
  }
  function logout() { if(supabaseBrowser&&user?.authUserId){window.localStorage.removeItem(activityKey(user.authUserId));void supabaseBrowser.auth.signOut();} clearSession(); setUser(null); setModal(''); window.location.hash='/'; }

  function updateJob(id, action) {
    const transitions={ assign:['WAITING','ASSIGNED'], start:['ASSIGNED','IN PROGRESS'], complete:['IN PROGRESS','COMPLETED'], ready:['COMPLETED','READY'], deliver:['READY','DELIVERED'], close:['DELIVERED','CLOSED'] };
    const [from,to]=transitions[action]||[];
    if(user.authUserId){
      if(user.billingRestricted){notify('This plan is overdue. Wash operations are read-only until the plan is reactivated.');return;}
      const state={assign:'ASSIGNED',start:'IN PROGRESS',complete:'COMPLETED',ready:'READY',deliver:'DELIVERED',close:'CLOSED'}[action];
      (async()=>{try{
        if(action==='assign'){
          const washer=db.staff.find((person)=>person.tenant_id===tenantId&&person.role==='Washer'&&person.status==='Active');
          const {error}=await supabaseBrowser.rpc('carwash_assign_order',{target_order:id,target_washer:washer?.id||null});if(error)throw error;
        } else {const {error}=await supabaseBrowser.rpc('carwash_transition_order',{target_order:id,target_state:state});if(error)throw error;}
        const {db:next}=await loadLiveWorkspace(user);setDb(next);notify(action==='complete'?'Wash completed · commission added to the ledger.':`Job moved to ${state.toLowerCase()}.`);
      }catch(error){notify(error.message||'Could not update this wash order.');}})();
      return;
    }
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
    if(user.authUserId){
      if(user.billingRestricted){notify('This plan is overdue. Payments are restricted until the plan is reactivated.');return;}
      (async()=>{try{const outstanding=Number((job.total-(job.paidAmount||0)).toFixed(2));const {error}=await supabaseBrowser.rpc('carwash_record_payment',{target_order:job.id,paid_amount:outstanding,payment_method:'CASH',payment_reference:null});if(error)throw error;const {db:next}=await loadLiveWorkspace(user);setDb(next);notify('Payment recorded.');}catch(error){notify(error.message||'Could not record payment.');}})();
      return;
    }
    patchDb((next)=>{
      const item=next.jobs.find((row)=>row.id===job.id);if(!item||item.paymentStatus==='PAID')return next;
      item.paymentStatus='PAID';item.paymentMethod='Cash';
      next.payments.unshift({id:newId('pay'),tenant_id:item.tenant_id,jobId:item.id,customerId:item.customerId,amount:item.total,method:'Cash',status:'PAID',reference:`CASH-${item.id}`,time:shortTime()});
      next.audit.unshift({id:newId('evt'),tenant_id:item.tenant_id,action:'Payment recorded',detail:`${formatKes(item.total)} cash · ${item.id}`,time:shortTime()});return next;
    }); notify('Payment recorded.');
  }

  async function submitModal(form) {
    const tenant_id=tenantId;
    if(user.authUserId){
      try{
        if(user.billingRestricted)throw new Error('This plan is overdue. Workspace changes are restricted until the plan is reactivated.');
        if(modal==='order'){
          let customer=db.customers.find((item)=>item.phone.trim()===form.phone.trim());
          if(!customer){const {data,error}=await supabaseBrowser.from('carwash_customers').insert({tenant_id,full_name:form.customer.trim(),phone:form.phone.trim(),email:form.email.trim()||null}).select().single();if(error)throw error;customer={id:data.id};}
          let vehicle=db.vehicles.find((item)=>item.registration.toLowerCase()===form.registration.trim().toLowerCase());
          if(!vehicle){const {data,error}=await supabaseBrowser.from('carwash_vehicles').insert({tenant_id,customer_id:customer.id,registration:form.registration.trim().toUpperCase(),make:form.make.trim(),model:form.model.trim(),color:form.color.trim()||null}).select().single();if(error)throw error;vehicle={id:data.id};}
          const selectedServices=db.services.filter((service)=>form.serviceIds.includes(service.id));
          if(!selectedServices.length)throw new Error('Choose at least one active service.');
          const {data:order,error:orderError}=await supabaseBrowser.rpc('carwash_create_order',{target_tenant:tenant_id,target_customer:customer.id,target_vehicle:vehicle.id,target_services:selectedServices.map((service)=>service.id),target_washer:form.washerId||null});if(orderError)throw orderError;
          if(form.paymentStatus==='PAID'){const {error}=await supabaseBrowser.rpc('carwash_record_payment',{target_order:order.id,paid_amount:Number(order.subtotal_kes),payment_method:dbMethod(form.method)});if(error)throw error;}
        } else if(modal==='customer'){
          const {data:customer,error}=await supabaseBrowser.from('carwash_customers').insert({tenant_id,full_name:form.name.trim(),phone:form.phone.trim(),email:form.email.trim()||null}).select().single();if(error)throw error;
          if(form.registration.trim()){const {error:vehicleError}=await supabaseBrowser.from('carwash_vehicles').insert({tenant_id,customer_id:customer.id,registration:form.registration.trim().toUpperCase(),make:form.make.trim()||'Unknown',model:form.model.trim()||'Unknown'});if(vehicleError)throw vehicleError;}
        } else if(modal==='service'){
          const {error}=await supabaseBrowser.from('carwash_services').insert({tenant_id,name:form.name.trim(),category:form.category.trim()||null,price_kes:K(form.price),commission_kes:K(form.commission),estimated_minutes:K(form.duration)||30,active:true});if(error)throw error;
        } else if(modal==='staff'){
          const {data:token,error}=await supabaseBrowser.rpc('carwash_create_staff_invite',{target_tenant:tenant_id,target_phone:form.phone.trim(),target_role:form.role.toUpperCase()});if(error)throw error;
          const inviteUrl=new URL('/register',window.location.origin);inviteUrl.searchParams.set('invite',token);
          setModal('');
          try{await navigator.clipboard.writeText(inviteUrl.toString());notify('Invitation link copied. Send it to the team member; it expires in 72 hours.');}
          catch{window.prompt('Copy this secure staff invitation link. It expires in 72 hours:',inviteUrl.toString());}
          return;
        }
        const {db:next}=await loadLiveWorkspace(user);setDb(next);setModal('');notify('Saved successfully.');
      }catch(error){notify(error.message||'Could not save this change.');}
      return;
    }
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
      else if(modal==='tenant')next.tenants.unshift({id:newId('tenant'),name:form.name.trim(),owner:form.owner.trim(),plan:form.plan||'Starter',status:'TRIAL',endsAt:form.endsAt||'2026-10-24',branches:1,createdAt:new Date().toISOString().slice(0,10)});
      else if(modal==='plan')next.plans=[...(next.plans||[]),{id:newId('plan'),name:form.name.trim(),price:K(form.price),days:K(form.days),features:form.features.trim(),active:true}];
      return next;
    });
    setModal('');notify(modal==='order'?'Vehicle checked in and washer assigned.':'Saved successfully.');
  }

  const dailyRevenue=useMemo(()=>scoped(db.payments).filter((payment)=>payment.status==='PAID').reduce((sum,payment)=>sum+K(payment.amount),0),[db.payments,tenantId,role]);
  const notificationCount=notifications.filter((item)=>!item.read_at).length+scopedJobs.filter((job)=>job.paymentStatus!=='PAID').length;
  const activeCount=workerJobs.filter((job)=>['ASSIGNED','IN PROGRESS'].includes(job.status)).length;
  const readyCount=workerJobs.filter((job)=>job.status==='READY').length;
  const routeJobs=screen==='history'?workerJobs.filter((job)=>['COMPLETED','READY','DELIVERED','CLOSED'].includes(job.status)):workerJobs;
  const filteredJobs=routeJobs.filter((job)=>{
    const v=db.vehicles.find((item)=>item.id===job.vehicleId),c=db.customers.find((item)=>item.id===job.customerId),w=db.staff.find((item)=>item.id===job.washerId);
    const matches=`${job.id} ${v?.registration||''} ${v?.make||''} ${v?.model||''} ${c?.name||''} ${w?.name||''} ${job.status}`.toLowerCase().includes(query.toLowerCase());
    return matches&&(filter==='All'||job.status===filter);
  });

  if(authLoading)return <WorkspaceBootScreen/>;
  if(authRestoreError)return <WorkspaceBootScreen error={authRestoreError} onRetry={()=>{setAuthRestoreError('');setRestoreAttempt((attempt)=>attempt+1);}} onSignOut={()=>{void supabaseBrowser?.auth.signOut();clearSession();setUser(null);setAuthRestoreError('');setShowLogin(false);window.location.hash='/';}}/>;
  if(!user&&!showLogin)return <PublicLandingPage onLogin={()=>{window.sessionStorage.setItem('cw-auth-view','login');window.sessionStorage.setItem('cw-auth-mode','login');window.location.hash='/login';setAuthMode('login');setShowLogin(true)}} onRegister={()=>{window.sessionStorage.setItem('cw-auth-view','login');window.sessionStorage.setItem('cw-auth-mode','register');window.location.hash='/register';setAuthMode('register');setShowLogin(true)}} />;
  if(!user)return <LoginScreen initialMode={authMode} onLogin={login} onBack={()=>{window.sessionStorage.removeItem('cw-auth-view');window.sessionStorage.removeItem('cw-auth-mode');window.sessionStorage.removeItem('cw-auth-scroll');window.location.hash='/';window.scrollTo({top:0,behavior:'instant'});setShowLogin(false)}}/>;
  if(user.authUserId&&liveLoading)return <WorkspaceBootScreen message="Loading your wash floor…"/>;
  if(user.authUserId&&!user.tenant_id)return <div className="cw-authenticated-gate"><div className="cw-gate-card"><img src="/osha-hub-logo-light.svg" alt="OshaHub"/><span className="cw-login-kicker">WORKSPACE ACCESS</span><h1>No business workspace assigned</h1><p>Ask the platform administrator to check your active membership.</p><button className="cw-primary" onClick={logout}>Sign out</button></div></div>;

  return <div className={`cw-shell ${theme==='dark'?'theme-dark':''}`} onPointerDownCapture={closeMenuFromOutside}>
    <aside ref={sidebarRef} className={`cw-sidebar ${menuOpen?'is-open':''} ${sidebarCollapsed?'is-collapsed':''}`}>
      <div className="cw-brand"><img src="/osha-hub-logo.svg" alt="OshaHub"/><button className="cw-icon-button cw-sidebar-brand-toggle" onClick={()=>{if(window.matchMedia('(max-width: 980px)').matches)setMenuOpen(false);else setSidebarCollapsed((collapsed)=>!collapsed);}} aria-label={menuOpen?'Close side menu':sidebarCollapsed?'Expand side menu':'Collapse side menu'}><Menu size={19}/></button></div>
      <div className="cw-workspace"><div className="cw-workspace-mark"><Store size={16}/></div><div className="cw-workspace-copy"><b>{role==='SaaS Super Admin'?'Platform owner':tenant?.name||db.settings.businessName}</b><span>{ROLE_COPY[role]}</span></div><ChevronDown size={15}/></div>
      <div className="cw-nav-label">WORKSPACE</div>
      <nav className="cw-nav">{myNav.map(([key,label,Icon])=><button key={key} className={`cw-nav-item ${screen===key?'active':''}`} onClick={()=>navigate(key)}><Icon size={18}/><span>{label}</span>{key==='jobs'&&activeCount>0&&<i>{activeCount}</i>}</button>)}</nav>
      <div className="cw-sidebar-bottom"><div className="cw-plan-card"><div className="cw-plan-icon"><Sparkles size={15}/></div><div><b>{role==='SaaS Super Admin'?'Platform health':`${tenant?.plan||'Growth'} plan`}</b><small>{role==='SaaS Super Admin'?'All services operational':`${tenant?.status||'ACTIVE'} subscription`}</small></div><ArrowRight size={15}/></div><button className="cw-user-menu" onClick={()=>navigate('profile')}><div className="cw-avatar">{user.name.split(' ').map((part)=>part[0]).slice(0,2).join('')}</div><span><b>{user.name}</b><small>{user.role}</small></span><MoreHorizontal size={17}/></button><button className="cw-signout" onClick={logout}><LogOut size={16}/>Sign out</button></div>
    </aside>
    {!menuOpen&&<button className="cw-icon-button cw-mobile-open" onClick={()=>setMenuOpen(true)} aria-label="Open side menu"><Menu size={19}/></button>}
    {menuOpen&&<button className="cw-mobile-scrim" onPointerDown={()=>setMenuOpen(false)} onClick={()=>setMenuOpen(false)} aria-label="Close navigation"/>}
    <main className="cw-main">
      <header className="cw-topbar"><div className="cw-crumb"><span>{role==='SaaS Super Admin'?'Platform':tenant?.name}</span><ChevronRight size={14}/><b>{NAV_TITLES[screen]||'My profile'}</b></div><div className="cw-top-actions"><span className="cw-date"><CalendarDays size={15}/>{todayLabel()}</span><div className="cw-notification-wrap"><button className="cw-icon-button cw-notification" onClick={()=>setNotificationsOpen((open)=>!open)} aria-label="Notifications" aria-expanded={notificationsOpen}><Bell size={18}/>{notificationCount>0&&<i>{notificationCount>99?'99+':notificationCount}</i>}</button>{notificationsOpen&&<div className="cw-notification-panel"><div className="cw-notification-head"><b>Notification center</b><button onClick={()=>{const now=new Date().toISOString();supabaseBrowser.from('carwash_user_messages').update({read_at:now}).eq('user_id',user.authUserId).is('read_at',null).then(()=>setNotifications((old)=>old.map((item)=>({...item,read_at:item.read_at||now}))));}}>Mark all read</button></div>{scopedJobs.filter((job)=>job.paymentStatus!=='PAID').length>0&&<button className="cw-notification-item unpaid" onClick={()=>{navigate('payments');setNotificationsOpen(false);}}><b>{scopedJobs.filter((job)=>job.paymentStatus!=='PAID').length} unpaid wash order{scopedJobs.filter((job)=>job.paymentStatus!=='PAID').length===1?'':'s'}</b><span>Payments are still due at the front desk.</span><small>Open payments <ArrowRight size={12}/></small></button>}{notifications.map((item)=><button key={item.id} className={`cw-notification-item ${item.read_at?'':'unread'}`} onClick={()=>{if(!item.read_at){const now=new Date().toISOString();supabaseBrowser.from('carwash_user_messages').update({read_at:now}).eq('id',item.id).then(()=>setNotifications((old)=>old.map((entry)=>entry.id===item.id?{...entry,read_at:now}:entry)));}}}><b>{item.subject}</b><span>{item.body}</span><small>{new Date(item.created_at).toLocaleString('en-KE')}</small></button>)}{!notifications.length&&!scopedJobs.some((job)=>job.paymentStatus!=='PAID')&&<p className="cw-notification-empty">You’re all caught up.</p>}</div>}</div><div className="cw-top-avatar">{user.name.split(' ').map((part)=>part[0]).slice(0,2).join('')}</div></div></header>
      <section className="cw-page">
        {liveError&&<div className="cw-auth-alert error" role="alert">{liveError}</div>}
        {user.billingRestricted&&<div className="cw-auth-alert error" role="alert"><b>Your workspace is restricted.</b><br/>{user.activationMessage||`Make a payment to continue using ${user.tenant_name||'your business workspace'}.`}</div>}
        {!user.billingRestricted&&notifications.find((item)=>item.reference_key?.startsWith('PLAN_REMINDER:')&&!item.read_at)&&<div className="cw-auth-alert billing-reminder" role="status"><b>Subscription reminder</b><br/>{notifications.find((item)=>item.reference_key?.startsWith('PLAN_REMINDER:')&&!item.read_at)?.body}</div>}
        {screen==='overview'&&<Overview db={db} role={role} user={user} jobs={workerJobs} revenue={dailyRevenue} active={activeCount} ready={readyCount} onNavigate={navigate} onCreate={()=>setModal('order')} onTransition={updateJob} onPayment={recordPayment}/>}
        {screen==='jobs'&&<JobsPage jobs={filteredJobs} db={db} role={role} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onCreate={()=>setModal('order')} onTransition={updateJob} onPayment={recordPayment}/>}
        {screen==='history'&&<JobsPage jobs={filteredJobs} db={db} role={role} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} history onTransition={updateJob} onPayment={recordPayment}/>}
        {screen==='customers'&&<CustomersPage customers={scopedCustomers} vehicles={scoped(db.vehicles)} query={query} setQuery={setQuery} onAdd={()=>setModal('customer')}/>}
        {screen==='services'&&<ServicesPage services={scopedServices} onAdd={()=>setModal('service')} onChange={async(service)=>{if(user.authUserId){if(user.billingRestricted){notify('This plan is overdue. Workspace changes are read-only.');return;}const {error}=await supabaseBrowser.from('carwash_services').update({active:!service.active}).eq('id',service.id).eq('tenant_id',tenantId);if(error){notify(error.message);return;}const {db:next}=await loadLiveWorkspace(user);setDb(next);}else patchDb((next)=>{const item=next.services.find((row)=>row.id===service.id);if(item)item.active=!item.active;return next;});}}/>}
        {screen==='staff'&&<StaffPage staff={scopedStaff} jobs={scopedJobs} onAdd={()=>setModal('staff')} onChange={async(person)=>{if(user.authUserId){if(user.billingRestricted){notify('This plan is overdue. Workspace changes are read-only.');return;}const {error}=await supabaseBrowser.rpc('carwash_update_staff_status',{target_membership:person.id,next_status:person.status==='Active'?'SUSPENDED':'ACTIVE'});if(error){notify(error.message);return;}const {db:next}=await loadLiveWorkspace(user);setDb(next);}else patchDb((next)=>{const item=next.staff.find((row)=>row.id===person.id);if(item)item.status=item.status==='Active'?'Inactive':'Active';return next;});}}/>}
        {screen==='payments'&&<PaymentsPage payments={scoped(db.payments)} jobs={scopedJobs} customers={scopedCustomers} onPayment={recordPayment}/>}
        {screen==='plans-billing'&&<CustomerBillingPage billing={db.billing} tenant={tenant} onRefresh={async()=>{const {db:next}=await loadLiveWorkspace(user);setDb(next);}} onRequest={async(payload)=>{let requestId=payload.requestId||null;try{if(payload.type==='TRIAL_EXTENSION'){const {error}=await supabaseBrowser.rpc('carwash_request_billing_action',{p_request_type:'TRIAL_EXTENSION',p_plan_id:null,p_payment_method:null,p_payment_reference:null,p_branch_count:1});if(error)throw error;notify('Your extra 7-day trial request has been sent to OshaHub.');const {db:next}=await loadLiveWorkspace(user);setDb(next);return {};}if(payload.type!=='STK_RETRY'){const {data,error}=await supabaseBrowser.rpc('carwash_request_billing_action',{p_request_type:'PLAN_PURCHASE',p_plan_id:payload.planId,p_payment_method:'M-PESA',p_payment_reference:null,p_branch_count:payload.branchCount||1});if(error)throw error;requestId=data.id;const {db:next}=await loadLiveWorkspace(user);setDb(next);}const {data,error}=await supabaseBrowser.functions.invoke('mpesa-stk',{body:{billingRequestId:requestId,phone:payload.phone}});if(error)throw new Error(error.message||'Could not connect to the M-Pesa payment service.');if(data?.error)throw new Error(data.error);const {db:next}=await loadLiveWorkspace(user);setDb(next);return {requestId:data.requestId||requestId,amountKes:data.amountKes,status:data.status};}catch(error){const {db:next}=await loadLiveWorkspace(user).catch(()=>({db:null}));if(next)setDb(next);if(error.code==='PGRST202')notify('Apply database/migrations/20261002_stk_push_split_billing.sql in Supabase, then refresh and retry.');throw error;}}}/>}
        {screen==='commissions'&&<LedgerPage title="Commission ledger" subtitle="Worker earnings are recorded against completed wash jobs." rows={scoped(db.commissions)} db={db} onReview={async(entry,status)=>{if(user.authUserId){if(user.billingRestricted){notify('This plan is overdue. Workspace changes are read-only.');return;}const {error}=await supabaseBrowser.rpc('carwash_review_commission',{ledger_entry:entry.id,next_status:status});if(error){notify(error.message);return;}const {db:next}=await loadLiveWorkspace(user);setDb(next);}else patchDb((next)=>{const row=next.commissions.find((item)=>item.id===entry.id);if(row)row.status=status;return next;});notify(status==='APPROVED'?'Commission approved.':'Commission payout recorded.');}}/>}
        {screen==='earnings'&&<EarningsPage user={user} jobs={workerJobs} commissions={scoped(db.commissions)} db={db}/>}
        {screen==='loyalty'&&<LoyaltyPage customers={scopedCustomers} ledger={scoped(db.loyalty||[])} db={db}/>}
        {screen==='reports'&&<ReportsPage jobs={scopedJobs} payments={scoped(db.payments)} commissions={scoped(db.commissions)} db={db} role={role}/>}
        {screen==='tenants'&&<TenantsPage tenants={db.tenants} onAdd={()=>setModal('tenant')} onChange={(item,status)=>patchDb((next)=>{const row=next.tenants.find((x)=>x.id===item.id);if(row)row.status=status;return next;})}/>}
        {screen==='plans'&&<PlansPage plans={db.plans||[]} tenants={db.tenants} onAdd={()=>setModal('plan')}/>}
        {screen==='audit'&&<AuditPage rows={scoped(db.audit)}/>}
        {screen==='settings'&&<SettingsPage db={db} theme={theme} onThemeChange={changeTheme} onSave={async(form)=>{if(user.authUserId){if(user.billingRestricted){notify('This plan is overdue. Workspace changes are read-only.');return;}if(!db.settingsSchemaReady){notify('Run database/migrations/20260929_tenant_settings.sql in the Supabase SQL Editor, then refresh this page.');return;}const {error}=await supabaseBrowser.rpc('carwash_update_tenant_settings',{target_tenant:tenantId,p_business_name:form.businessName,p_branch:form.branch,p_loyalty_rate:form.loyaltyRate});if(error){notify(error.message);return;}const {db:next}=await loadLiveWorkspace(user);setDb(next);}else patchDb((next)=>{next.settings={...next.settings,...form};return next;});notify('Business settings updated.');}}/>}
        {screen==='profile'&&<ProfilePage user={user} tenant={tenant} onLogout={logout}/>}
      </section>
    </main>
    {modal&&<FormModal type={modal} db={db} tenantId={tenantId} onClose={()=>setModal('')} onSubmit={submitModal}/>}
    {!!toast&&<div className="cw-toast"><CheckCircle2 size={18}/>{toast}</div>}
  </div>;
}

function WorkspaceBootScreen({message='Restoring your workspace…',error='',onRetry,onSignOut}){
  return <main className="cw-wash-loader" role="status" aria-live="polite">
    <div className="cw-loader-logo"><Droplets size={22}/><b>OSHA<i>HUB</i></b></div>
    <div className="cw-loader-car"><CarFront size={76}/><i className="cw-loader-spray"/></div>
    <h2>{error?'Workspace connection paused':message}</h2>
    <p>{error||'Restoring your secure sign-in and last workspace page'}</p>
    {error?<div className="cw-boot-actions"><button className="cw-primary" onClick={onRetry}>Retry connection</button><button className="cw-secondary" onClick={onSignOut}>Sign out and return home</button></div>:<div className="cw-loader-track"><i/></div>}
  </main>;
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
    <header className="cw-landing-header"><div className="cw-landing-nav"><a className="cw-landing-brand" href="#/" aria-label="OshaHub home" onClick={closeMenu}><img src="/osha-hub-logo-light.svg" alt="OshaHub"/></a><nav id="cw-landing-nav" className={menuOpen?'is-open':''} aria-label="Main navigation"><a href="#/product" onClick={closeMenu}>Product</a><a href="#/pricing" onClick={closeMenu}>Pricing</a><a href="#/platforms" onClick={closeMenu}>Platforms</a><a href="#/developers" onClick={closeMenu}>Developers</a><a href="#/about" onClick={closeMenu}>About Us</a><a href="#/faq" onClick={closeMenu}>FAQ</a></nav><div className="cw-landing-actions"><div className="cw-landing-language-wrap"><button className="cw-landing-language" type="button" aria-label="Language options" aria-expanded={languageOpen} onClick={()=>setLanguageOpen((open)=>!open)}><Languages size={19}/></button>{languageOpen&&<div className="cw-language-menu" role="menu"><b>LANGUAGE</b><span className="selected">English · Kenya</span><span className="unavailable">Swahili · Coming soon</span></div>}</div><button className="cw-landing-account" type="button" onClick={onLogin} aria-label="Team sign in"><UserRound size={20}/></button><button className="cw-landing-menu-button" type="button" aria-label={menuOpen?'Close menu':'Open menu'} aria-expanded={menuOpen} aria-controls="cw-landing-nav" onClick={()=>setMenuOpen((open)=>!open)}>{menuOpen?<X size={20}/>:<Menu size={20}/>}</button></div></div></header>
    <main id="home">
      {page==='home'||page===''?<>
      <section className="cw-landing-hero"><div className="cw-landing-video-stage" aria-label="Landing page video placeholder"><span><Play size={15} fill="currentColor"/> CAR WASH VIDEO SPACE · FOOTAGE CAN BE ADDED LATER</span></div><div className="cw-landing-copy"><span className="cw-landing-eyebrow"><i/> CAR WASH OPERATIONS, CONNECTED</span><h1>A smoother day<br/>at <em>every wash.</em></h1><p>Keep the front desk, wash team and business owner in sync with one clear workspace for the work that moves your car wash forward.</p><div className="cw-landing-cta"><button className="cw-primary" onClick={onRegister}>Bring your wash online <ArrowRight size={17}/></button><a href="#benefits">Explore the platform <ArrowUpRight size={16}/></a></div><div className="cw-landing-trust"><ShieldCheck size={16}/><span>Role-based access · Secure account approval · Built for mobile</span></div></div>
        <div className="cw-landing-visual" aria-label="OshaHub workspace overview"><div className="cw-workspace-preview"><div className="cw-workspace-preview-head"><span><Waves size={17}/> WASH FLOOR</span><i>LIVE</i></div><div className="cw-workspace-preview-row"><span className="is-ready"/><div><b>Vehicle check-in</b><small>Front desk</small></div><CheckCircle2 size={17}/></div><div className="cw-workspace-preview-row"><span className="is-active"/><div><b>Wash in progress</b><small>Wash team</small></div><Waves size={17}/></div><div className="cw-workspace-preview-row"><span className="is-queued"/><div><b>Ready for collection</b><small>Business owner</small></div><CheckCircle2 size={17}/></div></div></div>
      </section>
      <section className="cw-landing-trust-strip"><p>ONE CONNECTED WORKSPACE FOR YOUR WASH</p><div><span><ShieldCheck size={17}/> Role-based access</span><span><Waves size={17}/> Clear wash queue</span><span><Users size={17}/> Connected teams</span><span><CarFront size={18}/> Ready for mobile</span></div></section>
      <section className="cw-landing-portals" id="benefits"><div className="cw-landing-section-title"><span>THE OSHAHUB WORKSPACE</span><h2>Made for every part of the wash.</h2><p>Each team member gets a focused view with access set for their role.</p></div><div className="cw-landing-portal-grid" id="portals"><article><span><Store size={19}/></span><h3>Business Admin</h3><p>Review staff, services, subscriptions and the wash floor.</p><a href="#how">Manage your wash <ArrowRight size={14}/></a></article><article><span><Wallet size={19}/></span><h3>Front desk</h3><p>Check in vehicles, organize the queue and keep customer visits clear.</p><a href="#how">Follow each visit <ArrowRight size={14}/></a></article><article><span><Droplets size={19}/></span><h3>Wash team</h3><p>See assigned work and move each wash through its next step.</p><a href="#how">Keep work moving <ArrowRight size={14}/></a></article><article><span><ShieldCheck size={19}/></span><h3>Platform Admin</h3><p>Review business requests and manage platform access.</p><a href="#how">Approve access <ArrowRight size={14}/></a></article></div></section>
      <section className="cw-landing-how" id="how"><div className="cw-landing-section-title"><span>FROM SIGN-UP TO WASH FLOOR</span><h2>Get started in three simple steps.</h2><p>Clear onboarding for owners, followed by the right workspace for the team.</p></div><div className="cw-landing-step-grid"><article><div><span><Users size={22}/></span><b>01</b></div><h3>Request business access</h3><p>Share your business details and verify the email address for your account.</p></article><article><div><span><BadgeCheck size={22}/></span><b>02</b></div><h3>Get reviewed</h3><p>The platform team reviews the business request and activates approved access.</p></article><article><div><span><CarFront size={22}/></span><b>03</b></div><h3>Bring the team in</h3><p>Invite the front desk and wash team to their own role-based portals.</p></article></div></section>
      <section className="cw-landing-control"><div><span>CONTROL FROM ONE PLACE</span><h2>Know what’s happening<br/>across the wash floor.</h2><p>Keep today’s jobs, people and customer visits easy to follow as vehicles move through your wash.</p><div className="cw-landing-feature-list"><span><Check size={15}/> Follow wash progress</span><span><Check size={15}/> Give each role the right view</span><span><Check size={15}/> Keep a clear visit history</span><span><Check size={15}/> Work on phone or desktop</span></div></div><div className="cw-landing-control-art"><span className="cw-control-halo"/><span className="cw-control-orbit orbit-a">CHECK IN</span><span className="cw-control-orbit orbit-b">IN PROGRESS</span><span className="cw-control-orbit orbit-c"><ShieldCheck size={14}/> READY</span><div className="cw-control-core"><Waves size={38}/><small>WASH FLOOR</small><b>Work in motion</b></div></div></section>
      <section className="cw-landing-plans" id="pricing"><div><span>FLEXIBLE SUBSCRIPTION TERMS</span><h2>Business software<br/>built for the wash floor.</h2><p>Every plan includes the owner workspace, team tools and mobile washer app. Start with a free 7-day trial.</p><div className="cw-landing-quote"><p>Start with a clear view of the work. Add your team and branches as your wash grows.</p><small>Simple, guided business onboarding.</small></div></div><div className="cw-landing-plan-card"><div className="cw-plan-mark"><Sparkles size={18}/></div><small>OSHAHUB CAR WASH</small><h3>Plans from KES 3,900 / month</h3><p>Simple subscriptions for independent washes and growing teams.</p><ul><li><Check size={15}/> Owner and front-desk workspace</li><li><Check size={15}/> Mobile washer app</li><li><Check size={15}/> Payments, reports and team tools</li><li><Check size={15}/> Free 7-day trial</li></ul><div className="cw-plan-reassurance">KES 8,500 one-time onboarding per branch with your first paid plan.</div><button className="cw-primary" onClick={onRegister}>Request business access <ArrowRight size={16}/></button><div className="cw-plan-reassurance"><ShieldCheck size={14}/> Account access is reviewed before activation.</div></div></section>
      <section className="cw-landing-bottom"><img src="/osha-hub-logo.svg" alt="OshaHub"/><div><b>Bring your wash team together.</b><span>Request business access to get started with OshaHub.</span></div><button className="cw-primary" onClick={onRegister}>Start your request <ArrowRight size={16}/></button></section>
      </>:page==='pricing-sheet'?<PricingSheet/>:<PublicInfoPage page={page} onLogin={onLogin} onRegister={onRegister}/>}
    </main><footer className="cw-landing-footer"><div className="cw-landing-footer-brand"><img src="/osha-hub-logo.svg" alt="OshaHub"/><p><strong>Keep every wash moving.</strong><br/>Connected tools for car wash teams, owners and operators.</p></div><div className="cw-landing-footer-links"><div><b>PLATFORM</b><a href="#/product">Product</a><a href="#/platforms">Platforms</a><a href="#/pricing">Pricing</a></div><div><b>GET STARTED</b><a href="#/how-it-works">How it works</a><a href="#/faq">FAQs</a><button onClick={onRegister}>Request access</button></div><div><b>YOUR ACCOUNT</b><button onClick={onLogin}>Team sign in</button><a href="/super-admin.html">Super Admin sign in</a><a href="#/">Back to top</a></div><div><b>COMPANY</b><a href="#/about">About OshaHub</a><a href="#/faq">Contact &amp; FAQs</a><a href="#/developers">Integrations</a></div><div><b>SECURITY</b><a href="#/faq">Account approval</a><a href="#/platforms">Role-based access</a><a href="#/privacy">Privacy &amp; data</a></div></div><div className="cw-landing-footer-bottom"><span>© 2026 OshaHub · Car Wash Operations</span><span>Built for teams that keep Kenya moving.</span></div></footer>
  </div>;
}

function PublicInfoPage({page,onLogin,onRegister}){
  const content={
    product:{kicker:'OSHAHUB PRODUCT ROADMAP',title:'Run today’s wash. Grow tomorrow’s business.',intro:'OshaHub brings the wash team’s daily work together, with customer growth tools planned to help tenants get found, take bookings and build repeat business.',cards:[['Wash operations','Record customers, vehicles, selected services and payments against one wash order.'],['Online bookings','Let customers choose a service and time, while helping the team manage arrivals and parking capacity.'],['Social booking links','Share a booking page from social profiles and connect each wash to its online presence.'],['Services and packages','Showcase options such as basic washing, interior cleaning, detailing and waxing with clear prices.'],['Appointment reminders','Send booking reminders one hour, 30 minutes and 15 minutes before the appointment, plus an arrival-time message.'],['Loyalty and repeat visits','Encourage return visits with loyalty rewards, discounts and service reminders.'],['Photos, reviews and trust','Show work photos and customer testimonials to help prospective clients choose a wash.'],['Customer feedback and insights','Collect feedback for the business and understand popular services and customer response.'],['Fleet and mobile washing','Support company fleet cleaning and appointments for mobile car-wash or detailing services.']]},
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
          <div>{page==='pricing'?<button className="cw-primary" onClick={()=>{window.location.hash='/pricing-sheet'}}>View pricing <ArrowRight size={16}/></button>:<><button className="cw-primary" onClick={onRegister}>Get started <ArrowRight size={16}/></button><button className="cw-info-back" onClick={onLogin}>Team sign in</button></>}</div>
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

const OSHAHUB_PRICES=[['Starter','KES 3,900','1 branch · 3 staff · Core operations and washer app'],['Growth','KES 7,900','3 branches · 15 staff · Reports, loyalty and washer app'],['Enterprise','KES 14,900','Unlimited branches and staff · Priority support and washer app']];
const OSHAHUB_TERMS=[['Monthly',1],['3 months',3],['5 months',5],['Yearly',12]];
function downloadPricingPdf(){window.print()}
function PricingSheet(){return <section className="cw-pricing-sheet-page"><div className="cw-pricing-sheet-toolbar"><a href="#/pricing"><ArrowRight size={15}/> Back to pricing</a><button type="button" onClick={downloadPricingPdf}><Download size={17}/> Download PDF</button></div><article className="cw-pricing-sheet"><header><img src="/osha-hub-logo.svg" alt="OshaHub"/><div><h1>PRICING GUIDE</h1><p>Subscription plans for your car wash workspace.</p></div></header><h2>SUBSCRIPTION TERMS</h2><div className="cw-pricing-table"><table><thead><tr><th>Plan</th><th>Monthly</th><th>3 months</th><th>5 months</th><th>Yearly</th><th>What’s included</th></tr></thead><tbody>{OSHAHUB_PRICES.map(([plan,price,features],index)=>{const monthly=[3900,7900,14900][index];return <tr key={plan}><td>{plan}</td>{OSHAHUB_TERMS.map(([label,months])=><td key={label}>{formatKes(months===1?monthly:(monthly-300)*months)}</td>)}<td>{features}</td></tr>})}</tbody></table></div><p className="cw-pricing-onboarding-note"><b>One-time onboarding: KES 8,500 per branch.</b> Charged with your first paid plan after the free 7-day trial. Multi-branch setup is priced by branch count.</p><div className="cw-pricing-sheet-notes"><section><h2>TERM SAVINGS</h2><p>Subscriptions of 3, 5 or 12 months save KES 300 for each covered month against the monthly rate.</p></section><section><h2>EVERY PLAN INCLUDES</h2><p>Business workspace, role-based access, wash queue, customer records and mobile-ready operations.</p></section></div></article></section>}

function LoginScreen({onLogin,onBack,initialMode='login'}){
  const inviteToken=new URLSearchParams(window.location.search).get('invite')||'';
  const [mode,setMode]=useState(()=>inviteToken?'register':initialMode);
  const [form,setForm]=useState({name:'',business:'',phone:'',email:'',password:''});
  const [confirmPassword,setConfirmPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [showConfirmPassword,setShowConfirmPassword]=useState(false);
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
    // This app accepts only business and staff memberships. Platform admins
    // authenticate through the standalone console at /super-admin.html.
    let {data:membership,error:membershipError}=await supabaseBrowser.from('carwash_memberships')
      .select('id,role,tenant_id,full_name,phone,branch,status').eq('user_id',authUser.id).eq('status','ACTIVE')
      .order('role',{ascending:true}).limit(10);
    if(membershipError)throw membershipError;
    const platformAdmin=(membership||[]).some((item)=>item.role==='SUPER_ADMIN');
    if(platformAdmin){
      setError('This is a platform administrator account. Sign in at /super-admin.html.');
      setBusy(false);
      return;
    }
    membership=(membership||[]).find((item)=>['BUSINESS_ADMIN','RECEPTIONIST','WASHER'].includes(item.role))||null;
    if(!membership&&authUser.user_metadata?.invite_token){
      const accepted=await supabaseBrowser.rpc('carwash_accept_staff_invitation',{invite_token:authUser.user_metadata.invite_token,staff_name:authUser.user_metadata.full_name||authUser.email});
      if(accepted.error)throw accepted.error;
      const refreshed=await supabaseBrowser.from('carwash_memberships').select('id,role,tenant_id,full_name,phone,branch,status').eq('user_id',authUser.id).eq('status','ACTIVE').order('role',{ascending:true}).limit(10);
      if(refreshed.error)throw refreshed.error;
      membership=(refreshed.data||[]).find((item)=>['BUSINESS_ADMIN','RECEPTIONIST','WASHER'].includes(item.role))||null;
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
      setMessage(inbox?.[0]?.body||(request?.status==='REJECTED'?'Your request needs attention. Please update your details and submit again.':'Your email is verified. Your account is waiting for administrator approval. We’ll post the activation update here.'));
      return;
    }
    const roleNames={BUSINESS_ADMIN:'Business Admin',RECEPTIONIST:'Receptionist',WASHER:'Washer'};
    const {data:tenant}=membership.tenant_id?await supabaseBrowser.from('carwash_tenants').select('name').eq('id',membership.tenant_id).maybeSingle():{data:null};
    let billingRestricted=false;
    if(membership.tenant_id){
      const {data:canOperate,error:billingError}=await supabaseBrowser.rpc('carwash_can_operate',{target_tenant:membership.tenant_id});
      if(billingError)throw billingError;
      billingRestricted=canOperate===false;
      {const {error:noticeError}=await supabaseBrowser.rpc('carwash_notify_billing_status',{target_tenant:membership.tenant_id});if(noticeError)throw noticeError;}
    }
    const {data:messages}=await supabaseBrowser.from('carwash_user_messages').select('id,subject,body').eq('user_id',authUser.id).is('read_at',null).order('created_at',{ascending:false}).limit(1);
    const role=roleNames[membership.role];
    if(!role)throw new Error('This account has no supported portal role. Contact your administrator.');
    onLogin({id:authUser.id,authUserId:authUser.id,staffId:membership.id,email:authUser.email,name:membership.full_name||authUser.user_metadata?.full_name||authUser.email,role,tenant_id:membership.tenant_id,tenant_name:tenant?.name,branch:membership.branch,billingRestricted,activationMessage:billingRestricted?`Your ${tenant?.name||'business'} workspace is restricted because its plan has expired. Make a payment to continue using ${tenant?.name||'your business workspace'}.`:messages?.[0]?.body});
  }
  async function submit(event){
    event.preventDefault();setError('');setMessage('');setLoading(true);
    try{
      if(!supabaseBrowser)throw new Error('Supabase is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) in the deployment environment.');
      if(mode==='register'){
        if(form.password!==confirmPassword)throw new Error('Passwords do not match. Please check both password fields.');
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
  async function demoEnter(){setLoading(true);onLogin(selected);setLoading(false);}
  return <div className="cw-login">
    {loading&&<div className="cw-wash-loader"><div className="cw-loader-logo"><Droplets size={22}/><b>OSHA<i>HUB</i></b></div><h2>Connecting to your secure wash floor…</h2><p>Getting your workspace ready</p><div className="cw-loader-track"><i/></div></div>}
    <div className="cw-login-visual"><div className="cw-login-nav"><img src="/osha-hub-logo.svg" alt="OshaHub"/><span><ShieldCheck size={15}/> SECURE OPERATIONS</span></div><div className="cw-login-pitch"><span>OSHAHUB · CAR WASH OPERATIONS</span><h1>Every wash.<br/>Running smoothly.</h1><p>Run your car wash with a clear view of jobs, people and payments, all in one place.</p><div className="cw-login-points"><div><Check size={15}/> Live wash queue</div><div><Check size={15}/> Customer loyalty</div><div><Check size={15}/> Clear earnings</div></div><div className="cw-pitch-products"><div><small>CONNECTED PORTALS</small><b>Owner · Front desk · Wash team</b></div><div><small>SUBSCRIPTION PLANS</small><b>Monthly · Quarterly · Annual · Custom</b></div></div></div><div className="cw-login-legal">© 2026 OshaHub <span>Made for the people who keep Kenya moving.</span></div></div>
    <div className="cw-login-panel"><div className="cw-login-mobile-logo"><img src="/osha-hub-logo-light.svg" alt="OshaHub"/></div><div className="cw-login-content">{onBack&&<button type="button" className="cw-back-to-site" onClick={onBack}>← Back to OshaHub</button>}<span className="cw-login-kicker">WELCOME TO OSHAHUB</span><h2>{mode==='register'?'Bring your wash online.':'Your wash floor, at a glance.'}</h2><p className="cw-login-intro">{mode==='register'?'Register your business and its owner. After review, the owner receives Business Admin access and can invite staff.':'Sign in with your business or staff account to open your workspace.'}</p><div className="cw-auth-mobile-products"><b>Business · Front desk · Wash team</b><span>Flexible monthly, quarterly, annual and custom subscriptions</span></div>
      <form className="cw-auth-form" onSubmit={submit}>
        {mode==='register'&&<><label>{inviteToken.length===64?'Employee’s full name':'Owner’s full name'}<input autoComplete="name" placeholder="Enter full name" required minLength="2" value={form.name} onChange={(e)=>set('name',e.target.value)}/></label>{inviteToken.length!==64&&<><label>Business name<input placeholder="Enter business name" required minLength="2" value={form.business} onChange={(e)=>set('business',e.target.value)}/></label><label>Phone number<input autoComplete="tel" inputMode="tel" placeholder="Enter phone number" required minLength="7" value={form.phone} onChange={(e)=>set('phone',e.target.value)}/></label></>}</>}
        <label>Email address<input type="email" autoComplete="email" placeholder="Enter email address" required value={form.email} onChange={(e)=>set('email',e.target.value)}/></label>
        <label>Password<div className="cw-password-wrap"><input type={showPassword?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} placeholder="Enter password" required minLength="10" value={form.password} onChange={(e)=>set('password',e.target.value)}/><button type="button" className="cw-password-toggle" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword((visible)=>!visible)}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>
        {mode==='register'&&<label>Confirm password<div className="cw-password-wrap"><input type={showConfirmPassword?'text':'password'} autoComplete="new-password" placeholder="Re-enter password" required minLength="10" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)}/><button type="button" className="cw-password-toggle" aria-label={showConfirmPassword?'Hide confirmation password':'Show confirmation password'} aria-pressed={showConfirmPassword} onClick={()=>setShowConfirmPassword((visible)=>!visible)}>{showConfirmPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>}
        <button className="cw-primary cw-enter" type="submit" disabled={loading}>{loading?<><span className="cw-spinner"/>Connecting securely</>:mode==='register'?'Request business access':'Sign in securely'} <ArrowRight size={17}/></button>
      </form>
      {!supabaseBrowser&&!demoEnabled&&<div className="cw-auth-alert" role="status">Supabase is not ready yet. {supabaseConfigMessage}</div>}
      {error&&<div className="cw-auth-alert error" role="alert">{error}</div>}{message&&<div className="cw-auth-alert" role="status">{message}</div>}
      <button className="cw-auth-switch" onClick={()=>{setError('');setMessage('');setMode(mode==='login'?'register':'login')}}>{mode==='login'?<>New business? <b>Request access</b></>:<>Already registered? <b>Sign in</b></>}</button>
      {demoEnabled&&<details className="cw-demo-access"><summary>Explore sample workspace</summary><div className="cw-role-options">{demoUsers.map((item)=>{const Icon=item.role==='Business Admin'?Store:item.role==='Receptionist'?Users:Waves;return <button type="button" key={item.role} className={`cw-role-option ${selected.role===item.role?'selected':''}`} onClick={()=>setSelected(item)}><span className="cw-role-icon"><Icon size={17}/></span><span><b>{item.role}</b><small>{item.email}</small></span><span className="cw-role-radio"/></button>})}</div><button type="button" className="cw-primary cw-enter" onClick={demoEnter} disabled={loading}>Enter sample workspace <ArrowRight size={17}/></button><div className="cw-demo-note"><ShieldCheck size={16}/><span><b>Demo data only</b><br/>Demo changes reset when you reload.</span></div></details>}
    </div><div className="cw-login-foot">Email verification and account approval are handled by Supabase · Secure workspace access</div></div>
  </div>;
}

function Overview({db,role,user,jobs,revenue,active,ready,onNavigate,onCreate,onTransition,onPayment}){
  const metrics=role==='SaaS Super Admin' ? [
    ['Total businesses',db.tenants.length,'Across all plans',Store,'blue'],['Active subscriptions',db.tenants.filter((item)=>item.status==='ACTIVE').length,'Operating today',BadgeCheck,'green'],['Monthly revenue',formatKes(db.tenants.filter((item)=>item.status==='ACTIVE').length*7900),'Recurring subscription revenue',Wallet,'blue'],['Expiring soon',db.tenants.filter((item)=>['EXPIRING SOON','TRIAL'].includes(item.status)).length,'Needs attention',Clock3,'amber']
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
  return <div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>VEHICLE</th><th>SERVICE</th><th>WASHER</th><th>PAYMENT</th><th>STATUS</th><th className="align-right">TOTAL</th><th/></tr></thead><tbody>{jobs.map((job)=>{const vehicle=db.vehicles.find((item)=>item.id===job.vehicleId),customer=db.customers.find((item)=>item.id===job.customerId),washer=db.staff.find((item)=>item.id===job.washerId),services=job.serviceIds.map((id,index)=>db.services.find((item)=>item.id===id)?.name||job.serviceNames?.[index]).filter(Boolean);return <tr key={job.id}><td><div className="cw-vehicle-cell"><div className="cw-vehicle-icon"><CarFront size={19}/></div><span><b>{vehicle?.registration||'Vehicle'}</b><small>{vehicle?.make} {vehicle?.model} · {customer?.name}</small></span></div></td><td><b className="cw-cell-primary">{services.join(' + ')||'Wash service'}</b><small className="cw-cell-sub">{job.id}</small></td><td><span className="cw-washer-cell"><i>{washer?.name?.split(' ').map((part)=>part[0]).join('')||'—'}</i>{washer?.name||'Unassigned'}</span></td><td><span className={`cw-pay-state ${job.paymentStatus==='PAID'?'paid':'unpaid'}`}>{job.paymentStatus==='PAID'?<CheckCircle2 size={13}/>:<Clock3 size={13}/>} {job.paymentStatus}</span></td><td><StatusPill status={job.status}/></td><td className="align-right"><b className="cw-cell-primary">{formatKes(job.total)}</b><small className="cw-cell-sub">{formatKes(job.commission)} commission</small></td><td><div className="cw-row-actions">{job.paymentStatus!=='PAID'&&['Receptionist','Business Admin'].includes(role)&&<button className="cw-small-action secondary" onClick={()=>onPayment(job)}>Pay</button>}<JobAction job={job} role={role} history={history} onTransition={onTransition}/></div></td></tr>;})}{!jobs.length&&<tr><td colSpan="7"><div className="cw-table-empty"><Waves size={24}/><b>{empty}</b><span>New activity will appear here.</span></div></td></tr>}</tbody></table></div>;
}
function JobAction({job,role,history,onTransition}){if(history||job.status==='CLOSED')return <span className="cw-dash">—</span>;const map={WAITING:['assign','Assign washer'],ASSIGNED:['start','Start wash'],'IN PROGRESS':['complete','Complete wash'],COMPLETED:['ready','Mark ready'],READY:['deliver','Collected'],DELIVERED:['close','Close order']};let[action,label]=map[job.status]||[];if(['ASSIGNED','IN PROGRESS'].includes(job.status)&&role!=='Washer')action=null;if(['COMPLETED','READY'].includes(job.status)&&role==='Washer')action=null;if(job.status==='WAITING'&&!['Receptionist','Business Admin'].includes(role))action=null;if(job.status==='DELIVERED'&&role!=='Business Admin')action=null;if(!action)return <span className="cw-dash">{['ASSIGNED','IN PROGRESS'].includes(job.status)?'Washer working':'—'}</span>;return <button className={`cw-small-action ${action==='complete'?'success':''}`} onClick={()=>onTransition(job.id,action)}>{label}</button>;}
function StatusPill({status}){const kind=status.toLowerCase().replaceAll(' ','-');return <span className={`cw-status status-${kind}`}><i/>{status}</span>}

function CustomersPage({customers,vehicles,query,setQuery,onAdd}){const visible=customers.filter((item)=>`${item.name} ${item.phone} ${item.email} ${vehicles.filter((v)=>v.customerId===item.id).map((v)=>v.registration).join(' ')}`.toLowerCase().includes(query.toLowerCase()));return <><PageHeading title="Customers & vehicles" subtitle="Customer profiles, vehicles and visit history in one place." action={<button className="cw-primary" onClick={onAdd}><Plus size={16}/> Add customer</button>}/><div className="cw-toolbar"><div className="cw-search"><Search size={16}/><input placeholder="Search customer, phone or plate…" value={query} onChange={(event)=>setQuery(event.target.value)}/></div><span className="cw-record-count">{customers.length} customers · {vehicles.length} vehicles</span></div><div className="cw-panel cw-table-panel"><div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>CUSTOMER</th><th>VEHICLES</th><th>VISITS</th><th>LOYALTY POINTS</th><th>LAST VISIT</th></tr></thead><tbody>{visible.map((customer,index)=>{const owned=vehicles.filter((vehicle)=>vehicle.customerId===customer.id);return <tr key={customer.id}><td><div className="cw-person-cell"><div className={`cw-person-avatar avatar-${index%4}`}>{customer.name.split(' ').map((part)=>part[0]).slice(0,2).join('')}</div><span><b>{customer.name}</b><small>{customer.phone}{customer.email?` · ${customer.email}`:''}</small></span></div></td><td>{owned.length?owned.map((vehicle)=><span className="cw-plate-tag" key={vehicle.id}>{vehicle.registration}<small>{vehicle.make} {vehicle.model}</small></span>):<span className="cw-cell-sub">No vehicle added</span>}</td><td>{customer.visits}</td><td><b className="cw-points">✦ {customer.points}</b></td><td>{customer.lastVisit}</td></tr>;})}{!visible.length&&<tr><td colSpan="5"><div className="cw-table-empty">No customers found.</div></td></tr>}</tbody></table></div></div></>}

function ServicesPage({services,onAdd,onChange}){return <><PageHeading title="Services & pricing" subtitle="Configure wash services, customer prices and worker commission rules." action={<button className="cw-primary" onClick={onAdd}><Plus size={16}/> Add service</button>}/><div className="cw-service-grid">{services.map((service,index)=><article className="cw-service-card" key={service.id}><div className="cw-service-head"><div className={`cw-service-icon service-${index%4}`}><Sparkles size={19}/></div><span className={`cw-active-tag ${service.active?'':'inactive'}`}><i/>{service.active?'ACTIVE':'PAUSED'}</span></div><span className="cw-service-category">{service.category}</span><h2>{service.name}</h2><p>Average time · {service.duration} min</p><div className="cw-service-price"><span>Customer price</span><b>{formatKes(service.price)}</b></div><div className="cw-service-price commission-line"><span>Washer commission</span><b>{formatKes(service.commission)}</b></div><button className="cw-secondary cw-wide" onClick={()=>onChange(service)}>{service.active?'Pause service':'Activate service'}</button></article>)}{!services.length&&<EmptyPanel title="No services yet" text="Add the services your car wash offers."/>}</div></>}

function StaffPage({staff,jobs,onAdd,onChange}){
  return <>
    <PageHeading title="Staff" subtitle="View team memberships, branch assignments and access status." action={<button className="cw-primary" onClick={onAdd}><Plus size={16}/> Add team member</button>}/>
    <div className="cw-panel cw-table-panel"><div className="cw-table-wrap"><table className="cw-table">
      <thead><tr><th>TEAM MEMBER</th><th>ROLE</th><th>BRANCH</th><th>STATUS</th><th>JOBS TODAY</th><th/></tr></thead>
      <tbody>{staff.map((person,index)=><tr key={person.id}>
        <td><div className="cw-person-cell"><div className={`cw-person-avatar avatar-${index%4}`}>{person.name.split(' ').map((part)=>part[0]).slice(0,2).join('')}</div><span><b>{person.name}</b><small>{person.email||person.phone||'Invited team member'}</small></span></div></td>
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

function PlansPage({plans,tenants,onAdd}){const defaults=[{name:'Starter',price:3900,days:30,features:'1 branch · 3 staff · Core operations and washer app'}, {name:'Growth',price:7900,days:30,features:'3 branches · 15 staff · Reports, loyalty and washer app'}, {name:'Enterprise',price:14900,days:30,features:'Unlimited branches and staff · Priority support and washer app'}];const items=plans.length?plans:defaults;return <><PageHeading title="Plans & billing" subtitle="Monthly, 3-month, 5-month and yearly terms. Longer terms save KES 300 per month." action={<button className="cw-primary" onClick={onAdd}><Plus size={16}/> Create plan</button>}/><div className="cw-service-grid plan-grid">{items.map((plan,index)=><article className="cw-service-card cw-plan-product" key={`${plan.name}-${index}`}><div className="cw-service-head"><div className={`cw-service-icon service-${index%4}`}><Wallet size={19}/></div><span className="cw-active-tag"><i/>AVAILABLE</span></div><span className="cw-service-category">{plan.days||30} DAY SUBSCRIPTION</span><h2>{plan.name}</h2><p>{plan.features}</p><div className="cw-service-price"><span>Subscription price</span><b>{formatKes(plan.price)}<small> / period</small></b></div><div className="cw-service-price"><span>Businesses on plan</span><b>{tenants.filter((tenant)=>tenant.plan===plan.name).length}</b></div><span className="cw-plan-status">Available for tenant assignment</span></article>)}</div><div className="cw-note-box"><ShieldCheck size={17}/><span>Expired accounts enter restricted mode. Their records remain available for billing, audit and reactivation.</span></div></>}

function CustomerBillingPage({billing,tenant,onRequest,onRefresh}){
  const [selectedPlan,setSelectedPlan]=useState(''); const [expandedTier,setExpandedTier]=useState('');
  const [showPlans,setShowPlans]=useState(false);
  const [hasMultipleBranches,setHasMultipleBranches]=useState(false); const [branchCount,setBranchCount]=useState(2);
  const [phone,setPhone]=useState(''); const [busy,setBusy]=useState(false); const [paymentMessage,setPaymentMessage]=useState('');
  const [billingDrawerOpen,setBillingDrawerOpen]=useState(false);
  const current=billing?.currentSubscription; const plan=billing?.currentPlan; const pending=billing?.pendingRequest;
  const trial=current?.status==='TRIAL'; const trialEligible=trial&&!billing?.trialExtensionRequested&&!billing?.payments?.length;
  const daysLeft=current?Math.max(0,Math.ceil((new Date(current.ends_at)-Date.now())/86400000)):0;
  const plans=billing?.plans||[]; const payments=billing?.payments||[];
  const pendingPlan=plans.find((item)=>item.id===pending?.plan_id);
  const lockedPlanId=pending?.request_type==='PLAN_PURCHASE'?pending.plan_id:null;
  const effectiveSelectedPlan=lockedPlanId||selectedPlan;
  const selected=plans.find((item)=>item.id===effectiveSelectedPlan);
  const selectedTermActive=current?.status==='ACTIVE'&&current?.plan_id===selected?.id&&new Date(current.ends_at)>Date.now();
  const branchLimit=selected?.branchLimit>0?selected.branchLimit:100;
  const effectiveBranchCount=billing?.onboardingFeeDue?(hasMultipleBranches?Math.max(2,Math.min(branchLimit,Number(branchCount)||2)):1):(pending?.branch_count||current?.branch_count||1);
  const onboardingFee=billing?.onboardingFeeDue?Number(billing?.onboardingFee||8500)*effectiveBranchCount:0;
  const amountDueNow=onboardingFee||Number(selected?.price||0);
  const tierPlans=OSHAHUB_PRICES.map(([tier,,features],index)=>({tier,features,monthly:[3900,7900,14900][index],options:plans.filter((item)=>item.tier===tier).sort((a,b)=>a.months-b.months)}));
  const [checkingId,setCheckingId]=useState('');
  useEffect(()=>{if(lockedPlanId){setSelectedPlan(lockedPlanId);setExpandedTier(pendingPlan?.tier||'');setBillingDrawerOpen(true);} },[lockedPlanId,pendingPlan?.tier]);
  useEffect(()=>{if(!billingDrawerOpen)return undefined;const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';const closeOnEscape=(event)=>{if(event.key==='Escape')setBillingDrawerOpen(false);};window.addEventListener('keydown',closeOnEscape);return()=>{document.body.style.overflow=previousOverflow;window.removeEventListener('keydown',closeOnEscape);};},[billingDrawerOpen]);
  useEffect(()=>{if(!pending?.id||pending.request_type!=='PLAN_PURCHASE'||pending.mpesa_payment_status==='PAID'||pending.status!=='PENDING')return;let stopped=false;const poll=async()=>{const {data,error}=await supabaseBrowser.from('carwash_billing_requests').select('status,mpesa_payment_status,mpesa_result_code').eq('id',pending.id).maybeSingle();if(stopped||error||!data)return;if(data.mpesa_payment_status==='PAID'||data.status==='APPROVED'){setPaymentMessage(`${formatKes(pending.mpesa_expected_amount_kes||onboardingFee||selected?.price)} payment confirmed by Safaricom. ${tenant?.name||'Your business'} is active on ${pendingPlan?.name||selected?.name||'your selected'} plan. Never share your M-Pesa PIN with anyone.`);setCheckingId('');setBillingDrawerOpen(false);await onRefresh?.();stopped=true;}else if(data.mpesa_payment_status==='FAILED'){setPaymentMessage('The M-Pesa request was not completed. Check your phone and try again.');setCheckingId('');stopped=true;}};const timer=setInterval(poll,3000);if(checkingId===pending.id)poll();return()=>{stopped=true;clearInterval(timer);};},[pending?.id,pending?.status,pending?.mpesa_payment_status,checkingId,onRefresh,onboardingFee,selected?.price,pendingPlan?.name,selected?.name,tenant?.name]);
  async function submit(payload){setBusy(true);setPaymentMessage('');try{const result=await onRequest(payload);if(result?.requestId){setCheckingId(result.requestId);setPaymentMessage(`An M-Pesa prompt for ${formatKes(result.amountKes||amountDueNow)} is on its way to ${payload.phone}. Enter your M-Pesa PIN to pay.`);}}catch(error){setPaymentMessage(error.message||'Could not start the M-Pesa payment. Please try again.');}finally{setBusy(false);}}
  function downloadReport(){const rows=[['Date','Plan','Branches','Payment stage','Amount KES','Method','Reference'],...payments.map((payment)=>[new Date(payment.paid_at).toLocaleDateString('en-KE'),plans.find((item)=>item.id===payment.plan_id)?.name||'Subscription',payment.branch_count||1,payment.payment_stage||'LEGACY',payment.amount_kes,payment.method,payment.external_reference||''])];const csv=rows.map((row)=>row.map((value)=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`${(tenant?.name||'oshahub').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-billing-report.csv`;link.click();URL.revokeObjectURL(url);}
  return <>
    <PageHeading title="Plans & billing" subtitle="Choose your subscription, pay onboarding securely with M-Pesa, and review your payment history."/>
    <div className="cw-billing-current"><div><span>{trial?'FREE TRIAL':plan?.name?.toUpperCase()||'CURRENT SUBSCRIPTION'}</span><h2>{tenant?.name||'Your business'}</h2><p>{trial?`You have ${daysLeft} day${daysLeft===1?'':'s'} left in your free 7-day trial.`:current?`${plan?.name||'Your plan'} · ${current.branch_count||1} branch${current.branch_count===1?'':'es'} · ${current.status} · Ends ${new Date(current.ends_at).toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'})}`:'Choose a plan to continue using your workspace.'}</p></div><div className="cw-billing-current-mark"><ShieldCheck size={22}/><b>{current?.status||'NO PLAN'}</b></div></div>
    {trialEligible&&<div className="cw-billing-extension"><div><b>Need a little more time?</b><span>Request one extra 7-day trial. OshaHub will review your request and notify you in the app.</span></div><button className="cw-secondary" disabled={busy||Boolean(pending)} onClick={()=>submit({type:'TRIAL_EXTENSION'})}>{pending?'Request pending':busy?'Sending…':'Request 7 more days'}</button></div>}
    {pending?.request_type==='TRIAL_EXTENSION'&&<div className="cw-note-box"><Clock3 size={17}/><span>Your trial extension request is awaiting OshaHub review.</span></div>}
    <div className="cw-billing-plans-heading"><PageHeading title="Available plans" subtitle="Compare terms and features when you’re ready to choose."/><button type="button" className="cw-secondary cw-plans-disclosure" aria-expanded={showPlans} onClick={()=>setShowPlans((show)=>!show)}>{showPlans?'Hide plans':'View available plans'}<ChevronDown size={16}/></button></div>
    {showPlans&&<div className="cw-customer-plan-grid">{tierPlans.map((group,index)=><article className={`cw-customer-plan ${group.options.some((item)=>item.id===effectiveSelectedPlan)?'selected':''}`} key={group.tier}><span className="cw-service-category">OSHAHUB {group.tier.toUpperCase()}</span><h3>{group.tier}</h3><strong>{formatKes(group.monthly)}<small> / month</small></strong><button className="cw-primary" aria-expanded={expandedTier===group.tier} onClick={()=>setExpandedTier(expandedTier===group.tier?'':group.tier)}>{expandedTier===group.tier?'Hide plan':'View plan'}</button>{expandedTier===group.tier&&<div className="cw-customer-plan-details"><p>{group.features}</p><span className="cw-service-category">CHOOSE A SUBSCRIPTION TERM</span><div className="cw-plan-term-options">{OSHAHUB_TERMS.map(([label,months])=>{const option=group.options.find((item)=>item.months===months);const price=months===1?group.monthly:(group.monthly-300)*months;return <button type="button" key={label} className={effectiveSelectedPlan===option?.id?'active':''} disabled={!option||Boolean(lockedPlanId)} onClick={()=>{if(option&&!lockedPlanId){setSelectedPlan(option.id);setShowPlans(false);setBillingDrawerOpen(true);if(option.branchLimit===1)setHasMultipleBranches(false);}}}><b>{label}</b><span>{formatKes(price)}</span>{months>1&&<small>Save {formatKes(300*months)}</small>}</button>})}</div></div>}</article>)}</div>}
    {selectedTermActive&&<div className="cw-note-box"><CheckCircle2 size={17}/><span>{paymentMessage||`Your ${selected.name} subscription is active until ${new Date(current.ends_at).toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'})}. The next subscription payment is due at renewal.`}</span></div>}
    {pending?.request_type==='PLAN_PURCHASE'&&!billingDrawerOpen&&!selectedTermActive&&<button type="button" className="cw-secondary cw-pending-payment-link" onClick={()=>setBillingDrawerOpen(true)}><Clock3 size={15}/>Continue pending payment <ArrowRight size={15}/></button>}
    {selected&&!selectedTermActive&&billingDrawerOpen&&<><button className="cw-billing-drawer-backdrop" aria-label="Close billing details" onClick={()=>setBillingDrawerOpen(false)}/><section className="cw-panel cw-billing-pay-panel" role="dialog" aria-modal="true" aria-label="Subscription payment"><div className="cw-panel-head"><div><h2>{pending?.request_type==='PLAN_PURCHASE'?'M-Pesa payment':'Start your subscription'}</h2><p>First payment is the one-time onboarding fee only. The selected subscription starts now and renews at the end of its term.</p></div><button className="cw-icon-button cw-billing-drawer-close" onClick={()=>setBillingDrawerOpen(false)} aria-label="Close payment panel"><X size={18}/></button></div><div className="cw-billing-horizontal"><div className="cw-billing-summary"><h3>Payment summary</h3><div className="cw-billing-invoice"><div><span>{onboardingFee?'Next subscription payment':'Selected plan'} · {selected.name} · {selected.term} ({selected.days} days)</span><b>{formatKes(selected.price)}</b></div>{onboardingFee>0&&<div><span>One-time onboarding · {effectiveBranchCount} branch{effectiveBranchCount===1?'':'es'}</span><b>{formatKes(onboardingFee)}</b></div>}<div className="total"><span>Due now</span><b>{formatKes(amountDueNow)}</b></div></div><p className="cw-billing-hint">{onboardingFee>0?`Pay KES 8,500 per branch now. This payment starts your ${selected.term} ${selected.name} subscription. ${formatKes(selected.price)} is due at renewal after ${selected.days} days.`:`Your onboarding fee has already been paid. The next subscription payment is ${formatKes(selected.price)}. ${current?.status==='ACTIVE'&&new Date(current.ends_at)>Date.now()?`It schedules this plan from ${new Date(current.ends_at).toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'})}.`:'It starts the selected term now.'}`}</p>{billing?.onboardingFeeDue&&selected.branchLimit!==1&&<label className="cw-branch-choice"><input type="checkbox" disabled={Boolean(lockedPlanId)} checked={hasMultipleBranches} onChange={(event)=>setHasMultipleBranches(event.target.checked)}/><span><b>I have more than one branch</b><small>KES 8,500 onboarding per branch. {selected.branchLimit===-1?'This plan supports up to 100 branches.':`This plan supports ${selected.branchLimit||1} branches.`}</small></span></label>}{billing?.onboardingFeeDue&&hasMultipleBranches&&<label className="cw-form-label">NUMBER OF BRANCHES<input disabled={Boolean(lockedPlanId)} type="number" min="2" max={branchLimit} value={branchCount} onChange={(event)=>setBranchCount(Math.max(2,Math.min(branchLimit,Number(event.target.value)||2)))}/></label>}</div><div className="cw-billing-push"><div className="cw-mpesa-heading"><img src="/mpesa-logo.svg" alt="M-Pesa"/><span>Pay with M-Pesa</span></div><p>Enter the Safaricom number to receive a secure STK prompt. Confirm the payment on your phone.</p><label className="cw-form-label">M-PESA PHONE NUMBER<input type="tel" inputMode="tel" autoComplete="tel" placeholder="07XX XXX XXX" value={phone} onChange={(event)=>setPhone(event.target.value)} disabled={Boolean(pending&&pending.mpesa_payment_status!=='FAILED')}/></label>{paymentMessage&&<div className={`cw-stk-message ${pending?.mpesa_payment_status==='FAILED'?'error':''}`} role="status">{checkingId===pending?.id&&<span className="cw-stk-spinner"/>}{paymentMessage}</div>}<button className="cw-primary cw-stk-button" disabled={busy||! /^(?:0[17]\d{8}|[17]\d{8}|254[17]\d{8})$/.test(phone.replace(/[\s-]/g,''))||(pending&&pending.mpesa_payment_status!=='FAILED')} onClick={()=>pending?.request_type==='PLAN_PURCHASE'?submit({type:'STK_RETRY',requestId:pending.id,phone}):submit({type:'PLAN_PURCHASE',planId:effectiveSelectedPlan,phone,branchCount:effectiveBranchCount})}>{busy?'Sending prompt…':pending?.mpesa_payment_status==='FAILED'?'Retry M-Pesa STK Push':checkingId?'Waiting for payment…':'Send M-Pesa STK Push'} <ArrowRight size={16}/></button><small className="cw-billing-hint">A secure M-Pesa prompt will appear on your phone. Review the amount before entering your PIN.</small></div></div></section></>}
    {pending?.request_type==='PLAN_PURCHASE'&&!selected&&<div className="cw-note-box"><Clock3 size={17}/><span>The selected plan is being processed. Refresh this page if the plan options do not appear.</span></div>}
    <section className="cw-panel cw-table-panel cw-billing-history"><div className="cw-panel-head"><div><h2>Payment reports</h2><p>Separate onboarding and subscription payments with their M-Pesa receipt references.</p></div><button className="cw-secondary" disabled={!payments.length} onClick={downloadReport}><Download size={15}/> Download CSV</button></div><div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>DATE</th><th>PLAN</th><th>BRANCHES</th><th>PAYMENT TYPE</th><th>AMOUNT PAID</th><th>METHOD</th><th>REFERENCE</th></tr></thead><tbody>{payments.map((payment)=><tr key={payment.id}><td>{new Date(payment.paid_at).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'})}</td><td>{plans.find((item)=>item.id===payment.plan_id)?.name||'Subscription'}</td><td>{payment.branch_count||1}</td><td>{payment.payment_stage==='ONBOARDING'?'Onboarding':payment.payment_stage==='SUBSCRIPTION'?'Subscription':'Legacy payment'}</td><td>{formatKes(payment.amount_kes)}</td><td>{payment.method}</td><td>{payment.external_reference||'—'}</td></tr>)}</tbody></table>{!payments.length&&<EmptyPanel title="No confirmed subscription payments yet" text="Your M-Pesa receipts and payment reports will appear here after confirmation."/>}</div></section>
  </>;
}

function AuditPage({rows}){return <><PageHeading title="Audit & security" subtitle="Recent operational events and sensitive account activity."/><div className="cw-security-banner"><ShieldCheck size={23}/><span><b>Tenant isolation is enforced</b><small>Business records are scoped to the signed in workspace.</small></span><StatusPill status="ACTIVE"/></div><div className="cw-panel cw-table-panel"><div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>EVENT</th><th>DETAIL</th><th>TIME</th><th>RESULT</th></tr></thead><tbody>{rows.map((row)=><tr key={row.id}><td><b>{row.action}</b></td><td>{row.detail}</td><td>{row.time}</td><td><span className="cw-pay-state paid"><CheckCircle2 size={13}/> Recorded</span></td></tr>)}</tbody></table></div></div></>}

function SettingsPage({db,onSave,theme,onThemeChange}){
  const [name,setName]=useState(db.settings.businessName);
  const [branch,setBranch]=useState(db.settings.branch);
  const [rate,setRate]=useState(String(db.settings.loyaltyRate));
  return <>
    <PageHeading title="Business settings" subtitle="Manage your business profile and workspace appearance."/>
    <div className="cw-settings-grid">
      <div className="cw-panel cw-settings-panel">
        <div className="cw-panel-head"><div><h2>Business profile</h2><p>Workspace identity and branch settings</p></div></div>
        <label className="cw-form-label">BUSINESS NAME<input value={name} onChange={(event)=>setName(event.target.value)}/></label>
        <label className="cw-form-label">PRIMARY BRANCH<input value={branch} onChange={(event)=>setBranch(event.target.value)}/></label>
        <label className="cw-form-label">LOYALTY EARN RATE<input type="number" min="0" value={rate} onChange={(event)=>setRate(event.target.value)}/><small>Points awarded for each KES spent on a closed order.</small></label>
        <button className="cw-primary" onClick={()=>onSave({businessName:name,branch,loyaltyRate:Math.max(0,K(rate))})}>Save settings <Check size={16}/></button>
      </div>
      <div className="cw-panel cw-info-panel"><ShieldCheck size={22}/><h3>Your workspace is tenant scoped</h3><p>Business users see records belonging to their own organization. Role access determines which actions appear in the workspace.</p><div><span>Business</span><b>{db.settings.businessName}</b></div><div><span>Currency</span><b>Kenyan Shilling (KES)</b></div><div><span>Workspace role</span><b>Business Admin</b></div></div>
      <section className="cw-panel cw-appearance-panel"><div className="cw-panel-head"><div><h2>Appearance</h2><p>Choose the workspace colors that suit your screen.</p></div></div><div className="cw-theme-options"><button type="button" className={theme==='light'?'selected':''} aria-pressed={theme==='light'} onClick={()=>onThemeChange('light')}><span className="cw-theme-preview light"><Sun size={20}/><i/><i/><i/></span><span><b>Light</b><small>Bright background</small></span>{theme==='light'&&<CheckCircle2 size={17}/>}</button><button type="button" className={theme==='dark'?'selected':''} aria-pressed={theme==='dark'} onClick={()=>onThemeChange('dark')}><span className="cw-theme-preview dark"><Moon size={20}/><i/><i/><i/></span><span><b>Dark</b><small>Low-light workspace</small></span>{theme==='dark'&&<CheckCircle2 size={17}/>}</button></div><p className="cw-appearance-note">Appearance syncs to your OshaHub account and is applied in this browser.</p></section>
    </div>
  </>;
}

function ProfilePage({user,tenant,onLogout}){return <><PageHeading title="My profile" subtitle="Your account and workspace access."/><div className="cw-profile-card"><div className="cw-profile-avatar">{user.name.split(' ').map((part)=>part[0]).slice(0,2).join('')}</div><h2>{user.name}</h2><span>{user.role}</span><div className="cw-profile-detail"><small>EMAIL</small><b>{user.email}</b></div><div className="cw-profile-detail"><small>WORKSPACE</small><b>{tenant?.name||'Platform owner'}</b></div><button className="cw-secondary" onClick={onLogout}><LogOut size={16}/> Sign out</button></div></>}

function PageHeading({title,subtitle,action}){return <div className="cw-page-heading compact"><div><h1>{title}</h1><p>{subtitle}</p></div>{action&&<div className="cw-heading-actions">{action}</div>}</div>}
function MetricCard({label,value,note,icon:Icon}){return <div className="cw-metric"><div className="cw-metric-top"><span>{label}</span><i className="tone-blue"><Icon size={18}/></i></div><strong>{value}</strong><small>{note}</small></div>}
function EmptyPanel({title,text}){return <div className="cw-empty-panel"><Sparkles size={23}/><b>{title}</b><span>{text}</span></div>}
function SalesChart(){const data=[['Mon',38],['Tue',55],['Wed',43],['Thu',76],['Fri',61],['Sat',91],['Sun',48]];return <div className="cw-chart"><div className="cw-chart-y"><span>30k</span><span>20k</span><span>10k</span><span>0</span></div><div className="cw-chart-body"><div className="cw-chart-grid"><i/><i/><i/><i/></div><div className="cw-bars">{data.map(([day,height],index)=><div className="cw-bar-col" key={day}><div className={`cw-bar ${index===5?'highlight':''}`} style={{height:`${height}%`}}><i/></div><small>{day}</small></div>)}</div></div></div>}

function FormModal({type,db,tenantId,onClose,onSubmit}){const [form,setForm]=useState({serviceIds:db.services.filter((item)=>item.tenant_id===tenantId&&item.active).slice(0,1).map((item)=>item.id),paymentStatus:'PAID',method:'Cash',role:'Washer',plan:'Starter',days:'30',endsAt:'2026-10-24'});const [saving,setSaving]=useState(false);const set=(key,value)=>setForm((current)=>({...current,[key]:value}));function field(key,label,placeholder='',kind='text',required=true){return <label className="cw-form-label">{label}<input required={required} type={kind} placeholder={placeholder} value={form[key]??''} onChange={(event)=>set(key,event.target.value)}/></label>;}
  const title={order:'Check in a vehicle',customer:'Add a customer',service:'Add a service',staff:'Invite a team member',tenant:'Add business',plan:'Create subscription plan'}[type]||'Add record';
  function submit(event){event.preventDefault();setSaving(true);onSubmit(form);setSaving(false);}
  return <div className="cw-modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><form className="cw-modal" onSubmit={submit}><div className="cw-modal-head"><div><span className="cw-overline">{type==='order'?'FRONT DESK':type==='tenant'?'PLATFORM CONTROL':'WORKSPACE'}</span><h2>{title}</h2><p>{type==='order'?'Customer, vehicle, service, payment and washer assignment.':'Enter the details to add this record.'}</p></div><button type="button" className="cw-icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div><div className="cw-modal-fields">
    {type==='order'&&<><div className="cw-form-section">CUSTOMER DETAILS</div>{field('customer','Customer name','e.g. Grace Wanjiku')}{field('phone','Phone number','07xx xxx xxx','tel')}{field('email','Email (optional)','name@email.com','email',false)}<div className="cw-form-section">VEHICLE</div>{field('registration','Registration','KDA 123A')}{field('make','Make','Toyota')}{field('model','Model','Axio')}<div className="cw-two-fields">{field('color','Color','Silver','text',false)}<label className="cw-form-label">WASHER<select required value={form.washerId||''} onChange={(e)=>set('washerId',e.target.value)}><option value="">Leave in waiting queue</option>{db.staff.filter((item)=>item.tenant_id===tenantId&&item.role==='Washer'&&item.status==='Active').map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div><div className="cw-form-section">SERVICE & PAYMENT</div><label className="cw-form-label">SERVICE<select required multiple value={form.serviceIds} onChange={(event)=>set('serviceIds',Array.from(event.target.selectedOptions).map((option)=>option.value))} size="3">{db.services.filter((item)=>item.tenant_id===tenantId&&item.active).map((item)=><option value={item.id} key={item.id}>{item.name} — {formatKes(item.price)}</option>)}</select><small>Use Ctrl / Command to select more than one service.</small></label><div className="cw-two-fields"><label className="cw-form-label">PAYMENT STATUS<select value={form.paymentStatus} onChange={(e)=>set('paymentStatus',e.target.value)}><option value="PAID">Paid at reception</option><option value="UNPAID">Pay at collection</option></select></label><label className="cw-form-label">METHOD<select value={form.method} onChange={(e)=>set('method',e.target.value)}><option>Cash</option><option>M-Pesa</option><option>Card</option><option>Wallet</option></select></label></div></>}
    {type==='customer'&&<>{field('name','Full name','Customer name')}{field('phone','Phone number','07xx xxx xxx','tel')}{field('email','Email (optional)','name@email.com','email',false)}<div className="cw-form-section">VEHICLE (OPTIONAL)</div>{field('registration','Registration','KDA 123A','text',false)}<div className="cw-two-fields">{field('make','Make','Toyota','text',false)}{field('model','Model','Axio','text',false)}</div></>}
    {type==='service'&&<>{field('name','Service name','e.g. Engine bay clean')}{field('category','Category','Exterior / Interior') }<div className="cw-two-fields">{field('price','Customer price (KES)','500','number')}{field('commission','Washer commission (KES)','100','number')}</div>{field('duration','Estimated minutes','30','number')}</>}
    {type==='staff'&&<><p className="cw-form-help">Create a secure invite link for a team member. The link expires after 72 hours.</p>{field('phone','WhatsApp number','+254 7xx xxx xxx','tel')}<label className="cw-form-label">PORTAL<select value={form.role} onChange={(event)=>set('role',event.target.value)}><option value="Washer">Washer</option><option value="Receptionist">Receptionist</option></select></label></>}
    {type==='tenant'&&<>{field('name','Business name','Car wash name')}{field('owner','Business owner','Owner name')}<label className="cw-form-label">PLAN<select value={form.plan} onChange={(e)=>set('plan',e.target.value)}><option>Starter</option><option>Growth</option><option>Enterprise</option></select></label>{field('endsAt','Subscription ends','2026-10-24','date')}</>}
    {type==='plan'&&<>{field('name','Plan name','Growth')}{field('price','Price per period (KES)','7900','number')}{field('days','Subscription length in days','30','number')}{field('features','Included features','Branches, users, reports')}</>}
  </div><div className="cw-modal-actions"><button type="button" className="cw-secondary" onClick={onClose}>Cancel</button><button className="cw-primary" disabled={saving}>{saving?<span className="cw-spinner"/>:<><Check size={16}/>{type==='order'?'Create wash order':'Save record'}</>}</button></div></form></div>;
}
