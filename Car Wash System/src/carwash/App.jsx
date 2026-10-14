import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, BadgeCheck, Banknote,
  Bell, CalendarDays, CarFront, Check, CheckCircle2, ChevronDown, ChevronRight, Copy,
  CircleDollarSign, Clock3, CreditCard, Droplets, FileBarChart2, Gauge,
  Download, History, LayoutDashboard, Languages, LogOut, Menu, MoreHorizontal, Play, Plus, Search,
  Settings, ShieldCheck, Share2, Sparkles, Store, Sun, Moon, UserRound, Users, Wallet, Waves, X, Zap, Eye, EyeOff, Trash2, Pencil, Camera
} from 'lucide-react';
import { supabaseBrowser, supabaseConfigMessage, supabaseErrorMessage, userFacingErrorMessage } from '../services/supabaseBrowser.js';
import SearchableTables from '../components/SearchableTables.jsx';
import { dbMethod, loadLiveBillingStatus, loadLiveStaff, loadLiveWorkspace } from './liveWorkspace.js';
import { getTrialRequestState } from './trialRequestState.js';
import {
  clearLegacyBrowserData, clearSession, demoUsers, formatKes, getSession, markUserSeen,
  newId, readDb, saveSession, todayLabel, wasUserSeen
} from './model.js';

const ROLE_NAV = {
  'SaaS Super Admin': [
    ['overview','Overview',LayoutDashboard],['tenants','Businesses',Store],['plans','Plans & billing',Wallet],['reports','Platform reports',FileBarChart2],['audit','Audit & security',ShieldCheck]
  ],
  'Business Admin': [
    ['overview','Overview',LayoutDashboard],['jobs','Wash queue',Waves],['customers','Customers & vehicles',Users],['services','Services & pricing',Sparkles],['staff','Staff',Users],['payments','Payments',CreditCard],['commissions','Commissions',CircleDollarSign],['loyalty','Loyalty',BadgeCheck],['reports','Reports',FileBarChart2],['audit','Audit & activity',ShieldCheck],['plans-billing','Plans & billing',Wallet],['settings','Settings',Settings]
  ],
  Receptionist: [
    ['overview','Today’s operations',LayoutDashboard],['jobs','Wash queue',Waves],['customers','Customers & vehicles',Users],['payments','Payments',CreditCard],['reports','Reports',FileBarChart2],['settings','Settings',Settings]
  ],
  Washer: [
    ['overview','My jobs',LayoutDashboard],['jobs','Assigned jobs',Waves],['history','Job history',History],['settings','Settings',Settings]
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
const activityKey = (userId) => `osha-cw-last-activity:${userId}`;
const preferenceKey = (userId) => `osha-cw-preferences:${userId}`;
const DEFAULT_APP_PREFERENCES = { compactView: false, sessionTimeout: 30, paymentAlerts: true, overdueAlerts: true, commissionAlerts: true };
const readSessionTimeout = (userId) => {
  try {
    const value = Number(JSON.parse(window.localStorage.getItem(preferenceKey(userId)) || '{}').sessionTimeout);
    return [15,30,60].includes(value) ? value * 60_000 : 30 * 60_000;
  } catch { return 30 * 60_000; }
};
const isSubscriptionReminder = (item) => item?.reference_key?.startsWith('PLAN_REMINDER:') || item?.reference_key?.startsWith('PLAN_OVERDUE:') || /subscription reminder|plan.{0,40}expires?|make a payment before it expires/i.test(`${item?.subject||''} ${item?.body||''}`);

export default function CarWashApp() {
  const [db, setDb] = useState(readDb);
  const [user, setUser] = useState(() => supabaseBrowser ? null : getSession());
  const [authLoading, setAuthLoading] = useState(Boolean(supabaseBrowser));
  const [authRestoreError, setAuthRestoreError] = useState('');
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const inviteLink = new URLSearchParams(window.location.search).has('invite');
  const staffPortal = window.location.pathname === '/washer' ? 'washer' : window.location.pathname === '/receptionist' ? 'receptionist' : '';
  const initialAuthRoute=window.location.hash.match(/^#\/(login|register)(?:\?.*)?$/)?.[1];
  const [showLogin, setShowLogin] = useState(()=>inviteLink||Boolean(staffPortal)||Boolean(initialAuthRoute)||window.sessionStorage.getItem('cw-auth-view')==='login');
  const [authMode, setAuthMode] = useState(()=>inviteLink?'register':staffPortal?'login':initialAuthRoute==='register'?'register':initialAuthRoute==='admin'||initialAuthRoute==='login'?'login':window.sessionStorage.getItem('cw-auth-mode')||'login');
  const [screen, setScreen] = useState(()=>window.sessionStorage.getItem('cw-workspace-screen')||'overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme,setTheme]=useState(()=>window.localStorage.getItem('osha-cw-theme')==='dark'?'dark':'light');
  const [appPreferences,setAppPreferences]=useState(DEFAULT_APP_PREFERENCES);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notificationsRef = useRef([]);
  const sidebarRef=useRef(null);
  const [modal, setModal] = useState('');
  const [toast, setToast] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState('');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [deletingCustomers, setDeletingCustomers] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingService, setEditingService] = useState(null);
  const [editingStaff, setEditingStaff] = useState(null);
  const [selectedJobIds, setSelectedJobIds] = useState([]);
  const [deletingJobs, setDeletingJobs] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [deletingServices, setDeletingServices] = useState(false);
  const [selectedStaffIds, setSelectedStaffIds] = useState([]);
  const [updatingStaff, setUpdatingStaff] = useState(false);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState([]);
  const [selectedCommissionIds, setSelectedCommissionIds] = useState([]);

  useEffect(()=>{ clearLegacyBrowserData(); },[]);
  useEffect(()=>{
    const captureInstallPrompt=(event)=>{event.preventDefault();setInstallPrompt(event);};
    const installed=()=>{setInstallPrompt(null);setToast('OshaHub is installed on this device.');};
    window.addEventListener('beforeinstallprompt',captureInstallPrompt);
    window.addEventListener('appinstalled',installed);
    return()=>{window.removeEventListener('beforeinstallprompt',captureInstallPrompt);window.removeEventListener('appinstalled',installed);};
  },[]);
  useEffect(()=>{window.localStorage.setItem('osha-cw-theme',theme);},[theme]);
  useEffect(()=>{if(!user?.authUserId||!supabaseBrowser)return undefined;let active=true;supabaseBrowser.auth.getUser().then(({data,error})=>{if(active&&!error){const metadata=data?.user?.user_metadata||{};if(['light','dark'].includes(metadata.oshaHubTheme))setTheme(metadata.oshaHubTheme);setUser((current)=>current?.authUserId===user.authUserId?{...current,profilePhoto:metadata.oshaHubAvatar||''}:current);}});return()=>{active=false;};},[user?.authUserId]);
  useEffect(()=>{
    if(!user)return;
    try{
      const saved=JSON.parse(window.localStorage.getItem(preferenceKey(user.authUserId||user.email))||'{}');
      setAppPreferences({
        compactView:typeof saved.compactView==='boolean'?saved.compactView:DEFAULT_APP_PREFERENCES.compactView,
        sessionTimeout:[15,30,60].includes(Number(saved.sessionTimeout))?Number(saved.sessionTimeout):DEFAULT_APP_PREFERENCES.sessionTimeout,
        paymentAlerts:typeof saved.paymentAlerts==='boolean'?saved.paymentAlerts:DEFAULT_APP_PREFERENCES.paymentAlerts,
        overdueAlerts:typeof saved.overdueAlerts==='boolean'?saved.overdueAlerts:DEFAULT_APP_PREFERENCES.overdueAlerts,
        commissionAlerts:typeof saved.commissionAlerts==='boolean'?saved.commissionAlerts:DEFAULT_APP_PREFERENCES.commissionAlerts
      });
    }
    catch{setAppPreferences(DEFAULT_APP_PREFERENCES);}
  },[user?.authUserId,user?.email]);
  function closeMenuFromOutside(event){if(sidebarRef.current?.contains(event.target))return;if(window.matchMedia('(max-width: 980px)').matches){if(menuOpen)setMenuOpen(false);return;}if(!sidebarCollapsed)setSidebarCollapsed(true);}
  useEffect(()=>{
    if(!supabaseBrowser){setAuthLoading(false);return undefined;}
    let active=true;
    const restore=async()=>{
      // Invitation auth is handled by LoginScreen so the invite is consumed once
      // and a pending account can be returned to the login screen cleanly.
      if(inviteLink&&staffPortal){setAuthLoading(false);return;}
      setAuthLoading(true);setAuthRestoreError('');
      try{
        const {data,error}=await supabaseBrowser.auth.getSession();
        if(error)throw error;
        if(!active)return;
        const authUser=data.session?.user;
        if(!authUser)return;
        const key=activityKey(authUser.id);
        const lastActivity=Number(window.localStorage.getItem(key)||0);
        if(lastActivity&&Date.now()-lastActivity>=readSessionTimeout(authUser.id)){
          await supabaseBrowser.auth.signOut();
          window.localStorage.removeItem(key);clearSession();setUser(null);setShowLogin(false);window.location.hash='/';
          return;
        }
        if(!lastActivity)window.localStorage.setItem(key,String(Date.now()));
        const {data:memberships,error:membershipError}=await supabaseBrowser.from('carwash_memberships').select('id,role,tenant_id,full_name,phone,branch,status').eq('user_id',authUser.id).eq('status','ACTIVE').order('role').limit(50);
        if(membershipError)throw membershipError;
        const platformAdmin=(memberships||[]).some((item)=>item.role==='SUPER_ADMIN');
        if(platformAdmin){await supabaseBrowser.auth.signOut();window.localStorage.removeItem(key);clearSession();setShowLogin(true);setAuthRestoreError('This is a platform administrator account. Sign in at /super-admin.html.');return;}
        const preferredTenant=window.localStorage.getItem(`cw-active-tenant:${authUser.id}`);
        const inviteToken=new URLSearchParams(window.location.search).get('invite')||authUser.user_metadata?.invite_token;
        let membership;
        if(inviteToken){const {data:invited,error:inviteError}=await supabaseBrowser.rpc('carwash_accept_staff_invitation',{invite_token:inviteToken,staff_name:authUser.user_metadata?.full_name||authUser.email});if(inviteError)throw inviteError;membership=invited;window.localStorage.setItem(`cw-active-tenant:${authUser.id}`,invited.tenant_id);clearStaffInviteFromUrl();void supabaseBrowser.auth.updateUser({data:{invite_token:null}});}
        else membership=(memberships||[]).find((item)=>['BUSINESS_ADMIN','RECEPTIONIST','WASHER'].includes(item.role)&&(!preferredTenant||item.tenant_id===preferredTenant))||(memberships||[]).find((item)=>['BUSINESS_ADMIN','RECEPTIONIST','WASHER'].includes(item.role));
        if(!membership){await supabaseBrowser.auth.signOut();window.localStorage.removeItem(key);setShowLogin(true);setAuthRestoreError('This account has no active business workspace membership. Sign in with an approved business or staff account.');return;}
        const role=({BUSINESS_ADMIN:'Business Admin',RECEPTIONIST:'Receptionist',WASHER:'Washer'})[membership.role];
        const {data:tenant,error:tenantError}=await supabaseBrowser.from('carwash_tenants').select('name').eq('id',membership.tenant_id).single();
        if(tenantError)throw tenantError;
        const {data:canOperate,error:billingError}=await supabaseBrowser.rpc('carwash_can_operate',{target_tenant:membership.tenant_id});
        if(billingError)throw billingError;
        {const {error:noticeError}=await supabaseBrowser.rpc('carwash_notify_billing_status',{target_tenant:membership.tenant_id});if(noticeError)throw noticeError;}
        const {data:messages,error:messageError}=await supabaseBrowser.from('carwash_user_messages').select('id,body').eq('user_id',authUser.id).is('read_at',null).order('created_at',{ascending:false}).limit(1);
        if(messageError)throw messageError;
        if(active){const session={id:authUser.id,authUserId:authUser.id,staffId:membership.id,email:authUser.email,name:membership.full_name||authUser.email,phone:membership.phone||'',profilePhoto:authUser.user_metadata?.oshaHubAvatar||'',role,tenant_id:membership.tenant_id,tenant_name:tenant.name,branch:membership.branch||'',billingRestricted:canOperate===false,activationMessage:canOperate===false?`Your ${tenant.name} workspace is restricted because its plan has expired. Make a payment to continue using ${tenant.name}.`:messages?.[0]?.body};saveSession(session);setUser(session);}
      }catch(error){if(active)setAuthRestoreError(supabaseErrorMessage(error,'Unable to reconnect your workspace. Check your connection and retry.'));}
      finally{if(active)setAuthLoading(false);}
    };
    restore();
    return()=>{active=false;};
  },[restoreAttempt]);
  useEffect(()=>{
    if(!user?.authUserId||!user.tenant_id)return;
    let active=true; setLiveLoading(true); setLiveError('');
    loadLiveWorkspace(user).then(({db:liveDb})=>{if(active)setDb(liveDb);}).catch((error)=>{if(active)setLiveError(userFacingErrorMessage(error,'Unable to load this business workspace. Refresh and try again.'));}).finally(()=>{if(active)setLiveLoading(false);});
    return()=>{active=false;};
  },[user?.authUserId,user?.tenant_id]);
  useEffect(()=>{
    if(!user?.authUserId||!user.tenant_id||user.role!=='Business Admin'||db.activeTenantId!==user.tenant_id)return undefined;
    let active=true;let pending=false;
    const previousSubscription=db.billing?.currentSubscription||null;
    const refreshBillingStatus=async()=>{
      if(pending||document.visibilityState==='hidden')return;
      pending=true;
      try{
        const {tenant:liveTenant,subscriptions}=await loadLiveBillingStatus(user);
        if(!active)return;
        const currentSubscription=subscriptions[0]||null;
        const changed=previousSubscription?.id!==currentSubscription?.id
          ||previousSubscription?.status!==currentSubscription?.status
          ||previousSubscription?.starts_at!==currentSubscription?.starts_at
          ||previousSubscription?.ends_at!==currentSubscription?.ends_at;
        const tenantStatusChanged=db.tenants?.find((item)=>item.id===user.tenant_id)?.status!==liveTenant.status;
        const trialExtensionMarkerChanged=(db.billing?.trialExtensionUsedAt||null)!==(liveTenant.trial_extension_used_at||null);
        if(changed||tenantStatusChanged||trialExtensionMarkerChanged)setDb((current)=>{
          if(current.activeTenantId!==user.tenant_id)return current;
          const plan=current.billing?.plans?.find((item)=>item.id===currentSubscription?.plan_id)||null;
          return {
            ...current,
            tenants:(current.tenants||[]).map((item)=>item.id===user.tenant_id?{...item,status:liveTenant.status,plan:plan?.name||item.plan,branches:currentSubscription?.branch_count||item.branches}:item),
            billing:{...current.billing,subscriptions,currentSubscription,currentPlan:plan||current.billing?.currentPlan||null,trialExtensionUsedAt:liveTenant.trial_extension_used_at||current.billing?.trialExtensionUsedAt||null},
          };
        });
        if(changed&&currentSubscription?.status==='TRIAL'){
          setToast(`A new 7-day trial is active for ${user.tenant_name||'your business'}.`);
        }
        if(changed){
          const {data:canOperate,error}=await supabaseBrowser.rpc('carwash_can_operate',{target_tenant:user.tenant_id});
          if(active&&!error&&Boolean(canOperate)!==Boolean(user.billingRestricted)){
            const next={...user,billingRestricted:canOperate===false,activationMessage:canOperate===false?`Your ${user.tenant_name||'business'} workspace is restricted because its plan has expired. Make a payment to continue using ${user.tenant_name||'your business workspace'}.`:''};
            setUser(next);saveSession(next);
          }
        }
      }catch{/* Keep the last known subscription state during temporary connection errors. */}
      finally{pending=false;}
    };
    void refreshBillingStatus();
    const timer=window.setInterval(refreshBillingStatus,10000);
    const onVisible=()=>{if(document.visibilityState==='visible')void refreshBillingStatus();};
    document.addEventListener('visibilitychange',onVisible);
    return()=>{active=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);};
  },[user?.authUserId,user?.tenant_id,user?.role,user?.billingRestricted,db.activeTenantId,db.billing?.currentSubscription?.id,db.billing?.currentSubscription?.status,db.billing?.currentSubscription?.starts_at,db.billing?.currentSubscription?.ends_at,db.billing?.trialExtensionUsedAt]);
  useEffect(()=>{
    if(!user?.authUserId||!user.tenant_id||user.role!=='Business Admin'||screen!=='staff')return undefined;
    let active=true;let pending=false;
    const refreshStaff=async()=>{
      if(pending)return;
      pending=true;
      try{
        const staff=await loadLiveStaff(user);
        if(active)setDb((current)=>({...current,staff}));
      }catch(error){
        if(active)setLiveError(userFacingErrorMessage(error,'Unable to refresh team approvals.'));
      }finally{pending=false;}
    };
    void refreshStaff();
    const timer=window.setInterval(refreshStaff,5000);
    return()=>{active=false;window.clearInterval(timer);};
  },[user?.authUserId,user?.tenant_id,user?.role,screen]);
  useEffect(()=>{
    const pending=db.billing?.pendingRequest;
    if(!user?.authUserId||!user.tenant_id||pending?.request_type!=='PLAN_PURCHASE'||pending.mpesa_payment_status==='FAILED'||pending.mpesa_payment_status==='PAID')return undefined;
    let active=true;let timer;
    const checkPayment=async()=>{
      const {data,error}=await supabaseBrowser.from('carwash_billing_requests').select('status,mpesa_payment_status').eq('id',pending.id).maybeSingle();
      if(!active||error||!data)return;
      if(data.mpesa_payment_status==='PAID'||data.status==='APPROVED'){
        try{const {db:liveDb}=await loadLiveWorkspace(user);if(active)setDb(liveDb);}catch{}
        return;
      }
      timer=window.setTimeout(checkPayment,5000);
    };
    timer=window.setTimeout(checkPayment,5000);
    return()=>{active=false;window.clearTimeout(timer);};
  },[user?.authUserId,user?.tenant_id,db.billing?.pendingRequest?.id,db.billing?.pendingRequest?.request_type,db.billing?.pendingRequest?.status,db.billing?.pendingRequest?.mpesa_payment_status]);
  useEffect(()=>{
    if(!user?.authUserId)return;
    let active=true;
    const refresh=()=>supabaseBrowser.from('carwash_user_messages').select('id,kind,subject,body,read_at,created_at,reference_key').eq('user_id',user.authUserId).order('created_at',{ascending:false}).limit(50)
      .then(({data,error})=>{if(!active||error)return;const next=data||[];const fresh=next.find(isSubscriptionReminder);if(!['washer','receptionist'].includes(String(user.role).toLowerCase())&&fresh&&!notificationsRef.current.some((item)=>item.id===fresh.id))setToast(fresh.body);notificationsRef.current=next;setNotifications(next);});
    refresh();
    const timer=window.setInterval(async()=>{
      const {error:reminderError}=await supabaseBrowser.rpc('carwash_notify_billing_status',{target_tenant:user.tenant_id});
      const {data:canOperate,error:billingError}=await supabaseBrowser.rpc('carwash_can_operate',{target_tenant:user.tenant_id});
      if(!active)return;
      if(!reminderError&&!billingError&&Boolean(canOperate)!==Boolean(user.billingRestricted)){
        const next={...user,billingRestricted:canOperate===false,activationMessage:canOperate===false?`Your ${user.tenant_name||'business'} workspace is restricted because its plan has expired. Make a payment to continue using ${user.tenant_name||'your business workspace'}.`:''};
        setUser(next);saveSession(next);
        if(canOperate===false&&!['washer','receptionist'].includes(String(user.role).toLowerCase()))setToast(next.activationMessage);
      }
      refresh();
    },60000);
    const messageTimer=window.setInterval(refresh,30000);
    return()=>{active=false;window.clearInterval(timer);window.clearInterval(messageTimer);};
  },[user?.authUserId,user?.tenant_id,user?.billingRestricted,user?.role]);
  useEffect(()=>{
    if(!user?.authUserId)return undefined;
    const key=activityKey(user.authUserId);
    const updateActivity=()=>window.localStorage.setItem(key,String(Date.now()));
    const expireIfIdle=()=>{
      const lastActivity=Number(window.localStorage.getItem(key)||Date.now());
      if(Date.now()-lastActivity<Number(appPreferences.sessionTimeout||30)*60_000)return;
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
  },[user?.authUserId,appPreferences.sessionTimeout]);
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
  const isStaffRole = ['washer','receptionist'].includes(String(role).toLowerCase());
  const visibleNotifications = notifications.filter((item)=>{
    const text=`${item.subject||''} ${item.body||''}`.toLowerCase();
    if(isSubscriptionReminder(item))return !isStaffRole&&appPreferences.overdueAlerts;
    if(/commission|payout|earning/.test(text))return appPreferences.commissionAlerts;
    if(/payment|receipt|m-pesa|mpesa|billing/.test(text))return appPreferences.paymentAlerts;
    return true;
  });
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
    if(!isStaffRole)return;
    const portalPath=String(role).toLowerCase()==='washer'?'/washer':'/receptionist';
    if(window.location.pathname!==portalPath)window.history.replaceState(window.history.state,'',`${portalPath}${window.location.search}${window.location.hash}`);
    const manifest=document.querySelector('link[rel="manifest"]');
    if(manifest)manifest.href=String(role).toLowerCase()==='washer'?'/washer.webmanifest':'/receptionist.webmanifest';
  },[role,isStaffRole]);

  useEffect(()=>{
    if(!user)return;
    const saved=window.sessionStorage.getItem('cw-workspace-screen');
    if(!myNav.some(([key])=>key===screen))setScreen(myNav.some(([key])=>key===saved)?saved:'overview');
  },[user?.id,role]);

  function patchDb(edit) { setDb((old)=>edit(JSON.parse(JSON.stringify(old)))); }
  function notify(message,type='success') { setToast({message,type}); }
  async function installApp(){
    if(!installPrompt){
      const isInstalled=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
      if(isInstalled){notify('OshaHub is already installed on this device.');return;}
      const isIos=/iphone|ipad|ipod/i.test(navigator.userAgent);
      const isAndroid=/android/i.test(navigator.userAgent);
      notify(isIos?'On iPhone or iPad, open this page in Safari, tap Share, then Add to Home Screen.':isAndroid?'The install prompt is not available yet. Open this app in Chrome and choose Install app from the browser menu.':'The install prompt is not available yet. In Chrome or Edge, choose Install app from the address bar or browser menu.');
      return;
    }
    try{
      await installPrompt.prompt();
      const result=await installPrompt.userChoice;
      if(result?.outcome==='accepted')notify('OshaHub was added to this device.');
      else notify('You can install OshaHub any time from this button.');
    }catch{notify('The browser could not start the install prompt. Refresh the app and try again.');}
    finally{setInstallPrompt(null);}
  }
  async function copyPortalAppLink(){
    const portalPath=String(role).toLowerCase()==='washer'?'/washer':'/receptionist';
    const portalUrl=new URL(portalPath,window.location.origin).toString();
    try{await navigator.clipboard.writeText(portalUrl);}
    catch{const input=document.createElement('textarea');input.value=portalUrl;input.setAttribute('readonly','');input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();const copied=document.execCommand('copy');input.remove();if(!copied){notify('Could not copy the app link. Open '+portalUrl+' and copy it from the address bar.');return;}}
    notify(`${role} app link copied.`);
  }
  async function changeTheme(nextTheme){setTheme(nextTheme);if(!user?.authUserId||!supabaseBrowser)return;try{const {error}=await supabaseBrowser.auth.updateUser({data:{oshaHubTheme:nextTheme}});if(error)notify('Theme updated on this device, but could not sync to your OshaHub account.');}catch{notify('Theme updated on this device, but could not sync to your OshaHub account.');}}
  async function changeProfilePhoto(photo){
    const previous=user?.profilePhoto||'';
    const next={...user,profilePhoto:photo||''};setUser(next);saveSession(next);
    try{
      if(user?.authUserId&&supabaseBrowser){const {error}=await supabaseBrowser.auth.updateUser({data:{oshaHubAvatar:photo||null}});if(error)throw error;}
      else {const key=`osha-cw-avatar:${user?.email||'guest'}`;if(photo)window.localStorage.setItem(key,photo);else window.localStorage.removeItem(key);}
    }catch(error){const restored={...user,profilePhoto:previous};setUser(restored);saveSession(restored);throw error;}
  }
  function updateAppPreferences(changes){setAppPreferences((old)=>{const next={...old,...changes};try{window.localStorage.setItem(preferenceKey(user?.authUserId||user?.email||'guest'),JSON.stringify(next));}catch{}return next;});}
  async function saveOwnProfile(form){
    const fullName=form.name.trim(),phone=form.phone.trim(),branch=form.branch.trim();
    if(fullName.length<2||fullName.length>120||branch.length<2||branch.length>120||(phone&&(phone.length<7||phone.length>30)))throw new Error('Enter a valid name, phone number and branch.');
    let profile={full_name:fullName,phone,branch};
    if(user.authUserId){
      const {data:updated,error}=await supabaseBrowser.rpc('carwash_update_own_profile',{target_membership:user.staffId,p_full_name:fullName,p_phone:phone||null,p_branch:branch});
      if(error)throw error;
      profile={full_name:updated.full_name,phone:updated.phone||'',branch:updated.branch||''};
    }
    const next={...user,name:profile.full_name,phone:profile.phone,branch:profile.branch};
    setUser(next);saveSession(next);notify('Your profile was saved.');return next;
  }
  function navigate(key) { setScreen(key); setMenuOpen(false); setQuery(''); setFilter('All'); }
  function login(selected) {
    if(!selected)return;
    const staff = selected.role==='Washer' ? db.staff.find((item)=>item.email===selected.email) : null;
    const session={...selected, ...(staff?{staffId:staff.id}:{}), signedAt:new Date().toISOString()};
    setToast(selected.activationMessage || `${wasUserSeen(selected.email)?'Welcome back':'Welcome'}, ${selected.name.split(' ')[0]}`);
    markUserSeen(selected.email);
    window.sessionStorage.removeItem('cw-auth-view');window.sessionStorage.removeItem('cw-auth-mode');window.location.hash='/';
    if(session.authUserId&&session.tenant_id)window.localStorage.setItem(`cw-active-tenant:${session.authUserId}`,session.tenant_id);
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
        const {db:next}=await loadLiveWorkspace(user);setDb(next);notify(action==='complete'?'Wash marked finished.':`Job moved to ${state.toLowerCase()}.`);
      }catch(error){notify(userFacingErrorMessage(error,'Could not update this wash order. Refresh and try again.'),'error');}})();
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
    else if(affected)notify(action==='complete'?'Wash marked finished.':`Job moved to ${to.toLowerCase()}.`);
  }

  function recordPayment(job) {
    if(job.paymentStatus==='PAID')return;
    if(user.authUserId){
      if(user.billingRestricted){notify('This plan is overdue. Payments are restricted until the plan is reactivated.');return;}
      (async()=>{try{const outstanding=Number((job.total-(job.paidAmount||0)).toFixed(2));const {error}=await supabaseBrowser.rpc('carwash_record_payment',{target_order:job.id,paid_amount:outstanding,payment_method:'CASH',payment_reference:null});if(error)throw error;const {db:next}=await loadLiveWorkspace(user);setDb(next);notify('Payment recorded.');}catch(error){notify(userFacingErrorMessage(error,'Could not record payment. Refresh and try again.'),'error');}})();
      return;
    }
    patchDb((next)=>{
      const item=next.jobs.find((row)=>row.id===job.id);if(!item||item.paymentStatus==='PAID')return next;
      item.paymentStatus='PAID';item.paymentMethod='Cash';
      next.payments.unshift({id:newId('pay'),tenant_id:item.tenant_id,jobId:item.id,customerId:item.customerId,amount:item.total,method:'Cash',status:'PAID',reference:`CASH-${item.id}`,time:shortTime(),recordedAt:new Date().toISOString()});
      next.audit.unshift({id:newId('evt'),tenant_id:item.tenant_id,action:'Payment recorded',detail:`${formatKes(item.total)} cash · ${item.id}`,time:shortTime()});return next;
    }); notify('Payment recorded.');
  }

  async function deleteCustomers(ids) {
    const selected=[...new Set(ids)];
    const safe=selected.filter((id)=>{const customer=scopedCustomers.find((item)=>item.id===id);return customer&&!customer.visits&&!scoped(db.vehicles).some((vehicle)=>vehicle.customerId===id);});
    if(!safe.length){notify('Only customer records without vehicles or wash history can be deleted.');return;}
    if(!window.confirm(`Delete ${safe.length} selected customer record${safe.length===1?'':'s'}? This action cannot be undone.`))return;
    if(user.billingRestricted){notify('This plan is overdue. Workspace changes are read-only.');return;}
    setDeletingCustomers(true);
    try{
      if(user.authUserId){const {error}=await supabaseBrowser.from('carwash_customers').delete().eq('tenant_id',tenantId).in('id',safe).abortSignal(AbortSignal.timeout(15000));if(error)throw error;setDb((old)=>({...old,customers:old.customers.filter((customer)=>!safe.includes(customer.id))}));}
      else patchDb((next)=>{next.customers=next.customers.filter((customer)=>!safe.includes(customer.id));return next;});
      setSelectedCustomerIds((old)=>old.filter((id)=>!safe.includes(id)));
      const kept=selected.length-safe.length;
      notify(`${safe.length} customer record${safe.length===1?'':'s'} deleted.${kept?` ${kept} kept because they have vehicles or wash history.`:''}`);
    }catch(error){notify(error.name==='TimeoutError'||error.name==='AbortError'?'Deletion timed out. Refresh the customer list and try again.':userFacingErrorMessage(error,'Could not delete the selected customers.'),'error');}
    finally{setDeletingCustomers(false);}
  }

  async function deleteWashOrders(ids){
    const selected=[...new Set(ids)];
    const safe=selected.filter((id)=>{const job=scopedJobs.find((item)=>item.id===id);return job&&['WAITING','ASSIGNED'].includes(job.status)&&job.paymentStatus==='UNPAID'&&!job.paidAmount;});
    if(!safe.length){notify('Only unpaid orders that have not started can be deleted.');return;}
    if(!window.confirm(`Delete ${safe.length} selected unpaid wash order${safe.length===1?'':'s'}? This cannot be undone.`))return;
    if(user.billingRestricted){notify('This plan is overdue. Workspace changes are read-only.');return;}
    setDeletingJobs(true);
    try{
      if(user.authUserId){const {data:deleted,error}=await supabaseBrowser.rpc('carwash_delete_unpaid_orders',{target_tenant:tenantId,p_order_ids:safe}).abortSignal(AbortSignal.timeout(15000));if(error)throw error;if(deleted!==safe.length)throw new Error('Some selected orders changed or are protected. Refresh the wash queue before trying again.');}
      setDb((old)=>({...old,jobs:old.jobs.filter((job)=>!safe.includes(job.id))}));
      setSelectedJobIds((old)=>old.filter((id)=>!safe.includes(id)));
      const kept=selected.length-safe.length;
      notify(`${safe.length} unpaid wash order${safe.length===1?'':'s'} deleted.${kept?` ${kept} paid, started, or completed orders kept in history.`:''}`);
    }catch(error){notify(error.name==='TimeoutError'||error.name==='AbortError'?'Deletion timed out. Refresh the wash queue before retrying.':userFacingErrorMessage(error,'Could not delete the selected wash orders. Refresh the queue and try again.'),'error');}
    finally{setDeletingJobs(false);}
  }

  async function deleteUnusedServices(ids){
    const selected=[...new Set(ids)];
    const safe=selected.filter((id)=>scopedServices.some((service)=>service.id===id)&&!scopedJobs.some((job)=>job.serviceIds?.includes(id)));
    if(!safe.length){notify('Services used on wash orders are kept in the record history.');return;}
    if(!window.confirm(`Delete ${safe.length} selected unused service${safe.length===1?'':'s'}? This cannot be undone.`))return;
    if(user.billingRestricted){notify('This plan is overdue. Workspace changes are read-only.');return;}
    setDeletingServices(true);
    try{
      if(user.authUserId){const {data:deleted,error}=await supabaseBrowser.rpc('carwash_delete_unused_services',{target_tenant:tenantId,p_service_ids:safe}).abortSignal(AbortSignal.timeout(15000));if(error)throw error;if(deleted!==safe.length)throw new Error('Some selected services are now used by a wash order. Refresh the service list before trying again.');}
      setDb((old)=>({...old,services:old.services.filter((service)=>!safe.includes(service.id))}));
      setSelectedServiceIds((old)=>old.filter((id)=>!safe.includes(id)));
      const kept=selected.length-safe.length;
      notify(`${safe.length} unused service${safe.length===1?'':'s'} deleted.${kept?` ${kept} services kept because they appear on wash orders.`:''}`);
    }catch(error){notify(error.name==='TimeoutError'||error.name==='AbortError'?'Deletion timed out. Refresh services before retrying.':userFacingErrorMessage(error,'Could not delete the selected services. Refresh and try again.'),'error');}
    finally{setDeletingServices(false);}
  }

  async function updateSelectedStaff(ids,nextActive){
    const members=scopedStaff.filter((person)=>['Washer','Receptionist'].includes(person.role)&&ids.includes(person.id)&&((person.status==='Active')!==nextActive));
    if(!members.length){notify('No selected staff members need that access change.');return;}
    if(user.billingRestricted){notify('This plan is overdue. Workspace changes are read-only.');return;}
    const pendingCount=members.filter((person)=>person.status==='Pending approval').length;
    const actionLabel=nextActive?(pendingCount?'Approve':'Reactivate'):'Deactivate';
    if(!window.confirm(`${actionLabel} access for ${members.length} selected staff member${members.length===1?'':'s'}? Their work history will be retained.`))return;
    setUpdatingStaff(true);
    try{
      if(user.authUserId){const results=await Promise.all(members.map((person)=>supabaseBrowser.rpc('carwash_update_staff_status',{target_membership:person.id,next_status:nextActive?'ACTIVE':'SUSPENDED'})));const failure=results.find((result)=>result.error);if(failure)throw failure.error;const {db:next}=await loadLiveWorkspace(user);setDb(next);}
      else patchDb((next)=>{for(const person of members){const item=next.staff.find((row)=>row.id===person.id);if(item)item.status=nextActive?'Active':'Inactive';}return next;});
      setSelectedStaffIds((old)=>old.filter((id)=>!members.some((person)=>person.id===id)));notify(`${members.length} staff access record${members.length===1?'':'s'} updated. Their work history remains available.`);
    }catch(error){notify(userFacingErrorMessage(error,'Could not update the selected staff members. Refresh and try again.'),'error');}
    finally{setUpdatingStaff(false);}
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
        } else if(modal==='customer-edit'){
          const {data:updatedCustomer,error}=await supabaseBrowser.from('carwash_customers').update({full_name:form.name.trim(),phone:form.phone.trim(),email:form.email.trim()||null}).eq('tenant_id',tenant_id).eq('id',form.id).select('id').maybeSingle();if(error)throw error;if(!updatedCustomer)throw new Error('This customer could not be found. Refresh the list and try again.');
          const vehicles=form.vehicles||[];
          const results=await Promise.all(vehicles.map((vehicle)=>supabaseBrowser.from('carwash_vehicles').update({registration:vehicle.registration.trim().toUpperCase(),make:vehicle.make.trim(),model:vehicle.model.trim(),color:vehicle.color.trim()||null}).eq('tenant_id',tenant_id).eq('customer_id',form.id).eq('id',vehicle.id).select('id')));
          const vehicleFailure=results.find((result)=>result.error||result.data?.length!==1);if(vehicleFailure)throw vehicleFailure.error||new Error('A vehicle could not be updated. Refresh the customer record and try again.');
        } else if(modal==='service-edit'){
          const {data:updatedService,error}=await supabaseBrowser.from('carwash_services').update({name:form.name.trim(),category:form.category.trim()||null,price_kes:K(form.price),commission_kes:K(form.commission),estimated_minutes:K(form.duration)}).eq('tenant_id',tenant_id).eq('id',form.id).select('id').maybeSingle();if(error)throw error;if(!updatedService)throw new Error('This service could not be found. Refresh the list and try again.');
        } else if(modal==='staff-edit'){
          const {error}=await supabaseBrowser.rpc('carwash_update_staff_profile',{target_membership:form.id,p_full_name:form.name.trim(),p_branch:form.branch.trim()});if(error)throw error;
        } else if(modal==='customer'){
          const {data:customer,error}=await supabaseBrowser.from('carwash_customers').insert({tenant_id,full_name:form.name.trim(),phone:form.phone.trim(),email:form.email.trim()||null}).select().single();if(error)throw error;
          if(form.registration.trim()){const {error:vehicleError}=await supabaseBrowser.from('carwash_vehicles').insert({tenant_id,customer_id:customer.id,registration:form.registration.trim().toUpperCase(),make:form.make.trim()||'Unknown',model:form.model.trim()||'Unknown'});if(vehicleError)throw vehicleError;}
        } else if(modal==='service'){
          const {error}=await supabaseBrowser.from('carwash_services').insert({tenant_id,name:form.name.trim(),category:form.category.trim()||null,price_kes:K(form.price),commission_kes:K(form.commission),estimated_minutes:K(form.duration)||30,active:true});if(error)throw error;
        } else if(modal==='staff'){
          const staffPhone=form.phone.replace(/\D/g,'');if(!/^(?:0[17]\d{8}|254[17]\d{8})$/.test(staffPhone))throw new Error('Enter a Kenyan mobile number beginning with 01 or 07.');const {data:token,error}=await supabaseBrowser.rpc('carwash_create_staff_invite',{target_tenant:tenant_id,target_phone:staffPhone,target_role:form.role.toUpperCase()});if(error)throw error;
          const invitePath=form.role==='Washer'?'/washer':'/receptionist';const inviteUrl=new URL(invitePath,window.location.origin);inviteUrl.searchParams.set('invite',token);
          notify(`${form.role} invitation link generated. It expires in 72 hours.`);
          return {inviteUrl:inviteUrl.toString()};
        }
        const {db:next}=await loadLiveWorkspace(user);setDb(next);setModal('');notify('Saved successfully.');
      }catch(error){notify(userFacingErrorMessage(error,'Could not save this change. Check the information and try again.'),'error');}
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
        const availableWashers=next.staff.filter((person)=>person.tenant_id===tenant_id&&person.role==='Washer'&&person.status==='Active');
        const washer=availableWashers.sort((a,b)=>next.jobs.filter((item)=>item.washerId===a.id&&['ASSIGNED','IN PROGRESS'].includes(item.status)).length-next.jobs.filter((item)=>item.washerId===b.id&&['ASSIGNED','IN PROGRESS'].includes(item.status)).length)[0];
        const job={id,tenant_id,customerId:customer.id,vehicleId:vehicle.id,serviceIds:services.map((item)=>item.id),washerId:washer?.id||null,status:washer?'ASSIGNED':'WAITING',total,commission,paymentStatus:paid?'PAID':'UNPAID',paymentMethod:method,createdAt:shortTime()};
        next.jobs.unshift(job);
        if(paid)next.payments.unshift({id:newId('pay'),tenant_id,jobId:id,customerId:customer.id,amount:total,method,status:'PAID',reference:method==='Cash'?`CASH-${id}`:'',time:shortTime(),recordedAt:new Date().toISOString()});
        next.audit.unshift({id:newId('evt'),tenant_id,action:'Vehicle checked in',detail:`${job.id} · ${vehicle.registration} · ${customer.name}`,time:shortTime()});
      } else if(modal==='customer-edit'){
        const customer=next.customers.find((item)=>item.id===form.id&&item.tenant_id===tenant_id);if(customer){customer.name=form.name.trim();customer.phone=form.phone.trim();customer.email=form.email.trim();}
        for(const vehicle of form.vehicles||[]){const row=next.vehicles.find((item)=>item.id===vehicle.id&&item.customerId===form.id);if(row){row.registration=vehicle.registration.trim().toUpperCase();row.make=vehicle.make.trim();row.model=vehicle.model.trim();row.color=vehicle.color.trim();}}
      } else if(modal==='service-edit'){
        const service=next.services.find((item)=>item.id===form.id&&item.tenant_id===tenant_id);if(service){service.name=form.name.trim();service.category=form.category.trim();service.price=K(form.price);service.commission=K(form.commission);service.duration=K(form.duration);}
      } else if(modal==='staff-edit'){
        const person=next.staff.find((item)=>item.id===form.id&&item.tenant_id===tenant_id);if(person){person.name=form.name.trim();person.branch=form.branch.trim();}
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
  const visibleUnpaidJobs=role==='Washer'||!appPreferences.paymentAlerts?[]:scopedJobs.filter((job)=>job.paymentStatus!=='PAID');
  const notificationCount=visibleNotifications.filter((item)=>!item.read_at).length+visibleUnpaidJobs.length;
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

  return <div className={`cw-shell ${theme==='dark'?'theme-dark':''} ${appPreferences.compactView?'compact-view':''} ${role==='Washer'?'role-washer':''}`} onPointerDownCapture={closeMenuFromOutside}>
    <SearchableTables />
    <aside ref={sidebarRef} className={`cw-sidebar ${menuOpen?'is-open':''} ${sidebarCollapsed?'is-collapsed':''}`}>
      <div className="cw-brand"><img src="/osha-hub-logo.svg" alt="OshaHub"/><button className="cw-icon-button cw-sidebar-brand-toggle" onClick={()=>{if(window.matchMedia('(max-width: 980px)').matches)setMenuOpen(false);else setSidebarCollapsed((collapsed)=>!collapsed);}} aria-label={menuOpen?'Close side menu':sidebarCollapsed?'Expand side menu':'Collapse side menu'}>{menuOpen?<X size={19}/>:<Menu size={19}/>}</button></div>
      <div className="cw-workspace"><div className="cw-workspace-mark"><Store size={16}/></div><div className="cw-workspace-copy"><b>{role==='SaaS Super Admin'?'Platform owner':tenant?.name||db.settings.businessName}</b><span>{ROLE_COPY[role]}</span></div><ChevronDown size={15}/></div>
      <div className="cw-nav-label">WORKSPACE</div>
      <nav className="cw-nav">{myNav.map(([key,label,Icon])=><button key={key} className={`cw-nav-item ${screen===key?'active':''}`} onClick={()=>navigate(key)}><Icon size={18}/><span>{label}</span>{key==='jobs'&&activeCount>0&&<i>{activeCount}</i>}</button>)}</nav>
      <div className="cw-sidebar-bottom">{!isStaffRole&&<div className="cw-plan-card"><div className="cw-plan-icon"><Sparkles size={15}/></div><div><b>{role==='SaaS Super Admin'?'Platform health':`${tenant?.plan||'Growth'} plan`}</b><small>{role==='SaaS Super Admin'?'All services operational':`${db.billing?.currentSubscription?.status||tenant?.status||'ACTIVE'} subscription`}</small></div><ArrowRight size={15}/></div>}<button className="cw-user-menu" onClick={()=>navigate('profile')}><div className="cw-avatar">{user.profilePhoto?<img src={user.profilePhoto} alt=""/>:user.name.split(' ').map((part)=>part[0]).slice(0,2).join('')}</div><span><b>{user.name}</b><small>{user.role}</small></span><MoreHorizontal size={17}/></button><button className="cw-signout" onClick={logout}><LogOut size={16}/>Sign out</button></div>
    </aside>
    {menuOpen&&<button className="cw-mobile-scrim" onPointerDown={()=>setMenuOpen(false)} onClick={()=>setMenuOpen(false)} aria-label="Close navigation"/>}
    <main className="cw-main">
      <header className="cw-topbar">
        {!menuOpen&&<button className="cw-icon-button cw-mobile-open" onClick={()=>setMenuOpen(true)} aria-label="Open navigation menu"><MoreHorizontal size={21}/></button>}
        <div className="cw-crumb"><span>{role==='SaaS Super Admin'?'Platform':tenant?.name}</span><ChevronRight size={14}/><b>{NAV_TITLES[screen]||'My profile'}</b></div>
        <div className="cw-top-actions"><span className="cw-date"><CalendarDays size={15}/>{todayLabel()}</span><div className="cw-notification-wrap">
          <button className="cw-icon-button cw-notification" onClick={()=>setNotificationsOpen((open)=>!open)} aria-label="Notifications" aria-expanded={notificationsOpen}><Bell size={18}/>{notificationCount>0&&<i>{notificationCount>99?'99+':notificationCount}</i>}</button>
          {notificationsOpen&&<div className="cw-notification-panel"><div className="cw-notification-head"><b>Notification center</b><button onClick={()=>{const now=new Date().toISOString();supabaseBrowser.from('carwash_user_messages').update({read_at:now}).eq('user_id',user.authUserId).is('read_at',null).then(()=>setNotifications((old)=>old.map((item)=>({...item,read_at:item.read_at||now}))));}}>Mark all read</button></div>
            {visibleUnpaidJobs.length>0&&<button className="cw-notification-item unpaid" onClick={()=>{navigate('payments');setNotificationsOpen(false);}}><b>{visibleUnpaidJobs.length} unpaid wash order{visibleUnpaidJobs.length===1?'':'s'}</b><span>Payments are still due at the front desk.</span><small>Open payments <ArrowRight size={12}/></small></button>}
            {visibleNotifications.map((item)=><button key={item.id} className={`cw-notification-item ${item.read_at?'':'unread'}`} onClick={()=>{if(!item.read_at){const now=new Date().toISOString();supabaseBrowser.from('carwash_user_messages').update({read_at:now}).eq('id',item.id).then(()=>setNotifications((old)=>old.map((entry)=>entry.id===item.id?{...entry,read_at:now}:entry)));}}}><b>{item.subject}</b><span>{item.body}</span><small>{new Date(item.created_at).toLocaleString('en-KE')}</small></button>)}
            {!visibleNotifications.length&&!visibleUnpaidJobs.length&&<p className="cw-notification-empty">You’re all caught up.</p>}
          </div>}
        </div><div className="cw-top-avatar">{user.profilePhoto?<img src={user.profilePhoto} alt=""/>:user.name.split(' ').map((part)=>part[0]).slice(0,2).join('')}</div></div>
      </header>
      <section className="cw-page">
        {liveError&&<div className="cw-auth-alert error" role="alert">{liveError}</div>}
        {user.billingRestricted&&!isStaffRole&&<div className="cw-auth-alert error" role="alert"><b>Your workspace is restricted.</b><br/>{user.activationMessage||`Make a payment to continue using ${user.tenant_name||'your business workspace'}.`}</div>}
        {!isStaffRole&&!user.billingRestricted&&visibleNotifications.find((item)=>isSubscriptionReminder(item)&&!item.read_at)&&<div className="cw-auth-alert billing-reminder" role="status"><b>Subscription reminder</b><br/>{visibleNotifications.find((item)=>isSubscriptionReminder(item)&&!item.read_at)?.body}</div>}
        {screen==='overview'&&<Overview db={db} role={role} user={user} jobs={workerJobs} payments={scoped(db.payments)} revenue={dailyRevenue} active={activeCount} ready={readyCount} onNavigate={navigate} onCreate={()=>setModal('order')}/>}
        {screen==='jobs'&&<JobsPage jobs={filteredJobs} db={db} role={role} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onCreate={()=>setModal('order')} onTransition={updateJob} onPayment={recordPayment} canDelete={['Business Admin','Receptionist'].includes(role)} selectedIds={selectedJobIds} deleting={deletingJobs} onToggle={(id)=>setSelectedJobIds((old)=>old.includes(id)?old.filter((item)=>item!==id):old.length<100?[...old,id]:old)} onSelectAll={(ids)=>setSelectedJobIds((old)=>[...new Set([...old,...ids])].slice(0,100))} onClearSelection={()=>setSelectedJobIds([])} onDelete={deleteWashOrders}/>}
        {screen==='history'&&<JobsPage jobs={filteredJobs} db={db} role={role} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} history onTransition={updateJob} onPayment={recordPayment}/>}
        {screen==='customers'&&role!=='Washer'&&<CustomersPage customers={scopedCustomers} vehicles={scoped(db.vehicles)} query={query} setQuery={setQuery} onAdd={()=>setModal('customer')} canSelect={['Business Admin','Receptionist'].includes(role)} canEdit={['Business Admin','Receptionist'].includes(role)} onEdit={(customer)=>{setEditingCustomer({...customer,vehicles:scoped(db.vehicles).filter((vehicle)=>vehicle.customerId===customer.id)});setModal('customer-edit');}} canDelete={role==='Business Admin'} selectedIds={selectedCustomerIds} deleting={deletingCustomers} onToggle={(id)=>setSelectedCustomerIds((old)=>old.includes(id)?old.filter((item)=>item!==id):old.length<100?[...old,id]:old)} onSelectAll={(ids)=>setSelectedCustomerIds((old)=>[...new Set([...old,...ids])].slice(0,100))} onClearSelection={()=>setSelectedCustomerIds([])} onDelete={deleteCustomers}/>}
        {screen==='services'&&role==='Business Admin'&&<ServicesPage services={scopedServices} jobs={scopedJobs} canDelete={role==='Business Admin'} canEdit={role==='Business Admin'} onEdit={(service)=>{setEditingService(service);setModal('service-edit');}} selectedIds={selectedServiceIds} deleting={deletingServices} onToggle={(id)=>setSelectedServiceIds((old)=>old.includes(id)?old.filter((item)=>item!==id):old.length<100?[...old,id]:old)} onSelectAll={(ids)=>setSelectedServiceIds((old)=>[...new Set([...old,...ids])].slice(0,100))} onClearSelection={()=>setSelectedServiceIds([])} onDelete={deleteUnusedServices} onAdd={()=>setModal('service')} onChange={async(service)=>{if(user.authUserId){if(user.billingRestricted){notify('This plan is overdue. Workspace changes are read-only.','error');return;}try{const {data:updated,error}=await supabaseBrowser.from('carwash_services').update({active:!service.active}).eq('id',service.id).eq('tenant_id',tenantId).select('id').maybeSingle();if(error)throw error;if(!updated)throw new Error('This service could not be found. Refresh the list and try again.');const {db:next}=await loadLiveWorkspace(user);setDb(next);}catch(error){notify(userFacingErrorMessage(error,'Could not update this service. Refresh and try again.'),'error');}}else patchDb((next)=>{const item=next.services.find((row)=>row.id===service.id);if(item)item.active=!item.active;return next;});}}/>}
        {screen==='staff'&&role==='Business Admin'&&<StaffPage staff={scopedStaff} jobs={scopedJobs} selectedIds={selectedStaffIds} updating={updatingStaff} onToggle={(id)=>setSelectedStaffIds((old)=>old.includes(id)?old.filter((item)=>item!==id):old.length<100?[...old,id]:old)} onSelectAll={(ids)=>setSelectedStaffIds((old)=>[...new Set([...old,...ids])].slice(0,100))} onClearSelection={()=>setSelectedStaffIds([])} onBulkStatus={updateSelectedStaff} onEdit={(person)=>{setEditingStaff(person);setModal('staff-edit');}} onAdd={()=>setModal('staff')} onChange={async(person)=>{if(user.authUserId){if(user.billingRestricted){notify('This plan is overdue. Workspace changes are read-only.');return;}const {error}=await supabaseBrowser.rpc('carwash_update_staff_status',{target_membership:person.id,next_status:person.status==='Active'?'SUSPENDED':'ACTIVE'});if(error){notify(userFacingErrorMessage(error,'Could not update staff access. Try again.'));return;}const {db:next}=await loadLiveWorkspace(user);setDb(next);}else patchDb((next)=>{const item=next.staff.find((row)=>row.id===person.id);if(item)item.status=item.status==='Active'?'Inactive':'Active';return next;});}}/>}
        {screen==='payments'&&role!=='Washer'&&<PaymentsPage payments={scoped(db.payments)} jobs={scopedJobs} customers={scopedCustomers} selectedIds={selectedPaymentIds} onToggle={(id)=>setSelectedPaymentIds((old)=>old.includes(id)?old.filter((item)=>item!==id):old.length<100?[...old,id]:old)} onSelectAll={(ids)=>setSelectedPaymentIds((old)=>[...new Set([...old,...ids])].slice(0,100))} onClearSelection={()=>setSelectedPaymentIds([])} onPayment={recordPayment}/>}
        {screen==='plans-billing'&&<CustomerBillingPage billing={db.billing} tenant={tenant} onRefresh={async()=>{const {db:next}=await loadLiveWorkspace(user);setDb(next);}} onRequest={async(payload)=>{let requestId=payload.requestId||null;try{if(payload.type==='TRIAL_EXTENSION'){const {error}=await supabaseBrowser.rpc('carwash_request_billing_action',{p_request_type:'TRIAL_EXTENSION',p_plan_id:null,p_payment_method:null,p_payment_reference:null,p_branch_count:1});if(error)throw error;notify('Your extra 7-day trial request has been sent to OshaHub.');const {db:next}=await loadLiveWorkspace(user);setDb(next);return {};}if(payload.type!=='STK_RETRY'){const {data,error}=await supabaseBrowser.rpc('carwash_request_billing_action',{p_request_type:'PLAN_PURCHASE',p_plan_id:payload.planId,p_payment_method:'M-PESA',p_payment_reference:null,p_branch_count:payload.branchCount||1});if(error)throw error;requestId=data.id;const {db:next}=await loadLiveWorkspace(user);setDb(next);}const {data,error}=await supabaseBrowser.functions.invoke('mpesa-stk',{body:{billingRequestId:requestId,phone:payload.phone}});if(error)throw error;if(data?.error)throw new Error(data.error);const {db:next}=await loadLiveWorkspace(user);setDb(next);return {requestId:data.requestId||requestId,amountKes:data.amountKes,status:data.status};}catch(error){const {db:next}=await loadLiveWorkspace(user).catch(()=>({db:null}));if(next)setDb(next);throw error;}}}/>}
        {screen==='commissions'&&role==='Business Admin'&&<LedgerPage title="Commission ledger" subtitle="Worker earnings are recorded against completed wash jobs." rows={scoped(db.commissions)} db={db} selectedIds={selectedCommissionIds} onToggle={(id)=>setSelectedCommissionIds((old)=>old.includes(id)?old.filter((item)=>item!==id):old.length<100?[...old,id]:old)} onSelectAll={(ids)=>setSelectedCommissionIds((old)=>[...new Set([...old,...ids])].slice(0,100))} onClearSelection={()=>setSelectedCommissionIds([])} onReview={async(entry,status)=>{if(user.authUserId){if(user.billingRestricted){notify('This plan is overdue. Workspace changes are read-only.');return;}const {error}=await supabaseBrowser.rpc('carwash_review_commission',{ledger_entry:entry.id,next_status:status});if(error){notify(userFacingErrorMessage(error,'Could not update this commission. Refresh and try again.'));return;}const {db:next}=await loadLiveWorkspace(user);setDb(next);}else patchDb((next)=>{const row=next.commissions.find((item)=>item.id===entry.id);if(row)row.status=status;return next;});notify(status==='APPROVED'?'Commission approved.':'Commission payout recorded.');}}/>}
        {screen==='earnings'&&role!=='Washer'&&<EarningsPage user={user} jobs={workerJobs} commissions={scoped(db.commissions)} db={db} selectedIds={selectedCommissionIds} onToggle={(id)=>setSelectedCommissionIds((old)=>old.includes(id)?old.filter((item)=>item!==id):old.length<100?[...old,id]:old)} onSelectAll={(ids)=>setSelectedCommissionIds((old)=>[...new Set([...old,...ids])].slice(0,100))} onClearSelection={()=>setSelectedCommissionIds([])}/>}
        {screen==='loyalty'&&<LoyaltyPage customers={scopedCustomers} ledger={scoped(db.loyalty||[])} db={db}/>}
        {screen==='reports'&&role!=='Washer'&&<ReportsPage jobs={scopedJobs} payments={scoped(db.payments)} commissions={scoped(db.commissions)} db={db} role={role}/>}
        {screen==='tenants'&&<TenantsPage tenants={db.tenants} onAdd={()=>setModal('tenant')} onChange={(item,status)=>patchDb((next)=>{const row=next.tenants.find((x)=>x.id===item.id);if(row)row.status=status;return next;})}/>}
        {screen==='plans'&&<PlansPage plans={db.plans||[]} tenants={db.tenants} onAdd={()=>setModal('plan')}/>}
        {screen==='audit'&&<AuditPage rows={scoped(db.audit)}/>}
        {screen==='settings'&&<SettingsPage db={db} user={user} role={role} theme={theme} appPreferences={appPreferences} onPreferenceChange={updateAppPreferences} onThemeChange={changeTheme} onChangeProfilePhoto={changeProfilePhoto} onCopyPortalLink={copyPortalAppLink} onInstallApp={installApp} onSaveProfile={saveOwnProfile} onNavigate={navigate} onSave={async(form)=>{if(user.authUserId){if(user.billingRestricted){notify('This plan is overdue. Workspace changes are read-only.');return;}if(!db.settingsSchemaReady){notify('Settings are temporarily unavailable. Contact support if the problem continues.');return;}const {error}=await supabaseBrowser.rpc('carwash_update_tenant_settings',{target_tenant:tenantId,p_business_name:form.businessName,p_branch:form.branch,p_loyalty_rate:form.loyaltyRate});if(error){notify(userFacingErrorMessage(error,'Could not update business settings. Check the details and try again.'));return;}const {db:next}=await loadLiveWorkspace(user);setDb(next);}else patchDb((next)=>{next.settings={...next.settings,...form};return next;});notify('Business settings updated.');}}/>}
        {screen==='profile'&&<ProfilePage user={user} tenant={tenant} onLogout={logout}/>}
      </section>
    </main>
    {modal&&<FormModal key={modal} type={modal} initialData={modal==='customer-edit'?editingCustomer:modal==='service-edit'?editingService:modal==='staff-edit'?editingStaff:null} db={db} tenantId={tenantId} onClose={()=>{setModal('');setEditingCustomer(null);setEditingService(null);setEditingStaff(null);}} onSubmit={submitModal}/>}
    {!!toast&&<div className={`cw-toast ${typeof toast==='object'&&toast.type==='error'?'is-error':''}`} role={typeof toast==='object'&&toast.type==='error'?'alert':'status'}>{typeof toast==='object'&&toast.type==='error'?<X size={18}/>:<CheckCircle2 size={18}/>}<span>{typeof toast==='string'?toast:toast.message}</span></div>}
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
    <header className="cw-landing-header"><div className="cw-landing-nav"><a className="cw-landing-brand" href="#/" aria-label="OshaHub home" onClick={closeMenu}><img src="/osha-hub-logo-light.svg" alt="OshaHub"/></a><nav id="cw-landing-nav" className={menuOpen?'is-open':''} aria-label="Main navigation"><a href="#/product" onClick={closeMenu}>Product</a><a href="#/pricing" onClick={closeMenu}>Pricing</a><a href="#/platforms" onClick={closeMenu}>Platforms</a><a href="#/about" onClick={closeMenu}>About Us</a><a href="#/faq" onClick={closeMenu}>FAQ</a></nav><div className="cw-landing-actions"><div className="cw-landing-language-wrap"><button className="cw-landing-language" type="button" aria-label="Language options" aria-expanded={languageOpen} onClick={()=>setLanguageOpen((open)=>!open)}><Languages size={19}/></button>{languageOpen&&<div className="cw-language-menu" role="menu"><b>LANGUAGE</b><span className="selected">English · Kenya</span><span className="unavailable">Swahili · Coming soon</span></div>}</div><button className="cw-landing-account" type="button" onClick={onLogin} aria-label="Team sign in"><UserRound size={20}/></button><button className="cw-landing-menu-button" type="button" aria-label={menuOpen?'Close menu':'Open menu'} aria-expanded={menuOpen} aria-controls="cw-landing-nav" onClick={()=>setMenuOpen((open)=>!open)}>{menuOpen?<X size={20}/>:<Menu size={20}/>}</button></div></div></header>
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
    </main><footer className="cw-landing-footer"><div className="cw-landing-footer-brand"><img src="/osha-hub-logo.svg" alt="OshaHub"/><p><strong>Keep every wash moving.</strong><br/>Connected tools for car wash teams, owners and operators.</p></div><div className="cw-landing-footer-links"><div><b>PLATFORM</b><a href="#/product">Product</a><a href="#/platforms">Platforms</a><a href="#/pricing">Pricing</a></div><div><b>GET STARTED</b><a href="#/how-it-works">How it works</a><a href="#/faq">FAQs</a><button onClick={onRegister}>Request access</button></div><div><b>YOUR ACCOUNT</b><button onClick={onLogin}>Team sign in</button><a href="/super-admin.html">Super Admin sign in</a><a href="#/">Back to top</a></div><div><b>COMPANY</b><a href="#/about">About OshaHub</a><a href="#/faq">Contact &amp; FAQs</a></div><div><b>SECURITY</b><a href="#/faq">Account approval</a><a href="#/platforms">Role-based access</a><a href="#/privacy">Privacy &amp; data</a></div></div><div className="cw-landing-footer-bottom"><span>© 2026 OshaHub · Car Wash Operations</span><span>Built for teams that keep Kenya moving.</span></div></footer>
  </div>;
}

function PublicInfoPage({page,onLogin,onRegister}){
  const content={
    product:{kicker:'OSHAHUB PRODUCT ROADMAP',title:'Run today’s wash. Grow tomorrow’s business.',intro:'OshaHub brings the wash team’s daily work together, with customer growth tools planned to help tenants get found, take bookings and build repeat business.',cards:[['Wash operations','Record customers, vehicles, selected services and payments against one wash order.'],['Online bookings','Let customers choose a service and time, while helping the team manage arrivals and parking capacity.'],['Social booking links','Share a booking page from social profiles and connect each wash to its online presence.'],['Services and packages','Showcase options such as basic washing, interior cleaning, detailing and waxing with clear prices.'],['Appointment reminders','Send booking reminders one hour, 30 minutes and 15 minutes before the appointment, plus an arrival-time message.'],['Loyalty and repeat visits','Encourage return visits with loyalty rewards, discounts and service reminders.'],['Photos, reviews and trust','Show work photos and customer testimonials to help prospective clients choose a wash.'],['Customer feedback and insights','Collect feedback for the business and understand popular services and customer response.'],['Fleet and mobile washing','Support company fleet cleaning and appointments for mobile car-wash or detailing services.']]},
    platforms:{kicker:'CONNECTED WORKSPACES',title:'The right view for every role.',intro:'Each account is assigned a role and access is limited to the work that role needs.',cards:[['Business Admin','Manage services, staff invitations, wash performance and business settings.'],['Front desk','Check in vehicles, manage the queue and record customer payments.'],['Wash team','See assigned jobs, update wash progress and review earnings.'],['Platform Admin','Review business requests and manage the platform workspace.']]},
    pricing:{kicker:'SUBSCRIPTIONS',title:'A plan that fits your wash.',intro:'Monthly, quarterly, annual and custom terms can be discussed during business onboarding. Final pricing and enabled features are confirmed with the platform team.',cards:[['Monthly','A short commitment for a single wash location.'],['Quarterly','A longer billing period for established teams.'],['Annual or custom','Discuss multiple locations, team size and deployment needs.']]},
    'how-it-works':{kicker:'HOW IT WORKS',title:'From access request to wash floor.',intro:'OshaHub keeps onboarding and daily work in one connected flow.',cards:[['1. Request access','Register the business and verify the owner’s email.'],['2. Get approved','A platform administrator reviews the account before access is activated.'],['3. Invite the team','Business Admin invites reception and washers to their own portal.']]},
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

const OSHAHUB_PRICES=[['Starter','KES 3,900','1 branch · 1 receptionist · 3 washers · Core operations and washer app'],['Growth','KES 7,900','3 branches · 15 staff · Reports, loyalty and washer app'],['Enterprise','KES 14,900','Unlimited branches and staff · Priority support and washer app']];
const OSHAHUB_TERMS=[['Monthly',1],['3 months',3],['5 months',5],['Yearly',12]];
function downloadPricingPdf(){window.print()}
function PricingSheet(){return <section className="cw-pricing-sheet-page"><div className="cw-pricing-sheet-toolbar"><a href="#/pricing"><ArrowRight size={15}/> Back to pricing</a><button type="button" onClick={downloadPricingPdf}><Download size={17}/> Download PDF</button></div><article className="cw-pricing-sheet"><header><img src="/osha-hub-logo.svg" alt="OshaHub"/><div><h1>PRICING GUIDE</h1><p>Subscription plans for your car wash workspace.</p></div></header><h2>SUBSCRIPTION TERMS</h2><div className="cw-pricing-table"><table><thead><tr><th>Plan</th><th>Monthly</th><th>3 months</th><th>5 months</th><th>Yearly</th><th>What’s included</th></tr></thead><tbody>{OSHAHUB_PRICES.map(([plan,price,features],index)=>{const monthly=[3900,7900,14900][index];return <tr key={plan}><td>{plan}</td>{OSHAHUB_TERMS.map(([label,months])=><td key={label}>{formatKes(months===1?monthly:(monthly-300)*months)}</td>)}<td>{features}</td></tr>})}</tbody></table></div><p className="cw-pricing-onboarding-note"><b>One-time onboarding: KES 8,500 per branch.</b> Charged with your first paid plan after the free 7-day trial. Multi-branch setup is priced by branch count.</p><div className="cw-pricing-sheet-notes"><section><h2>TERM SAVINGS</h2><p>Subscriptions of 3, 5 or 12 months save KES 300 for each covered month against the monthly rate.</p></section><section><h2>EVERY PLAN INCLUDES</h2><p>Business workspace, role-based access, wash queue, customer records and mobile-ready operations.</p></section></div></article></section>}

function clearStaffInviteFromUrl(){const url=new URL(window.location.href);if(!url.searchParams.has('invite'))return;url.searchParams.delete('invite');window.history.replaceState({},'',url.toString());}

function LoginScreen({onLogin,onBack,initialMode='login'}){
  const inviteToken=new URLSearchParams(window.location.search).get('invite')||'';
  const portalParam=new URLSearchParams(window.location.search).get('portal');
  const staffPortal=window.location.pathname==='/washer'?'washer':window.location.pathname==='/receptionist'?'receptionist':['washer','receptionist'].includes(portalParam)?portalParam:'';
  const isStaffInvite=/^[0-9a-f]{64}$/i.test(inviteToken);
  const isStaffPortal=Boolean(staffPortal);
  const portalName=staffPortal==='washer'?'Washer':staffPortal==='receptionist'?'Receptionist':'staff';
  const [mode,setMode]=useState(()=>isStaffInvite?'register':initialMode);
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
      if(sessionError){setError(supabaseErrorMessage(sessionError,'Unable to restore your sign-in.'));return;}
      if(data.session?.user){try{await openWorkspace(data.session.user);}catch(e){if(active)setError(supabaseErrorMessage(e,'Unable to load your account.'));}}
    });
    return()=>{active=false;};
  },[]);
  async function openWorkspace(authUser){
    // This app accepts only business and staff memberships. Platform admins
    // authenticate through the standalone console at /super-admin.html.
    const {data:memberships,error:membershipError}=await supabaseBrowser.from('carwash_memberships')
      .select('id,role,tenant_id,full_name,phone,branch,status').eq('user_id',authUser.id).eq('status','ACTIVE')
      .order('role',{ascending:true}).limit(50);
    if(membershipError)throw membershipError;
    const platformAdmin=(memberships||[]).some((item)=>item.role==='SUPER_ADMIN');
    if(platformAdmin){
      setError('This is a platform administrator account. Sign in at /super-admin.html.');
      setBusy(false);
      return;
    }
    const inviteToken=new URLSearchParams(window.location.search).get('invite')||authUser.user_metadata?.invite_token;
    const preferredTenant=window.localStorage.getItem(`cw-active-tenant:${authUser.id}`);
    let membership;
    if(inviteToken){const accepted=await supabaseBrowser.rpc('carwash_accept_staff_invitation',{invite_token:inviteToken,staff_name:authUser.user_metadata?.full_name||authUser.email});if(accepted.error)throw accepted.error;membership=accepted.data;clearStaffInviteFromUrl();void supabaseBrowser.auth.updateUser({data:{invite_token:null}});if(membership.status==='PENDING'){setMode('login');setMessage('Your registration is complete. Wait for the business to approve your account, then sign in here.');await supabaseBrowser.auth.signOut();return;}window.localStorage.setItem(`cw-active-tenant:${authUser.id}`,membership.tenant_id);}
    else membership=(memberships||[]).find((item)=>['BUSINESS_ADMIN','RECEPTIONIST','WASHER'].includes(item.role)&&(!preferredTenant||item.tenant_id===preferredTenant))||(memberships||[]).find((item)=>['BUSINESS_ADMIN','RECEPTIONIST','WASHER'].includes(item.role))||null;
    if(!membership){
      const {data:pendingMembership,error:pendingError}=await supabaseBrowser.from('carwash_memberships').select('id').eq('user_id',authUser.id).eq('status','PENDING').limit(1).maybeSingle();
      if(pendingError)throw pendingError;
      if(pendingMembership){setMode('login');setMessage('Your account is waiting for approval from the business. Sign in here after the tenant approves your access.');await supabaseBrowser.auth.signOut();return;}
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
    onLogin({id:authUser.id,authUserId:authUser.id,staffId:membership.id,email:authUser.email,name:membership.full_name||authUser.user_metadata?.full_name||authUser.email,profilePhoto:authUser.user_metadata?.oshaHubAvatar||'',role,tenant_id:membership.tenant_id,tenant_name:tenant?.name,branch:membership.branch,billingRestricted,activationMessage:billingRestricted?`Your ${tenant?.name||'business'} workspace is restricted because its plan has expired. Make a payment to continue using ${tenant?.name||'your business workspace'}.`:messages?.[0]?.body});
  }
  async function submit(event){
    event.preventDefault();setError('');setMessage('');setLoading(true);
    try{
      if(!supabaseBrowser)throw new Error('Sign-in is temporarily unavailable. Please try again later.');
      if(mode==='register'){
        if(form.password!==confirmPassword)throw new Error('Passwords do not match. Please check both password fields.');
        const staffInvite=isStaffInvite;
        const metadata=staffInvite?{full_name:form.name.trim(),invite_token:inviteToken}:{full_name:form.name.trim(),business_name:form.business.trim(),phone:form.phone.trim()};
        const callback=new URL(window.location.origin);if(staffInvite){callback.pathname=staffPortal==='receptionist'?'/receptionist':'/washer';callback.searchParams.set('invite',inviteToken);callback.searchParams.set('portal',staffPortal||'washer');}
        const {data,error:signUpError}=await supabaseBrowser.auth.signUp({email:form.email.trim(),password:form.password,options:{emailRedirectTo:callback.toString(),data:metadata}});
        if(signUpError)throw signUpError;
        if(data.session&&data.user){
          if(staffInvite){await openWorkspace(data.user);}
          else {const result=await supabaseBrowser.rpc('carwash_submit_business_request',{p_tenant_name:form.business.trim(),p_owner_name:form.name.trim(),p_phone:form.phone.trim()});if(result.error)throw result.error;}
        }
        if(staffInvite){setMode('login');if(!data.session)setMessage('Check your email to verify your account. After verification, wait for the business to approve your access, then sign in here.');}
        else {setMode('login');setMessage(data.session?'Your registration is submitted. Sign in after administrator review.':'Check your email for the verification link. Verify your address, then sign in; your business request will be submitted securely.');}
      }else{
        const {data,error:signInError}=await supabaseBrowser.auth.signInWithPassword({email:form.email.trim(),password:form.password});
        if(signInError)throw signInError;
        await openWorkspace(data.user);
      }
    }catch(e){setError(supabaseErrorMessage(e,'Unable to complete the request. Please try again.'));}
    finally{setLoading(false);}
  }
  async function demoEnter(){setLoading(true);onLogin(selected);setLoading(false);}
  return <div className="cw-login">
    {loading&&<div className="cw-wash-loader"><div className="cw-loader-logo"><Droplets size={22}/><b>OSHA<i>HUB</i></b></div><h2>Connecting to your secure wash floor…</h2><p>Getting your workspace ready</p><div className="cw-loader-track"><i/></div></div>}
    <div className="cw-login-visual"><div className="cw-login-nav"><img src="/osha-hub-logo.svg" alt="OshaHub"/><span><ShieldCheck size={15}/> SECURE OPERATIONS</span></div><div className="cw-login-pitch"><span>{isStaffPortal?`OSHAHUB · ${portalName.toUpperCase()} APP`:'OSHAHUB · CAR WASH OPERATIONS'}</span><h1>{isStaffPortal?<>Sign in to the<br/>{portalName.toLowerCase()} app.</>:<>Every wash.<br/>Running smoothly.</>}</h1><p>{isStaffPortal?`Use your approved ${portalName.toLowerCase()} account to open your business workspace.`:'Run your car wash with a clear view of jobs, people and payments, all in one place.'}</p>{!isStaffPortal&&<><div className="cw-login-points"><div><Check size={15}/> Live wash queue</div><div><Check size={15}/> Customer loyalty</div><div><Check size={15}/> Clear earnings</div></div><div className="cw-pitch-products"><div><small>CONNECTED PORTALS</small><b>Owner · Front desk · Wash team</b></div><div><small>SUBSCRIPTION PLANS</small><b>Monthly · Quarterly · Annual · Custom</b></div></div></>}</div><div className="cw-login-legal">© 2026 OshaHub <span>{isStaffInvite?`${portalName} workspace invitation`:isStaffPortal?`${portalName} app`:'Made for the people who keep Kenya moving.'}</span></div></div>
    <div className="cw-login-panel"><div className="cw-login-mobile-logo"><img src="/osha-hub-logo-light.svg" alt="OshaHub"/></div><div className="cw-login-content">{onBack&&!isStaffPortal&&<button type="button" className="cw-back-to-site" onClick={onBack}>← Back to OshaHub</button>}<span className="cw-login-kicker">{isStaffInvite?`${portalName.toUpperCase()} PORTAL INVITATION`:isStaffPortal?`${portalName.toUpperCase()} APP`:'WELCOME TO OSHAHUB'}</span><h2>{isStaffInvite?(mode==='register'?`Create your ${portalName} account.`:`Sign in to your ${portalName} portal.`):isStaffPortal?`Sign in to your ${portalName} app.`:mode==='register'?'Bring your wash online.':'Your wash floor, at a glance.'}</h2><p className="cw-login-intro">{isStaffInvite?`Register to join the business that invited you as a ${portalName}. Verify your email, then sign in to open that tenant’s ${portalName} workspace.`:isStaffPortal?`Sign in with the ${portalName.toLowerCase()} account approved by your business administrator.`:mode==='register'?'Register your business and its owner. After review, the owner receives Business Admin access and can invite staff.':'Sign in with your business or staff account to open your workspace.'}</p>{!isStaffPortal&&<div className="cw-auth-mobile-products"><b>Business · Front desk · Wash team</b><span>Flexible monthly, quarterly, annual and custom subscriptions</span></div>}
      <form className="cw-auth-form" onSubmit={submit}>
        {mode==='register'&&<><label>{isStaffInvite?'Employee’s full name':'Owner’s full name'}<input autoComplete="name" placeholder="Enter full name" required minLength="2" value={form.name} onChange={(e)=>set('name',e.target.value)}/></label>{!isStaffInvite&&<><label>Business name<input placeholder="Enter business name" required minLength="2" value={form.business} onChange={(e)=>set('business',e.target.value)}/></label><label>Phone number<input autoComplete="tel" inputMode="tel" placeholder="Enter phone number" required minLength="7" value={form.phone} onChange={(e)=>set('phone',e.target.value)}/></label></>}</>}
        <label>Email address<input type="email" autoComplete="email" placeholder="Enter email address" required value={form.email} onChange={(e)=>set('email',e.target.value)}/></label>
        <label>Password<div className="cw-password-wrap"><input type={showPassword?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} placeholder="Enter password" required minLength="10" value={form.password} onChange={(e)=>set('password',e.target.value)}/><button type="button" className="cw-password-toggle" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword((visible)=>!visible)}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>
        {mode==='register'&&<label>Confirm password<div className="cw-password-wrap"><input type={showConfirmPassword?'text':'password'} autoComplete="new-password" placeholder="Re-enter password" required minLength="10" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)}/><button type="button" className="cw-password-toggle" aria-label={showConfirmPassword?'Hide confirmation password':'Show confirmation password'} aria-pressed={showConfirmPassword} onClick={()=>setShowConfirmPassword((visible)=>!visible)}>{showConfirmPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>}
        <button className="cw-primary cw-enter" type="submit" disabled={loading}>{loading?<><span className="cw-spinner"/>Connecting securely</>:mode==='register'?(isStaffInvite?'Create staff account':'Request business access'):'Sign in securely'} <ArrowRight size={17}/></button>
      </form>
      {!supabaseBrowser&&!demoEnabled&&<div className="cw-auth-alert" role="status">OshaHub sign-in is temporarily unavailable. {supabaseConfigMessage}</div>}
      {error&&<div className="cw-auth-alert error" role="alert">{error}</div>}{message&&<div className="cw-auth-alert" role="status">{message}</div>}
      {isStaffPortal&&!isStaffInvite?<p className="cw-auth-switch">Need access? Ask your business administrator for a {portalName.toLowerCase()} invitation link.</p>:<button className="cw-auth-switch" onClick={()=>{setError('');setMessage('');setMode(mode==='login'?'register':'login')}}>{mode==='login'?(isStaffInvite?<>New team member? <b>Create account</b></>:<>New business? <b>Request access</b></>):<>Already registered? <b>Sign in</b></>}</button>}
      {demoEnabled&&<details className="cw-demo-access"><summary>Explore sample workspace</summary><div className="cw-role-options">{demoUsers.map((item)=>{const Icon=item.role==='Business Admin'?Store:item.role==='Receptionist'?Users:Waves;return <button type="button" key={item.role} className={`cw-role-option ${selected.role===item.role?'selected':''}`} onClick={()=>setSelected(item)}><span className="cw-role-icon"><Icon size={17}/></span><span><b>{item.role}</b><small>{item.email}</small></span><span className="cw-role-radio"/></button>})}</div><button type="button" className="cw-primary cw-enter" onClick={demoEnter} disabled={loading}>Enter sample workspace <ArrowRight size={17}/></button><div className="cw-demo-note"><ShieldCheck size={16}/><span><b>Demo data only</b><br/>Demo changes reset when you reload.</span></div></details>}
    </div><div className="cw-login-foot">{isStaffInvite?`Secure ${portalName} invitation · Verify your email to join this tenant workspace`:'Email verification and account approval protect your workspace access'}</div></div>
  </div>;
}

function Overview({db,role,user,jobs,payments,revenue,active,ready,onNavigate,onCreate}){
  const metrics=role==='SaaS Super Admin' ? [
    ['Total businesses',db.tenants.length,'Across all plans',Store,'blue'],['Active subscriptions',db.tenants.filter((item)=>item.status==='ACTIVE').length,'Operating today',BadgeCheck,'green'],['Monthly revenue',formatKes(db.tenants.filter((item)=>item.status==='ACTIVE').length*7900),'Recurring subscription revenue',Wallet,'blue'],['Expiring soon',db.tenants.filter((item)=>['EXPIRING SOON','TRIAL'].includes(item.status)).length,'Needs attention',Clock3,'amber']
  ] : role==='Washer' ? [
    ['Assigned today',active,'Jobs ready for you',Waves,'blue'],['In progress',jobs.filter((job)=>job.status==='IN PROGRESS').length,'Keep up the shine',Activity,'amber'],['Completed',jobs.filter((job)=>['COMPLETED','READY','DELIVERED','CLOSED'].includes(job.status)).length,'Your finished washes',CheckCircle2,'green']
  ] : [
    ['Collected today',formatKes(revenue),'Across recorded payments',Banknote,'blue'],['Active washes',active,'Vehicles being washed',Waves,'green'],['Ready for pickup',ready,'Quality check passed',CheckCircle2,'green'],['Vehicles checked in',jobs.length,'Today’s wash queue',CarFront,'blue']
  ];
  return <>
    <div className="cw-page-heading"><div><div className="cw-overline">{role==='SaaS Super Admin'?'PLATFORM OVERVIEW':role==='Washer'?'YOUR WASH FLOOR':`${tenantName(db,user)} · ${todayLabel().toUpperCase()}`}</div><h1>{role==='Washer'?`Ready for your next wash, ${user.name.split(' ')[0]}?`:`Good ${timeGreeting()}, ${user.name.split(' ')[0]}`}</h1><p>{role==='SaaS Super Admin'?'Here’s how your car wash network is performing.':role==='Washer'?'Here are the jobs assigned to you today.':'Here’s what’s happening across your wash floor today.'}</p></div><div className="cw-heading-actions">{role!=='Washer'&&<button className="cw-secondary" onClick={()=>onNavigate('reports')}><FileBarChart2 size={16}/> View reports</button>}{['Receptionist','Business Admin'].includes(role)&&<button className="cw-primary" onClick={onCreate}><Plus size={17}/> New wash order</button>}</div></div>
    <div className="cw-metrics">{metrics.map(([label,value,note,Icon,tone])=><div className="cw-metric" key={label}><div className="cw-metric-top"><span>{label}</span><i className={`tone-${tone}`}><Icon size={18}/></i></div><strong>{value}</strong><small>{note}</small></div>)}</div>
    {role==='SaaS Super Admin'?<PlatformPanels db={db} onNavigate={onNavigate}/>:<>
      {role==='Receptionist'&&<div className="cw-workflow-strip">{[['01','Arrive'],['02','Identify'],['03','Build order'],['04','Pay & assign'],['05','Ready'],['06','Collect']].map(([num,label],index)=><div key={num} className={index===0?'current':''}><i>{num}</i><b>{label}</b>{index<5&&<ArrowRight size={13}/>}</div>)}</div>}
      <div className="cw-content-grid cw-dashboard-pulse"><aside className="cw-panel cw-side-panel"><div className="cw-panel-head"><div><h2>Shift pulse</h2><p>Live operation status</p></div><span className="cw-live"><i/> LIVE</span></div><div className="cw-pulse-ring"><div><strong>{active}</strong><span>active washes</span></div><svg viewBox="0 0 200 100" aria-hidden="true"><path d="M14 78 C44 67 52 24 85 47 S132 76 151 45 S175 27 188 18"/></svg></div><div className="cw-pulse-legend"><span><i className="blue-dot"/>In progress <b>{jobs.filter((job)=>job.status==='IN PROGRESS').length}</b></span><span><i className="amber-dot"/>Waiting / assigned <b>{jobs.filter((job)=>['WAITING','ASSIGNED'].includes(job.status)).length}</b></span><span><i className="green-dot"/>Ready to collect <b>{ready}</b></span></div>{role!=='Washer'&&<button className="cw-secondary cw-wide" onClick={()=>onNavigate('customers')}><Users size={16}/> Find a customer</button>}</aside></div>
      {role!=='Washer'&&<div className="cw-lower-grid"><div className="cw-panel"><div className="cw-panel-head"><div><h2>Weekly sales</h2><p>Paid wash orders · KES</p></div><span className="cw-period">THIS WEEK <ChevronDown size={13}/></span></div><SalesChart payments={payments}/></div><div className="cw-panel"><div className="cw-panel-head"><div><h2>Team on shift</h2><p>Assigned wash floor staff</p></div><button className="cw-text-action" onClick={()=>onNavigate('staff')}>See team <ArrowRight size={14}/></button></div><div className="cw-team-list">{db.staff.filter((person)=>person.tenant_id===user.tenant_id&&person.status==='Active').map((person,index)=><div className="cw-team-row" key={person.id}><div className={`cw-team-avatar avatar-${index%4}`}>{person.name.split(' ').map((part)=>part[0]).slice(0,2).join('')}</div><span><b>{person.name}</b><small>{person.role} · {person.branch}</small></span><i className="cw-presence"/></div>)}</div></div></div>}
    </>}
  </>;
}

function tenantName(db,user){return db.tenants.find((item)=>item.id===user.tenant_id)?.name||db.settings.businessName;}
function timeGreeting(){const hour=new Date().getHours();return hour<12?'morning':hour<17?'afternoon':'evening';}
function PlatformPanels({db,onNavigate}){return <div className="cw-content-grid"><div className="cw-panel"><div className="cw-panel-head"><div><h2>Subscription health</h2><p>Business accounts that need your attention</p></div><button className="cw-text-action" onClick={()=>onNavigate('tenants')}>All businesses <ArrowRight size={14}/></button></div><TenantsTable tenants={db.tenants.slice(0,4)} compact/></div><aside className="cw-panel"><div className="cw-panel-head"><div><h2>Platform status</h2><p>System services</p></div><span className="cw-live"><i/> NORMAL</span></div>{[['Core API','Operational'],['Tenant isolation','Enforced'],['Data services','Connected'],['Audit logging','Recording']].map(([label,value])=><div className="cw-health-row" key={label}><span><CheckCircle2 size={15}/>{label}</span><b>{value}</b></div>)}</aside></div>}

function JobsPage({jobs,db,role,query,setQuery,filter,setFilter,history=false,onCreate,onTransition,onPayment,canDelete=false,selectedIds=[],deleting=false,onToggle,onSelectAll,onClearSelection,onDelete}){const eligible=jobs.filter((job)=>['WAITING','ASSIGNED'].includes(job.status)&&job.paymentStatus==='UNPAID'&&!job.paidAmount);return <><PageHeading title={history?'Job history':role==='Washer'?'Assigned jobs':'Wash queue'} subtitle={history?'Completed work and earnings history.':'Track every vehicle as it moves through the wash floor.'} action={role==='Receptionist'||role==='Business Admin'?<button className="cw-primary" onClick={onCreate}><Plus size={16}/> Check in vehicle</button>:null}/><div className="cw-toolbar"><div className="cw-search"><Search size={16}/><input placeholder="Search plate, customer, washer…" value={query} onChange={(event)=>setQuery(event.target.value)}/></div><div className="cw-filter">{(history?['All','COMPLETED','READY','DELIVERED','CLOSED']:['All','WAITING','ASSIGNED','IN PROGRESS','COMPLETED','READY']).map((value)=><button key={value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{value==='IN PROGRESS'?'In progress':value.charAt(0)+value.slice(1).toLowerCase()}</button>)}</div></div>{canDelete&&<div className="cw-bulk-actions"><span>{selectedIds.length} selected{deleting?' · Deleting…':''}</span><button type="button" disabled={deleting||(!jobs.length&&!selectedIds.length)} onClick={()=>selectedIds.length?onClearSelection():onSelectAll(jobs.slice(0,100).map((job)=>job.id))}>{selectedIds.length?'Deselect all':'Select up to 100'}</button><button type="button" disabled={deleting||!selectedIds.length} onClick={onClearSelection}>Clear selection</button><button type="button" className="danger" disabled={deleting||!selectedIds.length} onClick={()=>onDelete(selectedIds)}><Trash2 size={14}/>{deleting?'Deleting…':'Delete selected'}</button><small>Only unpaid orders that have not started can be deleted. Paid and completed work stays in history.</small></div>}<div className="cw-panel cw-table-panel"><JobTable jobs={jobs} db={db} role={role} onTransition={onTransition} onPayment={onPayment} history={history} canDelete={canDelete} selectedIds={selectedIds} deleting={deleting} onToggle={onToggle}/></div></>}
function JobTable({jobs,db,role,onTransition,onPayment,compact=false,history=false,empty='No wash orders match this view.',canDelete=false,selectedIds=[],deleting=false,onToggle}){
  const washerView=role==='Washer',columnCount=(canDelete?1:0)+(washerView?4:7);
  return <div className="cw-table-wrap"><table className="cw-table"><thead><tr>{canDelete&&<th>SELECT</th>}<th>VEHICLE</th><th>SERVICE</th>{!washerView&&<><th>WASHER</th><th>PAYMENT</th></>}<th>STATUS</th>{!washerView&&<th className="align-right">TOTAL</th>}<th/></tr></thead><tbody>{jobs.map((job)=>{const vehicle=db.vehicles.find((item)=>item.id===job.vehicleId),customer=db.customers.find((item)=>item.id===job.customerId),washer=db.staff.find((item)=>item.id===job.washerId),services=job.serviceIds.map((id,index)=>db.services.find((item)=>item.id===id)?.name||job.serviceNames?.[index]).filter(Boolean);return <tr key={job.id}>{canDelete&&<td><input type="checkbox" aria-label={`Select wash order ${job.id}`} checked={selectedIds.includes(job.id)} disabled={deleting||(!selectedIds.includes(job.id)&&selectedIds.length>=100)} onChange={()=>onToggle(job.id)}/></td>}<td><div className="cw-vehicle-cell"><div className="cw-vehicle-icon"><CarFront size={19}/></div><span><b>{vehicle?.registration||'Vehicle'}</b><small>{vehicle?.make} {vehicle?.model} · {customer?.name}</small></span></div></td><td><b className="cw-cell-primary">{services.join(' + ')||'Wash service'}</b><small className="cw-cell-sub">{job.id}</small></td>{!washerView&&<><td><span className="cw-washer-cell"><i>{washer?.name?.split(' ').map((part)=>part[0]).join('')||'—'}</i>{washer?.name||'Unassigned'}</span></td><td><span className={`cw-pay-state ${job.paymentStatus==='PAID'?'paid':'unpaid'}`}>{job.paymentStatus==='PAID'?<CheckCircle2 size={13}/>:<Clock3 size={13}/>} {job.paymentStatus}</span></td></>}<td><StatusPill status={job.status}/></td>{!washerView&&<td className="align-right"><b className="cw-cell-primary">{formatKes(job.total)}</b><small className="cw-cell-sub">{formatKes(job.commission)} commission</small></td>}<td><div className="cw-row-actions">{job.paymentStatus!=='PAID'&&['Receptionist','Business Admin'].includes(role)&&<button className="cw-small-action secondary" onClick={()=>onPayment(job)}>Pay</button>}<JobAction job={job} role={role} history={history} onTransition={onTransition}/></div></td></tr>;})}{!jobs.length&&<tr><td colSpan={columnCount}><div className="cw-table-empty"><Waves size={24}/><b>{empty}</b><span>New activity will appear here.</span></div></td></tr>}</tbody></table></div>;
}
function JobAction({job,role,history,onTransition}){if(history||job.status==='CLOSED')return <span className="cw-dash">—</span>;const map={WAITING:['assign','Assign washer'],ASSIGNED:['start','Start wash'],'IN PROGRESS':['complete','Complete wash'],COMPLETED:['ready','Mark ready'],READY:['deliver','Collected'],DELIVERED:['close','Close order']};let[action,label]=map[job.status]||[];if(['ASSIGNED','IN PROGRESS'].includes(job.status)&&role!=='Washer')action=null;if(['COMPLETED','READY'].includes(job.status)&&role==='Washer')action=null;if(job.status==='WAITING'&&!['Receptionist','Business Admin'].includes(role))action=null;if(job.status==='DELIVERED'&&role!=='Business Admin')action=null;if(!action)return <span className="cw-dash">{['ASSIGNED','IN PROGRESS'].includes(job.status)?'Washer working':'—'}</span>;if(action==='complete'&&role==='Washer')return <label className="cw-wash-complete-check"><input type="checkbox" aria-label={`Mark wash ${job.id} finished`} onChange={()=>onTransition(job.id,action)}/><span>Wash finished</span></label>;return <button className={`cw-small-action ${action==='complete'?'success':''}`} onClick={()=>onTransition(job.id,action)}>{label}</button>;}
function StatusPill({status}){const label=status==='SUSPENDED'?'INACTIVE':status;const kind=label.toLowerCase().replaceAll(' ','-');return <span className={`cw-status status-${kind}`}><i/>{label}</span>}

function CustomersPage({customers,vehicles,query,setQuery,onAdd,canSelect,canEdit,onEdit,canDelete,selectedIds,deleting,onToggle,onSelectAll,onClearSelection,onDelete}){const visible=customers.filter((item)=>`${item.name} ${item.phone} ${item.email} ${vehicles.filter((v)=>v.customerId===item.id).map((v)=>v.registration).join(' ')}`.toLowerCase().includes(query.toLowerCase()));return <><PageHeading title="Customers & vehicles" subtitle="Customer profiles, vehicles and visit history in one place." action={<button className="cw-primary" onClick={onAdd}><Plus size={16}/> Add customer</button>}/><div className="cw-toolbar"><div className="cw-search"><Search size={16}/><input placeholder="Search customer, phone or plate…" value={query} onChange={(event)=>setQuery(event.target.value)}/></div><span className="cw-record-count">{customers.length} customers · {vehicles.length} vehicles</span></div>{canSelect&&<div className="cw-bulk-actions"><span>{selectedIds.length} selected{deleting?' · Deleting…':''}</span><button type="button" disabled={deleting||(!visible.length&&!selectedIds.length)} onClick={()=>selectedIds.length?onClearSelection():onSelectAll(visible.slice(0,100).map((customer)=>customer.id))}>{selectedIds.length?'Deselect all':'Select up to 100'}</button><button type="button" disabled={deleting||!selectedIds.length} onClick={onClearSelection}>Clear selection</button>{canDelete&&<button type="button" className="danger" disabled={deleting||!selectedIds.length} onClick={()=>onDelete(selectedIds)}><Trash2 size={14}/>{deleting?'Deleting…':'Delete selected'}</button>}<small>{canDelete?'Records with vehicles or wash history are kept when you delete.':'Select customer records to review or update them.'}</small></div>}<div className="cw-panel cw-table-panel"><div className="cw-table-wrap"><table className="cw-table"><thead><tr>{canSelect&&<th>SELECT</th>}<th>CUSTOMER</th><th>VEHICLES</th><th>VISITS</th><th>LOYALTY POINTS</th><th>LAST VISIT</th>{canEdit&&<th>ACTION</th>}</tr></thead><tbody>{visible.map((customer,index)=>{return <tr key={customer.id}>{canSelect&&<td><input type="checkbox" aria-label={`Select ${customer.name}`} checked={selectedIds.includes(customer.id)} disabled={deleting||(!selectedIds.includes(customer.id)&&selectedIds.length>=100)} onChange={()=>onToggle(customer.id)}/></td>}<td><div className="cw-person-cell"><div className={`cw-person-avatar avatar-${index%4}`}>{customer.name.split(' ').map((part)=>part[0]).slice(0,2).join('')}</div><span><b>{customer.name}</b><small>{customer.phone}{customer.email?` · ${customer.email}`:''}</small></span></div></td><td>{vehicles.filter((vehicle)=>vehicle.customerId===customer.id).length?vehicles.filter((vehicle)=>vehicle.customerId===customer.id).map((vehicle)=><span className="cw-plate-tag" key={vehicle.id}>{vehicle.registration}<small>{vehicle.make} {vehicle.model}</small></span>):<span className="cw-cell-sub">No vehicle added</span>}</td><td>{customer.visits}</td><td><b className="cw-points">✦ {customer.points}</b></td><td>{customer.lastVisit}</td>{canEdit&&<td><button type="button" className="cw-small-action" onClick={()=>onEdit(customer)}><Pencil size={13}/>Update</button></td>}</tr>;})}{!visible.length&&<tr><td colSpan={(canSelect?6:5)+(canEdit?1:0)}><div className="cw-table-empty">No customers found.</div></td></tr>}</tbody></table></div></div></>}

function ServicesPage({services,jobs,canDelete,canEdit,onEdit,selectedIds,deleting,onToggle,onSelectAll,onClearSelection,onDelete,onAdd,onChange}){const eligible=services.filter((service)=>!jobs.some((job)=>job.serviceIds?.includes(service.id)));return <><PageHeading title="Services & pricing" subtitle="Configure wash services, customer prices and worker commission rules." action={<button className="cw-primary" onClick={onAdd}><Plus size={16}/> Add service</button>}/>{canDelete&&<div className="cw-bulk-actions"><span>{selectedIds.length} selected{deleting?' · Deleting…':''}</span><button type="button" disabled={deleting||(!services.length&&!selectedIds.length)} onClick={()=>selectedIds.length?onClearSelection():onSelectAll(services.slice(0,100).map((service)=>service.id))}>{selectedIds.length?'Deselect all':'Select up to 100'}</button><button type="button" disabled={deleting||!selectedIds.length} onClick={onClearSelection}>Clear selection</button><button type="button" className="danger" disabled={deleting||!selectedIds.length} onClick={()=>onDelete(selectedIds)}><Trash2 size={14}/>{deleting?'Deleting…':'Delete selected'}</button><small>Services already used on wash orders stay in your business history.</small></div>}<div className="cw-service-grid">{services.map((service,index)=>{const unused=!jobs.some((job)=>job.serviceIds?.includes(service.id));return <article className="cw-service-card" key={service.id}>{canDelete&&<label className="cw-service-select"><input type="checkbox" aria-label={`Select service ${service.name}`} checked={selectedIds.includes(service.id)} disabled={deleting||(!selectedIds.includes(service.id)&&selectedIds.length>=100)} onChange={()=>onToggle(service.id)}/> Select</label>}<div className="cw-service-head"><div className={`cw-service-icon service-${index%4}`}><Sparkles size={19}/></div><span className={`cw-active-tag ${service.active?'':'inactive'}`}><i/>{service.active?'ACTIVE':'PAUSED'}</span></div><span className="cw-service-category">{service.category}</span><h2>{service.name}</h2><p>Average time · {service.duration} min</p><div className="cw-service-price"><span>Customer price</span><b>{formatKes(service.price)}</b></div><div className="cw-service-price commission-line"><span>Washer commission</span><b>{formatKes(service.commission)}</b></div><div className="cw-service-actions">{canEdit&&<button type="button" className="cw-secondary" onClick={()=>onEdit(service)}><Pencil size={14}/>Update</button>}<button className="cw-secondary cw-wide" onClick={()=>onChange(service)}>{service.active?'Pause service':'Activate service'}</button></div></article>;})}{!services.length&&<EmptyPanel title="No services yet" text="Add the services your car wash offers."/>}</div></>}

function StaffPage({staff,jobs,selectedIds=[],updating=false,onEdit,onToggle,onSelectAll,onClearSelection,onBulkStatus,onAdd,onChange}){
  const selectableStaff=staff.filter((person)=>['Washer','Receptionist'].includes(person.role));
  const selected=selectableStaff.filter((person)=>selectedIds.includes(person.id));
  const canDeactivate=selected.some((person)=>person.status==='Active');
  const canReactivate=selected.some((person)=>person.status!=='Active');
  return <>
    <PageHeading title="Staff" subtitle="View team memberships, branch assignments and access status." action={<button className="cw-primary" onClick={onAdd}><Plus size={16}/> Add team member</button>}/>
    <div className="cw-bulk-actions cw-staff-bulk-actions"><span>{selected.length} selected{updating?' · Updating…':''}</span><button type="button" disabled={updating||(!selectableStaff.length&&!selected.length)} onClick={()=>selected.length?onClearSelection():onSelectAll(selectableStaff.slice(0,100).map((person)=>person.id))}>{selected.length?'Deselect all':'Select up to 100'}</button>{selected.length>0&&<button type="button" disabled={updating} onClick={onClearSelection}>Clear selection</button>}{canDeactivate&&<button type="button" disabled={updating} onClick={()=>onBulkStatus(selected.map((person)=>person.id),false)}>Deactivate selected</button>}{canReactivate&&<button type="button" disabled={updating} onClick={()=>onBulkStatus(selected.map((person)=>person.id),true)}>{selected.some((person)=>person.status==='Pending approval')?'Approve':'Reactivate'} selected</button>}<small>Approve pending staff accounts here. Business Admin access is managed in business settings.</small></div>
    <div className="cw-panel cw-table-panel"><div className="cw-table-wrap"><table className="cw-table">
      <thead><tr><th>SELECT</th><th>TEAM MEMBER</th><th>ROLE</th><th>BRANCH</th><th>STATUS</th><th>JOBS TODAY</th><th/></tr></thead>
      <tbody>{staff.map((person,index)=>{const canManage=['Washer','Receptionist'].includes(person.role);return <tr key={person.id}>
        <td>{canManage?<input type="checkbox" aria-label={`Select ${person.name}`} checked={selectedIds.includes(person.id)} disabled={updating||(!selectedIds.includes(person.id)&&selected.length>=100)} onChange={()=>onToggle(person.id)}/>:<span className="cw-dash">—</span>}</td>
        <td><div className="cw-person-cell"><div className={`cw-person-avatar avatar-${index%4}`}>{person.name.split(' ').map((part)=>part[0]).slice(0,2).join('')}</div><span><b>{person.name}</b><small>{person.email||person.phone||'Invited team member'}</small></span></div></td>
        <td>{person.role}</td><td>{person.branch}</td>
        <td><span className={`cw-active-tag ${person.status==='Active'?'':'inactive'}`}><i/>{person.status}</span></td>
        <td>{person.role==='Washer'?jobs.filter((job)=>job.washerId===person.id).length:'—'}</td>
        <td>{canManage?<div className="cw-row-actions">{person.status!=='Pending approval'&&<button type="button" className="cw-secondary cw-mini-button" onClick={()=>onEdit(person)}><Pencil size={13}/>Update</button>}<button type="button" className="cw-secondary cw-mini-button" onClick={()=>onChange(person)}>{person.status==='Pending approval'?'Approve account':person.status==='Active'?'Deactivate':'Reactivate'}</button></div>:<span className="cw-dash">Business owner</span>}</td>
      </tr>})}</tbody>
    </table></div></div>
  </>;
}

function PaymentsPage({payments,jobs,customers,selectedIds=[],onToggle,onSelectAll,onClearSelection,onPayment}){const unpaid=jobs.filter((job)=>job.paymentStatus!=='PAID');return <><PageHeading title="Payments" subtitle="Cash, card and mobile money records for wash orders."/><div className="cw-metrics small-metrics"><MetricCard label="Collected" value={formatKes(payments.reduce((sum,row)=>sum+K(row.amount),0))} note={`${payments.length} transactions`} icon={Banknote}/><MetricCard label="Unpaid orders" value={unpaid.length} note="Awaiting payment" icon={Clock3}/><MetricCard label="M-Pesa" value={payments.filter((row)=>row.method==='M-Pesa').length} note="Recorded references" icon={CreditCard}/><MetricCard label="Refunds" value="KES 0" note="No refunds this period" icon={ArrowDownLeft}/></div>{unpaid.length>0&&<div className="cw-notice"><Clock3 size={17}/><span><b>{unpaid.length} order{unpaid.length===1?'':'s'} need payment</b><small>Record payment before handing the vehicle back.</small></span>{unpaid.slice(0,1).map((job)=><button key={job.id} onClick={()=>onPayment(job)}>Record payment</button>)}</div>}<div className="cw-bulk-actions"><span>{selectedIds.length} selected</span><button type="button" disabled={!payments.length&&!selectedIds.length} onClick={()=>selectedIds.length?onClearSelection():onSelectAll(payments.slice(0,100).map((row)=>row.id))}>{selectedIds.length?'Deselect all':'Select up to 100'}</button><button type="button" disabled={!selectedIds.length} onClick={onClearSelection}>Clear selection</button><small>Payment records remain available for reconciliation and audit.</small></div><div className="cw-panel cw-table-panel"><div className="cw-panel-head pad-head"><div><h2>Transaction history</h2><p>Most recent payment records</p></div><span className="cw-live"><i/> UP TO DATE</span></div><div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>SELECT</th><th>REFERENCE</th><th>CUSTOMER</th><th>WASH ORDER</th><th>METHOD</th><th>TIME</th><th>STATUS</th><th className="align-right">AMOUNT</th></tr></thead><tbody>{payments.map((payment)=><tr key={payment.id}><td><input type="checkbox" aria-label={`Select payment ${payment.reference||payment.id}`} checked={selectedIds.includes(payment.id)} disabled={!selectedIds.includes(payment.id)&&selectedIds.length>=100} onChange={()=>onToggle(payment.id)}/></td><td><b className="cw-cell-primary">{payment.reference||'—'}</b></td><td>{customers.find((c)=>c.id===payment.customerId)?.name||'Customer'}</td><td>{payment.jobId}</td><td><span className="cw-method"><CreditCard size={14}/>{payment.method}</span></td><td>{payment.time}</td><td><StatusPill status={payment.status}/></td><td className="align-right"><b>{formatKes(payment.amount)}</b></td></tr>)}{!payments.length&&<tr><td colSpan="8"><div className="cw-table-empty">No payments recorded.</div></td></tr>}</tbody></table></div></div></>}

function LedgerPage({title,subtitle,rows,db,selectedIds=[],onToggle,onSelectAll,onClearSelection,onReview}){const total=rows.reduce((sum,row)=>sum+K(row.amount),0);return <><PageHeading title={title} subtitle={subtitle}/><div className="cw-metrics small-metrics"><MetricCard label="Total commission" value={formatKes(total)} note="Recorded earnings" icon={CircleDollarSign}/><MetricCard label="Pending approval" value={rows.filter((row)=>row.status==='PENDING').length} note="Needs reconciliation" icon={Clock3}/><MetricCard label="Approved" value={rows.filter((row)=>row.status==='APPROVED').length} note="Ready for payout" icon={CheckCircle2}/></div><div className="cw-bulk-actions"><span>{selectedIds.length} selected</span><button type="button" disabled={!rows.length&&!selectedIds.length} onClick={()=>selectedIds.length?onClearSelection():onSelectAll(rows.slice(0,100).map((row)=>row.id))}>{selectedIds.length?'Deselect all':'Select up to 100'}</button><button type="button" disabled={!selectedIds.length} onClick={onClearSelection}>Clear selection</button><small>Use row actions to approve commissions or record payouts. Ledger history is retained for audit.</small></div><div className="cw-panel cw-table-panel"><div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>SELECT</th><th>WASHER</th><th>WASH ORDER</th><th>RULE SNAPSHOT</th><th>DATE</th><th>STATUS</th><th className="align-right">AMOUNT</th><th/></tr></thead><tbody>{rows.map((row)=><tr key={row.id}><td><input type="checkbox" aria-label={"Select commission " + row.jobId} checked={selectedIds.includes(row.id)} disabled={!selectedIds.includes(row.id)&&selectedIds.length>=100} onChange={()=>onToggle(row.id)}/></td><td>{db.staff.find((item)=>item.id===row.workerId)?.name||'Washer'}</td><td>{row.jobId}</td><td>Service commission at completion</td><td>{row.date}</td><td><StatusPill status={row.status}/></td><td className="align-right"><b className="cw-commission-amount">{formatKes(row.amount)}</b></td><td>{row.status==='PENDING'?<button className="cw-small-action" onClick={()=>onReview(row,'APPROVED')}>Approve</button>:row.status==='APPROVED'?<button className="cw-small-action success" onClick={()=>onReview(row,'PAID')}>Record payout</button>:<span className="cw-dash">—</span>}</td></tr>)}{!rows.length&&<tr><td colSpan="8"><div className="cw-table-empty">Commissions appear when washes are completed.</div></td></tr>}</tbody></table></div></div></>}

function EarningsPage({user,jobs,commissions,db,selectedIds=[],onToggle,onSelectAll,onClearSelection}){
  const own=commissions.filter((row)=>row.workerId===user.staffId),total=own.reduce((sum,row)=>sum+K(row.amount),0),done=jobs.filter((job)=>job.washerId===user.staffId&&['COMPLETED','READY','DELIVERED','CLOSED'].includes(job.status));
  return <><PageHeading title="My earnings" subtitle="Your daily, weekly and monthly commission totals."/><div className="cw-metrics small-metrics"><MetricCard label="Commission this month" value={formatKes(total)} note={`${done.length} completed washes · ledger backed`} icon={CircleDollarSign}/><MetricCard label="Today" value={formatKes(total)} note="Commission earned" icon={Zap}/><MetricCard label="This week" value={formatKes(total)} note="Current week" icon={CalendarDays}/><MetricCard label="Completed washes" value={done.length} note="Your work this period" icon={CheckCircle2}/></div><div className="cw-bulk-actions"><span>{selectedIds.length} selected</span><button type="button" disabled={!own.length&&!selectedIds.length} onClick={()=>selectedIds.length?onClearSelection():onSelectAll(own.slice(0,100).map((row)=>row.id))}>{selectedIds.length?'Deselect all':'Select up to 100'}</button><button type="button" disabled={!selectedIds.length} onClick={onClearSelection}>Clear selection</button><small>Completed work and commission records remain as financial history.</small></div><div className="cw-panel cw-table-panel"><div className="cw-panel-head pad-head"><div><h2>My completed work</h2><p>Each commission is tied to the completed wash order.</p></div></div><div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>SELECT</th><th>WASH ORDER</th><th>VEHICLE</th><th>SERVICE</th><th>DATE</th><th className="align-right">COMMISSION</th></tr></thead><tbody>{own.map((row)=><tr key={row.id}><td><input type="checkbox" aria-label={"Select commission " + row.jobId} checked={selectedIds.includes(row.id)} disabled={!selectedIds.includes(row.id)&&selectedIds.length>=100} onChange={()=>onToggle(row.id)}/></td><td>{row.jobId}</td><td>{db.vehicles.find((v)=>v.id===jobs.find((j)=>j.id===row.jobId)?.vehicleId)?.registration||'—'}</td><td>{db.services.find((s)=>s.id===jobs.find((j)=>j.id===row.jobId)?.serviceIds?.[0])?.name||'Wash service'}</td><td>{row.date}</td><td className="align-right cw-commission-amount">{formatKes(row.amount)}</td></tr>)}</tbody></table></div></div></>;
}
function LoyaltyPage({customers,ledger,db}){return <><PageHeading title="Loyalty" subtitle="Reward repeat customers with transparent points and a traceable ledger."/><div className="cw-metrics small-metrics"><MetricCard label="Members" value={customers.filter((c)=>c.points>0).length} note="Customers earning points" icon={Users}/><MetricCard label="Points balance" value={customers.reduce((n,c)=>n+K(c.points),0).toLocaleString()} note="Across all customers" icon={BadgeCheck}/><MetricCard label="Earn rate" value={`${db.settings.loyaltyRate} pt / KES`} note="Tenant policy" icon={Sparkles}/></div><div className="cw-panel cw-table-panel"><div className="cw-panel-head pad-head"><div><h2>Customer balances</h2><p>Points change only when a wash order is closed.</p></div></div><div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>CUSTOMER</th><th>VISITS</th><th>LAST VISIT</th><th className="align-right">POINTS BALANCE</th></tr></thead><tbody>{customers.map((item)=><tr key={item.id}><td>{item.name}<small className="cw-cell-sub">{item.phone}</small></td><td>{item.visits}</td><td>{item.lastVisit}</td><td className="align-right"><b className="cw-points">✦ {item.points.toLocaleString()} pts</b></td></tr>)}</tbody></table></div></div></>}

function ReportsPage({jobs,payments,commissions,db,role}){
  const [period,setPeriod]=useState('daily'),[reportType,setReportType]=useState('summary');
  const end=new Date(),start=new Date(end);start.setHours(0,0,0,0);if(period==='weekly')start.setDate(start.getDate()-6);if(period==='monthly')start.setDate(1);if(period==='yearly')start.setMonth(0,1);
  const dateOf=(value)=>{if(!value)return new Date();const parsed=new Date(value);return Number.isNaN(parsed.getTime())?new Date():parsed;};
  const inRange=(value)=>{const date=dateOf(value);return date>=start&&date<=end;};
  const periodJobs=jobs.filter((job)=>inRange(job.checkedInAt));
  const periodPayments=payments.filter((payment)=>inRange(payment.recordedAt));
  const periodCommissions=commissions.filter((row)=>inRange(row.recordedAt||row.date));
  const revenue=periodPayments.reduce((n,p)=>n+K(p.amount),0),closed=periodJobs.filter((j)=>['CLOSED','DELIVERED'].includes(j.status)),staff=role==='SaaS Super Admin'?db.tenants:db.staff;
  const download=()=>{
    const sections=[];
    const add=(title,headers,rows)=>{sections.push([title,...headers].join(','));for(const row of rows)sections.push(row.map((value)=>`"${String(value??'').replaceAll('"','""')}"`).join(','));sections.push('');};
    if(reportType==='summary'||reportType==='wash-orders')add('Wash orders',['Order ID','Date','Status','Total KES','Payment status','Washer'],periodJobs.map((job)=>[job.id,job.checkedInAt||new Date().toISOString().slice(0,10),job.status,job.total,job.paymentStatus,db.staff.find((item)=>item.id===job.washerId)?.name||'']));
    if(reportType==='summary'||reportType==='payments')add('Payments',['Date','Order ID','Method','Status','Amount KES','Reference'],periodPayments.map((payment)=>[payment.recordedAt||payment.time,payment.jobId,payment.method,payment.status,payment.amount,payment.reference]));
    if(reportType==='summary'||reportType==='commissions')add('Commissions',['Date','Order ID','Washer','Status','Amount KES'],periodCommissions.map((row)=>[row.recordedAt||row.date,row.jobId,db.staff.find((item)=>item.id===row.workerId)?.name||'Washer',row.status,row.amount]));
    if(reportType==='summary')sections.unshift(`OshaHub ${period} report\nMetric,Value\nSales KES,${revenue}\nWash orders,${periodJobs.length}\nCollected or closed,${closed.length}\nCommission KES,${periodCommissions.reduce((n,c)=>n+K(c.amount),0)}\n`);
    const csv='\ufeff'+sections.join('\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`${period}-${reportType}-report.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <><PageHeading title={role==='SaaS Super Admin'?'Platform reports':'Reports & insights'} subtitle="Download daily, weekly, monthly or yearly reports for your workspace."/><div className="cw-report-download cw-panel"><div><b>Download report</b><small>Choose a reporting period and the records to include.</small></div><label>Period<select value={period} onChange={(event)=>setPeriod(event.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label><label>Report type<select value={reportType} onChange={(event)=>setReportType(event.target.value)}><option value="summary">Full summary</option><option value="wash-orders">Wash orders</option>{role!=='Washer'&&<option value="payments">Payments</option>}<option value="commissions">Commissions</option></select></label><button className="cw-primary" onClick={download}><Download size={16}/> Download CSV</button></div><div className="cw-metrics small-metrics">{role!=='Washer'&&<MetricCard label="Sales" value={formatKes(revenue)} note="Recorded payments" icon={Banknote}/>}<MetricCard label="Wash orders" value={periodJobs.length} note="Selected period" icon={CarFront}/>{role!=='Washer'&&<MetricCard label="Collected / closed" value={closed.length} note="Customer handoffs" icon={CheckCircle2}/>}<MetricCard label={role==='Washer'?'My commission':'Commission expense'} value={formatKes(periodCommissions.reduce((n,c)=>n+K(c.amount),0))} note="Worker earnings" icon={CircleDollarSign}/></div><div className="cw-lower-grid report-grid"><div className="cw-panel"><div className="cw-panel-head"><div><h2>Sales trend</h2><p>Paid wash jobs across the week</p></div></div><SalesChart payments={periodPayments}/></div><div className="cw-panel"><div className="cw-panel-head"><div><h2>{role==='SaaS Super Admin'?'Business accounts':'Team performance'}</h2><p>{role==='SaaS Super Admin'?'Subscription status by account':'Completed wash work'}</p></div></div>{staff.slice(0,6).map((item,index)=><div className="cw-report-row" key={item.id}><div className={`cw-team-avatar avatar-${index%4}`}>{(item.name||item.owner).split(' ').map((part)=>part[0]).slice(0,2).join('')}</div><span><b>{item.name||item.owner}</b><small>{item.role||item.plan}</small></span><strong>{item.status}</strong></div>)}</div></div></>}

function TenantsPage({tenants,onAdd,onChange}){return <><PageHeading title="Businesses" subtitle="Manage tenant access, subscription health and commercial status." action={<button className="cw-primary" onClick={onAdd}><Plus size={16}/> Add business</button>}/><div className="cw-metrics small-metrics"><MetricCard label="All businesses" value={tenants.length} note="Registered tenants" icon={Store}/><MetricCard label="Active" value={tenants.filter((t)=>t.status==='ACTIVE').length} note="Currently operating" icon={CheckCircle2}/><MetricCard label="Trials" value={tenants.filter((t)=>t.status==='TRIAL').length} note="Evaluation accounts" icon={Zap}/><MetricCard label="Attention needed" value={tenants.filter((t)=>['EXPIRING SOON','EXPIRED'].includes(t.status)).length} note="Renew or review" icon={Clock3}/></div><div className="cw-panel cw-table-panel"><TenantsTable tenants={tenants} onChange={onChange}/></div></>}
function TenantsTable({tenants,onChange,compact=false}){return <div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>BUSINESS</th><th>OWNER</th><th>PLAN</th><th>BRANCHES</th><th>SUBSCRIPTION</th><th>ENDS</th>{!compact&&<th/>}</tr></thead><tbody>{tenants.map((item,index)=><tr key={item.id}><td><div className="cw-person-cell"><div className={`cw-tenant-avatar avatar-${index%4}`}><Store size={16}/></div><span><b>{item.name}</b><small>Joined {item.createdAt}</small></span></div></td><td>{item.owner}</td><td><span className="cw-plan-chip">{item.plan}</span></td><td>{item.branches}</td><td><StatusPill status={item.status}/></td><td>{item.endsAt}</td>{!compact&&<td><select className="cw-status-select" value={item.status} onChange={(event)=>onChange(item,event.target.value)}><option>TRIAL</option><option>ACTIVE</option><option>EXPIRING SOON</option><option>EXPIRED</option></select></td>}</tr>)}</tbody></table></div>}

function PlansPage({plans,tenants,onAdd}){const defaults=[{name:'Starter',price:3900,days:30,features:'1 branch · 1 receptionist · 3 washers · Core operations and washer app'}, {name:'Growth',price:7900,days:30,features:'3 branches · 15 staff · Reports, loyalty and washer app'}, {name:'Enterprise',price:14900,days:30,features:'Unlimited branches and staff · Priority support and washer app'}];const items=plans.length?plans:defaults;return <><PageHeading title="Plans & billing" subtitle="Monthly, 3-month, 5-month and yearly terms. Longer terms save KES 300 per month." action={<button className="cw-primary" onClick={onAdd}><Plus size={16}/> Create plan</button>}/><div className="cw-service-grid plan-grid">{items.map((plan,index)=><article className="cw-service-card cw-plan-product" key={`${plan.name}-${index}`}><div className="cw-service-head"><div className={`cw-service-icon service-${index%4}`}><Wallet size={19}/></div><span className="cw-active-tag"><i/>AVAILABLE</span></div><span className="cw-service-category">{plan.days||30} DAY SUBSCRIPTION</span><h2>{plan.name}</h2><p>{plan.features}</p><div className="cw-service-price"><span>Subscription price</span><b>{formatKes(plan.price)}<small> / period</small></b></div><div className="cw-service-price"><span>Businesses on plan</span><b>{tenants.filter((tenant)=>tenant.plan===plan.name).length}</b></div><span className="cw-plan-status">Available for tenant assignment</span></article>)}</div><div className="cw-note-box"><ShieldCheck size={17}/><span>Expired accounts enter restricted mode. Their records remain available for billing, audit and reactivation.</span></div></>}

function CustomerBillingPage({billing,tenant,onRequest,onRefresh}){
  const [selectedPlan,setSelectedPlan]=useState(''); const [expandedTier,setExpandedTier]=useState('');
  const [showPlans,setShowPlans]=useState(false);
  const [hasMultipleBranches,setHasMultipleBranches]=useState(false); const [branchCount,setBranchCount]=useState(2);
  const [phone,setPhone]=useState(''); const [busy,setBusy]=useState(false); const [paymentMessage,setPaymentMessage]=useState('');
  const [billingDrawerOpen,setBillingDrawerOpen]=useState(false); const [renewalMode,setRenewalMode]=useState(false);
  const current=billing?.currentSubscription; const plan=billing?.currentPlan; const pending=billing?.pendingRequest;
  const trialRequestState=getTrialRequestState(current,billing?.requests||[],billing?.payments||[],Date.now(),Boolean(billing?.trialExtensionUsedAt));
  const trialExpired=trialRequestState.trialExpired;
  const trial=current?.status==='TRIAL'&&!trialExpired;
  const subscriptionStatus=trialExpired?'EXPIRED':current?.status;
  const trialEligible=trialRequestState.canRequestTrialExtension;
  const daysLeft=current?Math.max(0,Math.ceil((new Date(current.ends_at)-Date.now())/86400000)):0;
  const activePlanId=current?.status==='ACTIVE'&&new Date(current.ends_at)>Date.now()?current.plan_id:null;
  const plans=billing?.plans||[]; const payments=billing?.payments||[]; const currentPlanOption=plans.find((item)=>item.id===current?.plan_id);
  const pendingPlan=plans.find((item)=>item.id===pending?.plan_id);
  const lockedPlanId=pending?.request_type==='PLAN_PURCHASE'?pending.plan_id:null;
  const effectiveSelectedPlan=lockedPlanId||selectedPlan;
  const selected=plans.find((item)=>item.id===effectiveSelectedPlan);
  const currentTermActive=current?.status==='ACTIVE'&&current?.plan_id===selected?.id&&new Date(current.ends_at)>Date.now(); const selectedTermActive=currentTermActive&&!(renewalMode&&billingDrawerOpen)&&!(pending?.request_type==='PLAN_PURCHASE'&&pending.plan_id===selected?.id);
  const branchLimit=selected?.branchLimit>0?selected.branchLimit:100;
  const effectiveBranchCount=billing?.onboardingFeeDue?(hasMultipleBranches?Math.max(2,Math.min(branchLimit,Number(branchCount)||2)):1):(pending?.branch_count||current?.branch_count||1);
  const onboardingFee=billing?.onboardingFeeDue?Number(billing?.onboardingFee||8500)*effectiveBranchCount:0;
  const amountDueNow=onboardingFee||Number(selected?.price||0);
  const tierPlans=OSHAHUB_PRICES.map(([tier,,features],index)=>({tier,features,monthly:[3900,7900,14900][index],options:plans.filter((item)=>item.tier===tier).sort((a,b)=>a.months-b.months)}));
  const [checkingId,setCheckingId]=useState('');
  useEffect(()=>{if(lockedPlanId){setSelectedPlan(lockedPlanId);setExpandedTier(pendingPlan?.tier||'');setBillingDrawerOpen(true);} },[lockedPlanId,pendingPlan?.tier]);
  useEffect(()=>{if(!billingDrawerOpen)return undefined;const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';const closeOnEscape=(event)=>{if(event.key==='Escape')setBillingDrawerOpen(false);};window.addEventListener('keydown',closeOnEscape);return()=>{document.body.style.overflow=previousOverflow;window.removeEventListener('keydown',closeOnEscape);};},[billingDrawerOpen]);
  useEffect(()=>{if(!pending?.id||pending.request_type!=='PLAN_PURCHASE'||pending.mpesa_payment_status==='PAID'||pending.status!=='PENDING')return;let stopped=false;const poll=async()=>{const {data,error}=await supabaseBrowser.from('carwash_billing_requests').select('status,mpesa_payment_status,mpesa_result_code').eq('id',pending.id).maybeSingle();if(stopped||error||!data)return;if(data.mpesa_payment_status==='PAID'||data.status==='APPROVED'){setPaymentMessage(`${formatKes(pending.mpesa_expected_amount_kes||onboardingFee||selected?.price)} payment confirmed by Safaricom. ${tenant?.name||'Your business'} is active on ${pendingPlan?.name||selected?.name||'your selected'} plan. Never share your M-Pesa PIN with anyone.`);setCheckingId('');setBillingDrawerOpen(false);await onRefresh?.();stopped=true;}else if(data.mpesa_payment_status==='FAILED'){setPaymentMessage('The M-Pesa request was not completed. Check your phone and try again.');setCheckingId('');stopped=true;}};const timer=setInterval(poll,3000);if(checkingId===pending.id)poll();return()=>{stopped=true;clearInterval(timer);};},[pending?.id,pending?.status,pending?.mpesa_payment_status,checkingId,onRefresh,onboardingFee,selected?.price,pendingPlan?.name,selected?.name,tenant?.name]);
  async function submit(payload){setBusy(true);setPaymentMessage('');try{const result=await onRequest(payload);if(result?.requestId){setCheckingId(result.requestId);setPaymentMessage(`An M-Pesa prompt for ${formatKes(result.amountKes||amountDueNow)} is on its way to ${payload.phone}. Enter your M-Pesa PIN to pay.`);}}catch(error){setPaymentMessage(userFacingErrorMessage(error,'Could not start the M-Pesa payment. Check the details and try again.'));}finally{setBusy(false);}}
  function downloadReport(){const rows=[['Date','Plan','Branches','Payment stage','Amount KES','Method','Reference'],...payments.map((payment)=>[new Date(payment.paid_at).toLocaleDateString('en-KE'),plans.find((item)=>item.id===payment.plan_id)?.name||'Subscription',payment.branch_count||1,payment.payment_stage||'LEGACY',payment.amount_kes,payment.method,payment.external_reference||''])];const csv=rows.map((row)=>row.map((value)=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`${(tenant?.name||'oshahub').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-billing-report.csv`;link.click();URL.revokeObjectURL(url);}
  return <>
    <PageHeading title="Plans & billing" subtitle="Choose your subscription, pay onboarding securely with M-Pesa, and review your payment history."/>
    <div className="cw-billing-current"><div><span>{trial?'FREE TRIAL':plan?.name?.toUpperCase()||'CURRENT SUBSCRIPTION'}</span><h2>{tenant?.name||'Your business'}</h2><p>{trial?`You have ${daysLeft} day${daysLeft===1?'':'s'} left in your free 7-day trial.`:current?`${plan?.name||'Your plan'} · ${current.branch_count||1} branch${current.branch_count===1?'':'es'} · ${subscriptionStatus} · Ends ${new Date(current.ends_at).toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'})}`:'Choose a plan to continue using your workspace.'}</p></div><div className="cw-billing-current-mark"><ShieldCheck size={22}/><b>{subscriptionStatus||'NO PLAN'}</b></div>{activePlanId&&currentPlanOption&&payments.length>0&&!pending&&<button type="button" className="cw-secondary" onClick={()=>{setSelectedPlan(currentPlanOption.id);setRenewalMode(true);setBillingDrawerOpen(true);}}>Renew current plan</button>}</div>
    {trialEligible&&<div className="cw-billing-extension"><div><b>Need more time?</b><span>Request another 7-day trial. OshaHub will review the request and notify you in the app.</span></div><button className="cw-secondary" disabled={busy||Boolean(pending)} onClick={()=>submit({type:'TRIAL_EXTENSION'})}>{busy?'Sending…':'Request another 7 days'}</button></div>}
    {trialExpired&&trialRequestState.trialExtensionGranted&&<div className="cw-note-box"><Clock3 size={17}/><span>Your one-time extra 7-day trial has already been used. Choose a paid plan to reopen your workspace or contact OshaHub administration for help.</span></div>}
    {trialRequestState.trialRequestPending&&<div className="cw-note-box"><Clock3 size={17}/><span>Your 7-day trial request is pending OshaHub review.</span></div>}
    <div className="cw-billing-plans-heading"><PageHeading title="Available plans" subtitle="Compare terms and features when you’re ready to choose."/><button type="button" className="cw-secondary cw-plans-disclosure" aria-expanded={showPlans} onClick={()=>setShowPlans((show)=>!show)}>{showPlans?'Hide plans':'View available plans'}<ChevronDown size={16}/></button></div>
    {showPlans&&<div className="cw-customer-plan-grid">{tierPlans.map((group,index)=><article className={`cw-customer-plan ${group.options.some((item)=>item.id===effectiveSelectedPlan)?'selected':''}`} key={group.tier}><span className="cw-service-category">OSHAHUB {group.tier.toUpperCase()}</span><h3>{group.tier}</h3><strong>{formatKes(group.monthly)}<small> / month</small></strong><button className="cw-primary" aria-expanded={expandedTier===group.tier} onClick={()=>setExpandedTier(expandedTier===group.tier?'':group.tier)}>{expandedTier===group.tier?'Hide plan':'View plan'}</button>{expandedTier===group.tier&&<div className="cw-customer-plan-details"><p>{group.features}</p><span className="cw-service-category">CHOOSE A SUBSCRIPTION TERM</span><div className="cw-plan-term-options">{OSHAHUB_TERMS.map(([label,months])=>{const option=group.options.find((item)=>item.months===months);const price=months===1?group.monthly:(group.monthly-300)*months;const isCurrentPlan=Boolean(option&&option.id===activePlanId);return <button type="button" key={label} className={`${effectiveSelectedPlan===option?.id?'active':''}${isCurrentPlan?' current':''}`} disabled={!option||Boolean(lockedPlanId)||isCurrentPlan} aria-label={isCurrentPlan?`${label}, current plan`:label} onClick={()=>{if(option&&!lockedPlanId&&!isCurrentPlan){setRenewalMode(false);setSelectedPlan(option.id);setShowPlans(false);setBillingDrawerOpen(true);if(option.branchLimit===1)setHasMultipleBranches(false);}}}><b>{label}</b>{isCurrentPlan?<span>Current plan</span>:<span>{formatKes(price)}</span>}{isCurrentPlan?<small>Already active</small>:months>1&&<small>Save {formatKes(300*months)}</small>}</button>})}</div></div>}</article>)}</div>}
    {selectedTermActive&&<div className="cw-note-box"><CheckCircle2 size={17}/><span>{paymentMessage||`Your ${selected.name} subscription is active until ${new Date(current.ends_at).toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'})}. The next subscription payment is due at renewal.`}</span></div>}
    {pending?.request_type==='PLAN_PURCHASE'&&!billingDrawerOpen&&!selectedTermActive&&<button type="button" className="cw-secondary cw-pending-payment-link" onClick={()=>setBillingDrawerOpen(true)}><Clock3 size={15}/>Continue pending payment <ArrowRight size={15}/></button>}
    {selected&&!selectedTermActive&&billingDrawerOpen&&<><button className="cw-billing-drawer-backdrop" aria-label="Close billing details" onClick={()=>setBillingDrawerOpen(false)}/><section className="cw-panel cw-billing-pay-panel" role="dialog" aria-modal="true" aria-label="Subscription payment"><div className="cw-panel-head"><div><h2>{pending?.request_type==='PLAN_PURCHASE'?'M-Pesa payment':onboardingFee>0?'Start your subscription':'Pay for your plan'}</h2><p>{onboardingFee>0?'Your first payment covers the one-time onboarding fee. The subscription plan price is due at renewal.':'Your onboarding fee is already paid. The M-Pesa prompt will charge only the selected plan price; no onboarding fee is added.'}</p></div><button className="cw-icon-button cw-billing-drawer-close" onClick={()=>setBillingDrawerOpen(false)} aria-label="Close payment panel"><X size={18}/></button></div><div className="cw-billing-horizontal"><div className="cw-billing-summary"><h3>Payment summary</h3><div className="cw-billing-invoice"><div><span>{onboardingFee?'Next subscription payment':'Selected plan'} · {selected.name} · {selected.term} ({selected.days} days)</span><b>{formatKes(selected.price)}</b></div>{onboardingFee>0&&<div><span>One-time onboarding · {effectiveBranchCount} branch{effectiveBranchCount===1?'':'es'}</span><b>{formatKes(onboardingFee)}</b></div>}<div className="total"><span>Due now</span><b>{formatKes(amountDueNow)}</b></div></div><p className="cw-billing-hint">{onboardingFee>0?`Pay KES 8,500 per branch now. This payment starts your ${selected.term} ${selected.name} subscription. ${formatKes(selected.price)} is due at renewal after ${selected.days} days.`:`Your onboarding fee has already been paid. The next subscription payment is ${formatKes(selected.price)}. ${current?.status==='ACTIVE'&&new Date(current.ends_at)>Date.now()?`It schedules this plan from ${new Date(current.ends_at).toLocaleDateString('en-KE',{day:'numeric',month:'long',year:'numeric'})}.`:'It starts the selected term now.'}`}</p>{billing?.onboardingFeeDue&&selected.branchLimit!==1&&<label className="cw-branch-choice"><input type="checkbox" disabled={Boolean(lockedPlanId)} checked={hasMultipleBranches} onChange={(event)=>setHasMultipleBranches(event.target.checked)}/><span><b>I have more than one branch</b><small>KES 8,500 onboarding per branch. {selected.branchLimit===-1?'This plan supports up to 100 branches.':`This plan supports ${selected.branchLimit||1} branches.`}</small></span></label>}{billing?.onboardingFeeDue&&hasMultipleBranches&&<label className="cw-form-label">NUMBER OF BRANCHES<input disabled={Boolean(lockedPlanId)} type="number" min="2" max={branchLimit} value={branchCount} onChange={(event)=>setBranchCount(Math.max(2,Math.min(branchLimit,Number(event.target.value)||2)))}/></label>}</div><div className="cw-billing-push"><div className="cw-mpesa-heading"><img src="/mpesa-logo.svg" alt="M-Pesa"/><span>Pay with M-Pesa</span></div><p>Enter the Safaricom number to receive a secure STK prompt. Confirm the payment on your phone.</p><label className="cw-form-label">M-PESA PHONE NUMBER<input type="tel" inputMode="tel" autoComplete="tel" placeholder="07XX XXX XXX" value={phone} onChange={(event)=>setPhone(event.target.value)} disabled={Boolean(pending&&pending.mpesa_payment_status!=='FAILED')}/></label>{paymentMessage&&<div className={`cw-stk-message ${pending?.mpesa_payment_status==='FAILED'?'error':''}`} role="status">{checkingId===pending?.id&&<span className="cw-stk-spinner"/>}{paymentMessage}</div>}<button className="cw-primary cw-stk-button" disabled={busy||! /^(?:0[17]\d{8}|[17]\d{8}|254[17]\d{8})$/.test(phone.replace(/[\s-]/g,''))||(pending&&pending.mpesa_payment_status!=='FAILED')} onClick={()=>pending?.request_type==='PLAN_PURCHASE'?submit({type:'STK_RETRY',requestId:pending.id,phone}):submit({type:'PLAN_PURCHASE',planId:effectiveSelectedPlan,phone,branchCount:effectiveBranchCount})}>{busy?'Sending prompt…':pending?.mpesa_payment_status==='FAILED'?'Retry M-Pesa STK Push':checkingId?'Waiting for payment…':`Send ${formatKes(amountDueNow)} M-Pesa prompt`} <ArrowRight size={16}/></button><small className="cw-billing-hint">A secure M-Pesa prompt will appear on your phone. Review the amount before entering your PIN.</small></div></div></section></>}
    {pending?.request_type==='PLAN_PURCHASE'&&!selected&&<div className="cw-note-box"><Clock3 size={17}/><span>The selected plan is being processed. Refresh this page if the plan options do not appear.</span></div>}
    <section className="cw-panel cw-table-panel cw-billing-history"><div className="cw-panel-head"><div><h2>Payment reports</h2><p>Separate onboarding and subscription payments with their M-Pesa receipt references.</p></div><button className="cw-secondary" disabled={!payments.length} onClick={downloadReport}><Download size={15}/> Download CSV</button></div><div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>DATE</th><th>PLAN</th><th>BRANCHES</th><th>PAYMENT TYPE</th><th>AMOUNT PAID</th><th>METHOD</th><th>REFERENCE</th></tr></thead><tbody>{payments.map((payment)=><tr key={payment.id}><td>{new Date(payment.paid_at).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'})}</td><td>{plans.find((item)=>item.id===payment.plan_id)?.name||'Subscription'}</td><td>{payment.branch_count||1}</td><td>{payment.payment_stage==='ONBOARDING'?'Onboarding':payment.payment_stage==='SUBSCRIPTION'?'Subscription':'Legacy payment'}</td><td>{formatKes(payment.amount_kes)}</td><td>{payment.method}</td><td>{payment.external_reference||'—'}</td></tr>)}</tbody></table>{!payments.length&&<EmptyPanel title="No confirmed subscription payments yet" text="Your M-Pesa receipts and payment reports will appear here after confirmation."/>}</div></section>
  </>;
}

function AuditPage({rows}){return <><PageHeading title="Audit & security" subtitle="Recent operational events and sensitive account activity."/><div className="cw-security-banner"><ShieldCheck size={23}/><span><b>Tenant isolation is enforced</b><small>Business records are scoped to the signed in workspace.</small></span><StatusPill status="ACTIVE"/></div><div className="cw-panel cw-table-panel"><div className="cw-table-wrap"><table className="cw-table"><thead><tr><th>EVENT</th><th>DETAIL</th><th>TIME</th><th>RESULT</th></tr></thead><tbody>{rows.map((row)=><tr key={row.id}><td><b>{row.action}</b></td><td>{row.detail}</td><td>{row.time}</td><td><span className="cw-pay-state paid"><CheckCircle2 size={13}/> Recorded</span></td></tr>)}</tbody></table></div></div></>}

function SettingsPage({db,user,role,onSave,theme,onThemeChange,onChangeProfilePhoto,onCopyPortalLink,onInstallApp,appPreferences,onPreferenceChange,onSaveProfile,onNavigate}){
  const [name,setName]=useState(user?.name||'');
  const [phone,setPhone]=useState(user?.phone||'');
  const [profileBranch,setProfileBranch]=useState(user?.branch||db.settings.branch||'Main branch');
  const [businessName,setBusinessName]=useState(db.settings.businessName);
  const [branch,setBranch]=useState(db.settings.branch);
  const [rate,setRate]=useState(String(db.settings.loyaltyRate));
  const [accountEmail,setAccountEmail]=useState(user?.email||'');
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [accountBusy,setAccountBusy]=useState(false);
  const [profileBusy,setProfileBusy]=useState(false);
  const [photoBusy,setPhotoBusy]=useState(false);
  const [profilePhoto,setProfilePhoto]=useState(user?.profilePhoto||'');
  const [accountMessage,setAccountMessage]=useState('');
  const [accountError,setAccountError]=useState('');
  const [profileMessage,setProfileMessage]=useState('');
  const [profileError,setProfileError]=useState('');
  const isBusinessAdmin=role==='Business Admin';
  const isReceptionist=role==='Receptionist';
  const isWasher=role==='Washer';
  const photoInput=useRef(null);
  async function saveProfile(event){
    event.preventDefault();setProfileMessage('');setProfileError('');setProfileBusy(true);
    try{await onSaveProfile({name,phone,branch:profileBranch});setProfileMessage('Profile saved.');}
    catch(error){setProfileError(userFacingErrorMessage(error,'Could not save your profile. Check the details and try again.'));}
    finally{setProfileBusy(false);}
  }
  async function updatePhoto(file){
    if(!file)return;
    if(!file.type.startsWith('image/')){setProfileError('Choose an image file.');return;}
    if(file.size>8*1024*1024){setProfileError('Choose an image smaller than 8 MB.');return;}
    setPhotoBusy(true);setProfileError('');
    try{
      const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('This image could not be opened.'));img.src=String(reader.result);};reader.onerror=()=>reject(new Error('This image could not be read.'));reader.readAsDataURL(file);});
      const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');
      const scale=Math.max(256/image.width,256/image.height),width=image.width*scale,height=image.height*scale;ctx.drawImage(image,(256-width)/2,(256-height)/2,width,height);
      const photo=canvas.toDataURL('image/jpeg',.78);await onChangeProfilePhoto(photo);setProfilePhoto(photo);
    }catch(error){setProfileError(userFacingErrorMessage(error,'Could not update your profile picture.'));}
    finally{setPhotoBusy(false);if(photoInput.current)photoInput.current.value='';}
  }
  async function removePhoto(){setPhotoBusy(true);setProfileError('');try{await onChangeProfilePhoto('');setProfilePhoto('');}catch(error){setProfileError(userFacingErrorMessage(error,'Could not remove your profile picture.'));}finally{setPhotoBusy(false);}}
  async function updateAccount(event){
    event.preventDefault();setAccountMessage('');setAccountError('');
    const emailChanged=accountEmail.trim().toLowerCase()!==(user?.email||'').toLowerCase();
    if(!emailChanged&&!newPassword){setAccountError('Enter a new email address or password first.');return;}
    if(newPassword&&newPassword.length<8){setAccountError('Use a password with at least 8 characters.');return;}
    if(newPassword!==confirmPassword){setAccountError('The new passwords do not match.');return;}
    const updates={};if(emailChanged)updates.email=accountEmail.trim();if(newPassword)updates.password=newPassword;
    setAccountBusy(true);
    const {error}=await supabaseBrowser.auth.updateUser(updates);
    setAccountBusy(false);
    if(error){setAccountError(userFacingErrorMessage(error,'Could not update your account. Try again.'));return;}
    setNewPassword('');setConfirmPassword('');
    setAccountMessage(emailChanged?'Check your new email address for a confirmation link. The change takes effect after you confirm it.':'Your password has been changed.');
  }
  const initials=(name||user?.email||'OH').trim().split(/\s+/).map((part)=>part[0]).slice(0,2).join('').toUpperCase();
  return <>
    <PageHeading title="Settings" subtitle="Your profile, preferences and account access."/>
    <div className="cw-settings-page">
      <header className="cw-settings-profile-card">
        <div className="cw-settings-identity"><div className="cw-settings-avatar">{profilePhoto?<img src={profilePhoto} alt="Profile"/>:initials}</div><strong>{name||user?.name}</strong><span>{role}</span></div>
        <div className="cw-settings-photo-actions"><input ref={photoInput} type="file" accept="image/*" hidden onChange={(event)=>updatePhoto(event.target.files?.[0])}/><button type="button" className="cw-secondary" disabled={photoBusy} onClick={()=>photoInput.current?.click()}><Camera size={16}/>{photoBusy?'Saving…':'Add profile picture'}</button>{profilePhoto&&<button type="button" className="cw-danger-outline" disabled={photoBusy} onClick={removePhoto}><Trash2 size={16}/>Delete profile picture</button>}</div>
      </header>
      {profileError&&<p className="cw-account-feedback error" role="alert">{profileError}</p>}
      <SettingsGroup title="Appearance">
        <SettingsRow icon={Sparkles} label="Theme"><div className="cw-choice-row"><button type="button" className={theme==='light'?'selected':''} aria-pressed={theme==='light'} onClick={()=>onThemeChange('light')}><Sun size={15}/> Light</button><button type="button" className={theme==='dark'?'selected':''} aria-pressed={theme==='dark'} onClick={()=>onThemeChange('dark')}><Moon size={15}/> Dark</button></div></SettingsRow>
        <SettingsRow icon={Settings} label="App layout"><div className="cw-choice-row"><button type="button" className={!appPreferences.compactView?'selected':''} aria-pressed={!appPreferences.compactView} onClick={()=>onPreferenceChange({compactView:false})}>App view</button><button type="button" className={appPreferences.compactView?'selected':''} aria-pressed={appPreferences.compactView} onClick={()=>onPreferenceChange({compactView:true})}>Compact</button></div></SettingsRow>
        <SettingsRow icon={Download} label="Install app"><button type="button" className="cw-settings-row-action" onClick={onInstallApp}>Install app <ChevronRight size={17}/></button></SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Profile">
        <form onSubmit={saveProfile} className="cw-settings-rows-form">
          <SettingsRow icon={UserRound} label="Name"><input autoComplete="name" required minLength="2" maxLength="120" value={name} onChange={(event)=>setName(event.target.value)}/></SettingsRow>
          <SettingsRow icon={UserRound} label="Role"><input value={role} readOnly/></SettingsRow>
          <SettingsRow icon={UserRound} label="Phone"><input type="tel" autoComplete="tel" value={phone} onChange={(event)=>setPhone(event.target.value)} placeholder="Add your phone number"/></SettingsRow>
          <SettingsRow icon={Store} label="Branch"><input required minLength="2" maxLength="120" value={profileBranch} onChange={(event)=>setProfileBranch(event.target.value)}/></SettingsRow>
          {profileMessage&&<p className="cw-account-feedback success" role="status">{profileMessage}</p>}
          <div className="cw-settings-save"><button type="submit" className="cw-primary" disabled={profileBusy}>{profileBusy?'Saving…':'Save'}</button></div>
        </form>
      </SettingsGroup>
      {isBusinessAdmin&&<SettingsGroup title="Business profile">
        <SettingsRow icon={Store} label="Business name"><input value={businessName} onChange={(event)=>setBusinessName(event.target.value)}/></SettingsRow>
        <SettingsRow icon={Store} label="Primary branch"><input value={branch} onChange={(event)=>setBranch(event.target.value)}/></SettingsRow>
        <SettingsRow icon={BadgeCheck} label="Loyalty earn rate"><input type="number" min="0" value={rate} onChange={(event)=>setRate(event.target.value)}/></SettingsRow>
        <div className="cw-settings-save"><button className="cw-primary" onClick={()=>onSave({businessName,branch,loyaltyRate:Math.max(0,K(rate))})}>Save business settings</button></div>
      </SettingsGroup>}
      <SettingsGroup title="Notifications">
        {(isBusinessAdmin||isReceptionist)&&<PreferenceToggle label="Payment alerts" detail="Unpaid orders, receipts and payment updates." checked={appPreferences.paymentAlerts} onChange={(value)=>onPreferenceChange({paymentAlerts:value})}/>}
        {isBusinessAdmin&&<PreferenceToggle label="Overdue alerts" detail="Subscription and workspace access reminders." checked={appPreferences.overdueAlerts} onChange={(value)=>onPreferenceChange({overdueAlerts:value})}/>}
        {isWasher&&<PreferenceToggle label="Commission alerts" detail="Commission and payout messages when available." checked={appPreferences.commissionAlerts} onChange={(value)=>onPreferenceChange({commissionAlerts:value})}/>}
      </SettingsGroup>
      <SettingsGroup title="Security">
        <SettingsRow icon={ShieldCheck} label="App access"><span className="cw-setting-value">{isWasher?'Finance team only':isReceptionist?'Front desk':'Business admin'}</span></SettingsRow>
        <SettingsRow icon={ShieldCheck} label="OTP sign-in"><span className="cw-setting-value">Managed by account security</span></SettingsRow>
        <SettingsRow icon={Clock3} label="Session timeout"><select value={appPreferences.sessionTimeout} onChange={(event)=>onPreferenceChange({sessionTimeout:Number(event.target.value)})}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option></select></SettingsRow>
        <SettingsRow icon={ShieldCheck} label="Device lock"><span className="cw-setting-value">Use your device screen lock</span></SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Account">
        {user?.authUserId?<form onSubmit={updateAccount} className="cw-settings-account-form"><label className="cw-form-label">ACCOUNT EMAIL<input type="email" autoComplete="email" required value={accountEmail} onChange={(event)=>setAccountEmail(event.target.value)}/><small>Email changes require confirmation.</small></label><label className="cw-form-label">NEW PASSWORD<input type="password" autoComplete="new-password" minLength="8" value={newPassword} onChange={(event)=>setNewPassword(event.target.value)} placeholder="Leave blank to keep current password"/></label><label className="cw-form-label">CONFIRM NEW PASSWORD<input type="password" autoComplete="new-password" minLength="8" value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)} placeholder="Enter the password again"/></label>{accountError&&<p className="cw-account-feedback error" role="alert">{accountError}</p>}{accountMessage&&<p className="cw-account-feedback success" role="status">{accountMessage}</p>}<button className="cw-primary" disabled={accountBusy}>{accountBusy?'Updating…':'Change password'}</button></form>:<p className="cw-settings-help">Password changes are available for signed-in workspace accounts.</p>}
      </SettingsGroup>
      <SettingsGroup title="Help">
        <SettingsRow icon={Store} label="Business"><span className="cw-setting-value">{db.settings.businessName}</span></SettingsRow>
        <SettingsRow icon={Store} label="Branch"><span className="cw-setting-value">{profileBranch}</span></SettingsRow>
        <SettingsRow icon={History} label="Audit trail"><button type="button" className="cw-settings-row-action" onClick={()=>onNavigate('audit')}>View activity <ChevronRight size={17}/></button></SettingsRow>
        <SettingsRow icon={UserRound} label="Contact support"><a className="cw-settings-row-action" href="/#faq" target="_blank" rel="noreferrer">Help center <ChevronRight size={17}/></a></SettingsRow>
        {(isWasher||isReceptionist)&&<SettingsRow icon={Copy} label="Workspace app link"><button type="button" className="cw-settings-row-action" onClick={onCopyPortalLink}>Copy {role.toLowerCase()} link <ChevronRight size={17}/></button></SettingsRow>}
      </SettingsGroup>
    </div>
  </>;
}

function SettingsGroup({title,children}){return <section className="cw-settings-group"><h2>{title}</h2><div className="cw-settings-card">{children}</div></section>}
function SettingsRow({icon:Icon,label,children}){return <div className="cw-settings-row-shot"><span className="cw-settings-row-icon"><Icon size={19}/></span><b>{label}</b><div className="cw-settings-row-control">{children}</div></div>}

function PreferenceToggle({label,detail,checked,onChange}){return <label className="cw-preference-toggle"><span><b>{label}</b><small>{detail}</small></span><span className="cw-toggle-control"><small>{checked?'On':'Off'}</small><input type="checkbox" checked={checked} onChange={(event)=>onChange(event.target.checked)}/></span></label>}

function ProfilePage({user,tenant,onLogout}){return <><PageHeading title="My profile" subtitle="Your account and workspace access."/><div className="cw-profile-card"><div className="cw-profile-avatar">{user.name.split(' ').map((part)=>part[0]).slice(0,2).join('')}</div><h2>{user.name}</h2><span>{user.role}</span><div className="cw-profile-detail"><small>EMAIL</small><b>{user.email}</b></div><div className="cw-profile-detail"><small>WORKSPACE</small><b>{tenant?.name||'Platform owner'}</b></div><button className="cw-secondary" onClick={onLogout}><LogOut size={16}/> Sign out</button></div></>}

function PageHeading({title,subtitle,action}){return <div className="cw-page-heading compact"><div><h1>{title}</h1><p>{subtitle}</p></div>{action&&<div className="cw-heading-actions">{action}</div>}</div>}
function MetricCard({label,value,note,icon:Icon}){return <div className="cw-metric"><div className="cw-metric-top"><span>{label}</span><i className="tone-green"><Icon size={18}/></i></div><strong>{value}</strong><small>{note}</small></div>}
function EmptyPanel({title,text}){return <div className="cw-empty-panel"><Sparkles size={23}/><b>{title}</b><span>{text}</span></div>}
function SalesChart({payments=[]}){const today=new Date(),weekday=(today.getDay()+6)%7,start=new Date(today.getFullYear(),today.getMonth(),today.getDate()-weekday),data=Array.from({length:7},(_,index)=>({day:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][index],total:0}));for(const payment of payments){if(payment.status!=='PAID'||!payment.recordedAt)continue;const date=new Date(payment.recordedAt);if(Number.isNaN(date.getTime()))continue;const index=Math.floor((new Date(date.getFullYear(),date.getMonth(),date.getDate())-start)/86400000);if(index>=0&&index<7)data[index].total+=K(payment.amount);}const max=Math.max(30000,Math.ceil(Math.max(...data.map((item)=>item.total))/30000)*30000),ticks=[max,max*2/3,max/3,0];return <div className="cw-chart"><div className="cw-chart-y">{ticks.map((value,index)=><span key={index}>{value===0?'0':`${Math.round(value/1000)}k`}</span>)}</div><div className="cw-chart-body"><div className="cw-chart-grid"><i/><i/><i/><i/></div><div className="cw-bars">{data.map((item,index)=><div className="cw-bar-col" key={item.day}><div className={`cw-bar ${index===weekday?'highlight':''}`} style={{height:`${item.total/max*100}%`}} title={`${item.day}: KES ${item.total.toLocaleString('en-KE')}`}><i/></div><small>{item.day}</small></div>)}</div></div></div>}

function FormModal({type,initialData,db,tenantId,onClose,onSubmit}){const [form,setForm]=useState({serviceIds:db.services.filter((item)=>item.tenant_id===tenantId&&item.active).slice(0,1).map((item)=>item.id),paymentStatus:'PAID',method:'Cash',role:'Washer',plan:'Starter',days:'30',endsAt:'2026-10-24',...(type==='customer-edit'?{id:initialData?.id,name:initialData?.name||'',phone:initialData?.phone||'',email:initialData?.email||'',vehicles:(initialData?.vehicles||[]).map((vehicle)=>({...vehicle}))}:type==='service-edit'?{id:initialData?.id,name:initialData?.name||'',category:initialData?.category||'',price:initialData?.price||0,commission:initialData?.commission||0,duration:initialData?.duration||30}:type==='staff-edit'?{id:initialData?.id,name:initialData?.name||'',branch:initialData?.branch||'Main branch'}:{})});const [saving,setSaving]=useState(false);const [inviteUrl,setInviteUrl]=useState('');const [inviteCopied,setInviteCopied]=useState(false);const set=(key,value)=>setForm((current)=>({...current,[key]:value}));function field(key,label,placeholder='',kind='text',required=true){return <label className="cw-form-label">{label}<input required={required} type={kind} placeholder={placeholder} value={form[key]??''} onChange={(event)=>set(key,event.target.value)}/></label>;}
  const title={order:'Check in a vehicle',customer:'Add a customer','customer-edit':'Update customer','service-edit':'Update service','staff-edit':'Update staff member',service:'Add a service',staff:'Invite a team member',tenant:'Add business',plan:'Create subscription plan'}[type]||'Add record';
  async function submit(event){event.preventDefault();setSaving(true);try{const result=await onSubmit(form);if(type==='staff'&&result?.inviteUrl){setInviteUrl(result.inviteUrl);setInviteCopied(false);}}finally{setSaving(false);}}
  async function copyInvite(){try{await navigator.clipboard.writeText(inviteUrl);setInviteCopied(true);}catch{const input=document.querySelector('.cw-generated-invite input');input?.focus();input?.select();document.execCommand('copy');setInviteCopied(true);}}
  async function shareInvite(){if(!navigator.share){await copyInvite();return;}try{await navigator.share({title:`OshaHub ${form.role} invitation`,text:`Join ${form.role==='Washer'?'the wash team':'the reception team'} on OshaHub. This invitation expires in 72 hours.`,url:inviteUrl});}catch(error){if(error?.name!=='AbortError')await copyInvite();}}
  return <div className="cw-modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><form className="cw-modal" onSubmit={submit}><div className="cw-modal-head"><div><span className="cw-overline">{type==='order'?'FRONT DESK':type==='tenant'?'PLATFORM CONTROL':'WORKSPACE'}</span><h2>{title}</h2><p>{type==='order'?'Customer, vehicle, service, payment and washer assignment.':'Enter the details to add this record.'}</p></div><button type="button" className="cw-icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div><div className="cw-modal-fields">
    {type==='order'&&<><div className="cw-form-section">CUSTOMER DETAILS</div>{field('customer','Customer name','e.g. Grace Wanjiku')}{field('phone','Phone number','01XX XXX XXX / 07XX XXX XXX','tel')}{field('email','Email (optional)','name@email.com','email',false)}<div className="cw-form-section">VEHICLE</div>{field('registration','Registration','KDA 123A')}{field('make','Make','Toyota')}{field('model','Model','Axio')}<div className="cw-two-fields">{field('color','Color','Silver','text',false)}<p className="cw-form-help cw-auto-assignment-note">A washer will be assigned automatically based on active workload.</p></div><div className="cw-form-section">SERVICE & PAYMENT</div><label className="cw-form-label">SERVICE<select required multiple value={form.serviceIds} onChange={(event)=>set('serviceIds',Array.from(event.target.selectedOptions).map((option)=>option.value))} size="3">{db.services.filter((item)=>item.tenant_id===tenantId&&item.active).map((item)=><option value={item.id} key={item.id}>{item.name} — {formatKes(item.price)}</option>)}</select><small>Use Ctrl / Command to select more than one service.</small></label><div className="cw-two-fields"><label className="cw-form-label">PAYMENT STATUS<select value={form.paymentStatus} onChange={(e)=>set('paymentStatus',e.target.value)}><option value="PAID">Paid at reception</option><option value="UNPAID">Pay at collection</option></select></label><label className="cw-form-label">METHOD<select value={form.method} onChange={(e)=>set('method',e.target.value)}><option>Cash</option><option>M-Pesa</option><option>Card</option><option>Wallet</option></select></label></div></>}
    {(type==='customer'||type==='customer-edit')&&<>{field('name','Full name','Customer name')}{field('phone','Phone number','01XX XXX XXX / 07XX XXX XXX','tel')}{field('email','Email (optional)','name@email.com','email',false)}{type==='customer-edit'&&<><div className="cw-form-section">VEHICLES</div>{form.vehicles.map((vehicle,index)=><div className="cw-form-section" key={vehicle.id}>VEHICLE {index+1}<div className="cw-two-fields"><label className="cw-form-label">Registration<input required value={vehicle.registration} onChange={(event)=>set('vehicles',form.vehicles.map((row)=>row.id===vehicle.id?{...row,registration:event.target.value}:row))}/></label><label className="cw-form-label">Make<input required value={vehicle.make} onChange={(event)=>set('vehicles',form.vehicles.map((row)=>row.id===vehicle.id?{...row,make:event.target.value}:row))}/></label></div><div className="cw-two-fields"><label className="cw-form-label">Model<input required value={vehicle.model} onChange={(event)=>set('vehicles',form.vehicles.map((row)=>row.id===vehicle.id?{...row,model:event.target.value}:row))}/></label><label className="cw-form-label">Color<input value={vehicle.color||''} onChange={(event)=>set('vehicles',form.vehicles.map((row)=>row.id===vehicle.id?{...row,color:event.target.value}:row))}/></label></div></div>)}{!form.vehicles.length&&<p className="cw-cell-sub">No vehicles are linked to this customer.</p>}</>}{type==='customer'&&<><div className="cw-form-section">VEHICLE (OPTIONAL)</div>{field('registration','Registration','KDA 123A','text',false)}<div className="cw-two-fields">{field('make','Make','Toyota','text',false)}{field('model','Model','Axio','text',false)}</div></>}</>}
    {(type==='service'||type==='service-edit')&&<>{field('name','Service name','e.g. Engine bay clean')}{field('category','Category','Exterior / Interior') }<div className="cw-two-fields">{field('price','Customer price (KES)','500','number')}{field('commission','Washer commission (KES)','100','number')}</div>{field('duration','Estimated minutes','30','number')}</>}
    {type==='staff-edit'&&<>{field('name','Full name','Team member name')}<label className="cw-form-label">Branch<input required value={form.branch} onChange={(event)=>set('branch',event.target.value)}/></label><p className="cw-form-help">Role and login access are managed separately for account security.</p></>}{type==='staff'&&<><p className="cw-form-help">Choose the team member’s workspace and generate a secure tenant invitation link. It expires after 72 hours.</p>{db.billing?.currentPlan?.feature_flags?.receptionists!=null&&db.billing?.currentPlan?.feature_flags?.washers!=null&&<p className="cw-form-help">Plan allowance: {db.billing.currentPlan.feature_flags.receptionists} receptionist and {db.billing.currentPlan.feature_flags.washers} washers.</p>}{field('phone','Team member phone number','01XX XXX XXX / 07XX XXX XXX','tel')}<label className="cw-form-label">TEAM WORKSPACE<select value={form.role} onChange={(event)=>set('role',event.target.value)}><option value="Washer">Washer app</option><option value="Receptionist">Receptionist app</option></select></label>{inviteUrl&&<div className="cw-generated-invite"><label className="cw-form-label">SECURE INVITATION LINK<input readOnly value={inviteUrl} onFocus={(event)=>event.target.select()}/></label><p>This opens the selected staff web app for the business that created the invitation.</p><div><button type="button" className="cw-secondary" onClick={copyInvite}><Copy size={15}/>{inviteCopied?'Copied':'Copy link'}</button><button type="button" className="cw-primary" onClick={shareInvite}><Share2 size={15}/>Share link</button></div></div>}</>}
    {type==='tenant'&&<>{field('name','Business name','Car wash name')}{field('owner','Business owner','Owner name')}<label className="cw-form-label">PLAN<select value={form.plan} onChange={(e)=>set('plan',e.target.value)}><option>Starter</option><option>Growth</option><option>Enterprise</option></select></label>{field('endsAt','Subscription ends','2026-10-24','date')}</>}
    {type==='plan'&&<>{field('name','Plan name','Growth')}{field('price','Price per period (KES)','7900','number')}{field('days','Subscription length in days','30','number')}{field('features','Included features','Branches, users, reports')}</>}
  </div><div className="cw-modal-actions"><button type="button" className="cw-secondary" onClick={onClose}>{inviteUrl?'Done':'Cancel'}</button><button className="cw-primary" disabled={saving||Boolean(inviteUrl)}>{saving?<span className="cw-spinner"/>:<><Check size={16}/>{type==='staff'?'Generate invite link':type==='order'?'Create wash order':type==='customer-edit'?'Update customer':type==='service-edit'?'Update service':type==='staff-edit'?'Update staff member':'Save record'}</>}</button></div></form></div>;
}

