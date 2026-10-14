import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowDownToLine, Banknote, Bell, Building2, Camera, Check, BadgeCheck, ChevronRight, CircleAlert, Clock3, CreditCard, Download, LayoutDashboard, LoaderCircle, LogOut, Menu, MoreHorizontal, Moon, RotateCcw, Search, Settings, ShieldCheck, Smartphone, Sun, Trash2, UserRound, X } from 'lucide-react';
import { supabaseBrowser, supabaseConfigMessage, supabaseErrorMessage, userFacingErrorMessage } from '../services/supabaseBrowser.js';
import SearchableTables from '../components/SearchableTables.jsx';

const EMPTY_DATA = { tenants: [], requests: [], plans: [], subscriptions: [], subscriptionPayments: [], billingRequests: [], deletedRecords: [], billingSchemaReady: true };

export default function SuperAdminApp() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [section, setSection] = useState('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [activationTenant, setActivationTenant] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('M-PESA');
  const [paymentReference, setPaymentReference] = useState('');
  const [data, setData] = useState(EMPTY_DATA);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [search, setSearch] = useState('');
  const [selectedRequests, setSelectedRequests] = useState([]);
  const [deletingRequests, setDeletingRequests] = useState(false);
  const [selectedPlanIds, setSelectedPlanIds] = useState([]);
  const [deletingPlans, setDeletingPlans] = useState(false);
  const [selectedActivationTenantIds, setSelectedActivationTenantIds] = useState([]);
  const [selectedTenantIds, setSelectedTenantIds] = useState([]);
  const [planSelections, setPlanSelections] = useState({});
  const [adminName, setAdminName] = useState('');
  const [grantingTrial, setGrantingTrial] = useState('');
  const [theme,setTheme]=useState(()=>window.localStorage.getItem('osha-cw-theme')==='dark'?'dark':'light');
  const [compactView,setCompactView]=useState(false);
  const [profilePhoto,setProfilePhoto]=useState('');
  const [photoBusy,setPhotoBusy]=useState(false);
  const [sessionTimeout,setSessionTimeout]=useState(30);
  const [platformAlerts,setPlatformAlerts]=useState(true);
  const [accountEmail,setAccountEmail]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [accountMessage,setAccountMessage]=useState('');
  const [installPrompt,setInstallPrompt]=useState(null);

  useEffect(() => { setAdminName(session?.membership.full_name || ''); }, [session?.membership.full_name]);
  useEffect(()=>{
    if(!session?.user)return;
    setProfilePhoto(session.user.user_metadata?.oshaHubAvatar||'');
    setAccountEmail(session.user.email||'');
    try{const prefs=JSON.parse(window.localStorage.getItem(`osha-cw-preferences:${session.user.id}`)||'{}');setCompactView(Boolean(prefs.compactView));setSessionTimeout([15,30,60].includes(Number(prefs.sessionTimeout))?Number(prefs.sessionTimeout):30);setPlatformAlerts(prefs.paymentAlerts!==false);}catch{setCompactView(false);setSessionTimeout(30);setPlatformAlerts(true);}
    const savedTheme=session.user.user_metadata?.oshaHubTheme;
    if(['light','dark'].includes(savedTheme))setTheme(savedTheme);
  },[session?.user?.id]);
  useEffect(()=>{window.localStorage.setItem('osha-cw-theme',theme);},[theme]);
  useEffect(()=>{const capture=(event)=>{event.preventDefault();setInstallPrompt(event);};window.addEventListener('beforeinstallprompt',capture);return()=>window.removeEventListener('beforeinstallprompt',capture);},[]);
  useEffect(()=>{
    if(!session)return undefined;
    let timer;
    const reset=()=>{window.clearTimeout(timer);timer=window.setTimeout(()=>{void signOut();},sessionTimeout*60*1000);};
    const events=['pointerdown','keydown','touchstart','mousemove'];events.forEach((name)=>window.addEventListener(name,reset,{passive:true}));reset();
    return()=>{window.clearTimeout(timer);events.forEach((name)=>window.removeEventListener(name,reset));};
  },[session?.user?.id,sessionTimeout]);

  useEffect(() => {
    if (!supabaseBrowser) { setAuthLoading(false); return undefined; }
    let active = true;
    let restoreTimedOut = false;
    const restoreTimeout = window.setTimeout(() => {
      restoreTimedOut = true;
      setError(supabaseErrorMessage(new TypeError('Failed to fetch'), 'Unable to restore your administrator session.'));
      setAuthLoading(false);
    }, 12_000);
    supabaseBrowser.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (!active || restoreTimedOut) return;
      if (sessionError) { setError(supabaseErrorMessage(sessionError, 'Unable to restore your administrator session.')); return; }
      const user = data.session?.user;
      if (!user) return;
      const { data: memberships, error: membershipError } = await supabaseBrowser.from('carwash_memberships')
        .select('id,role,tenant_id,full_name,status').eq('user_id', user.id).eq('role', 'SUPER_ADMIN').eq('status', 'ACTIVE').is('tenant_id', null).limit(1);
      if (!active || restoreTimedOut) return;
      if (membershipError) setError(supabaseErrorMessage(membershipError, 'Unable to restore your administrator session.'));
      else if (memberships?.[0]) setSession({ user, membership: memberships[0] });
      else setError('This signed-in account does not have an active Super Admin membership.');
    }).catch((sessionError) => {
      if (active && !restoreTimedOut) setError(supabaseErrorMessage(sessionError, 'Unable to restore your administrator session.'));
    }).finally(() => {
      window.clearTimeout(restoreTimeout);
      if (active && !restoreTimedOut) setAuthLoading(false);
    });
    return () => { active = false; window.clearTimeout(restoreTimeout); };
  }, []);

  const loadData = useCallback(async ({ quiet = false } = {}) => {
    if (!supabaseBrowser) return;
    if (!quiet) setBusy(true);
    setError('');
    const [tenants, requests, initialPlans, subscriptions, subscriptionPayments, billingRequests, deletedRecords] = await Promise.all([
      supabaseBrowser.from('carwash_tenants').select('id,name,owner_name,status,created_at').order('created_at', { ascending: false }),
      supabaseBrowser.from('carwash_access_requests').select('id,tenant_name,owner_name,phone,status,created_at,payment_reviewed_at,payment_reviewed_by').order('created_at', { ascending: false }),
      supabaseBrowser.from('carwash_plans').select('id,name,price_kes,duration_days,feature_flags,active').is('deleted_at', null).order('price_kes'),
      supabaseBrowser.from('carwash_subscriptions').select('*').order('starts_at', { ascending: false }),
      supabaseBrowser.from('carwash_subscription_payments').select('*').order('paid_at', { ascending: false }),
      supabaseBrowser.from('carwash_billing_requests').select('*').order('created_at', { ascending: false }),
      supabaseBrowser.rpc('carwash_list_deleted_admin_records')
    ]);
    // Keep the dashboard readable if production is still on the pre-soft-delete schema.
    // The deleted_at column is introduced by migration 20261019000100.
    let plans = initialPlans;
    if (plans.error && /deleted_at/i.test(plans.error.message || '')
      && (plans.error.code === '42703' || plans.error.code === 'PGRST204' || /schema cache|column .* does not exist/i.test(plans.error.message || ''))) {
      plans = await supabaseBrowser.from('carwash_plans')
        .select('id,name,price_kes,duration_days,feature_flags,active').order('price_kes');
    }
    const failed = [tenants, requests, plans, subscriptions].find((result) => result.error);
    if (failed) {
      console.error('Super Admin business data load failed', { code: failed.error.code, message: failed.error.message });
      setError('Could not load the business data. Refresh and try again.');
      await supabaseBrowser.auth.signOut();
      setSession(null);
    } else {
      const billingSchemaReady=!subscriptionPayments.error;
      const subscriptionRows = subscriptions.data || [];
      const tenantRows = (tenants.data || []).map((tenant) => {
        const current = subscriptionRows.find((row) => row.tenant_id === tenant.id);
        const expired = Boolean(current && ['TRIAL', 'ACTIVE', 'EXPIRING SOON', 'EXPIRED'].includes(current.status) && current.ends_at
          && new Date(current.ends_at).getTime() <= Date.now()
          && (!current.grace_until || new Date(current.grace_until).getTime() <= Date.now()));
        return expired && ['TRIAL', 'ACTIVE', 'EXPIRING SOON'].includes(tenant.status)
          ? { ...tenant, status: 'EXPIRED' }
          : tenant;
      });
      setData({ tenants: tenantRows, requests: requests.data || [], plans: plans.data || [], subscriptions: subscriptionRows, subscriptionPayments: subscriptionPayments.data || [], billingRequests: billingRequests.error ? [] : billingRequests.data || [], deletedRecords: deletedRecords.error ? [] : deletedRecords.data || [], billingSchemaReady });
      if(!billingSchemaReady)setError('Confirmed payment totals are temporarily unavailable. Contact support if the problem continues.');
    }
    if (!quiet) setBusy(false);
  }, []);

  useEffect(() => {
    if (session) loadData();
  }, [session, loadData]);
  useEffect(() => {
    if (!session) return undefined;
    const timer=window.setInterval(loadData,45000);
    return () => window.clearInterval(timer);
  }, [session, loadData]);

  async function signIn(event) {
    event.preventDefault();
    if (!supabaseBrowser) return;
    setBusy(true); setError('');
    try {
      const { data: result, error: authError } = await supabaseBrowser.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) { setError(supabaseErrorMessage(authError, 'Sign-in failed. Please try again.')); return; }
      const { data: memberships, error: membershipError } = await supabaseBrowser.from('carwash_memberships')
        .select('id,role,tenant_id,full_name,status').eq('user_id', result.user.id).eq('role', 'SUPER_ADMIN').eq('status', 'ACTIVE').is('tenant_id', null).limit(1);
      const membership = memberships?.[0];
      if (membershipError || !membership) {
        setError(membershipError ? userFacingErrorMessage(membershipError,'Could not verify administrator access. Try signing in again.') : 'This account does not have an active Super Admin membership.');
        return;
      }
      setSession({ user: result.user, membership });
      setPassword('');
    } catch (signInError) {
      setError(supabaseErrorMessage(signInError, 'Unable to sign in. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabaseBrowser?.auth.signOut();
    setSession(null); setData(EMPTY_DATA); setSection('overview');
  }

  async function reviewRequest(id, approve) {
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: reviewError } = await supabaseBrowser.rpc('carwash_review_business_request', { p_request: id, p_approve: approve });
      if (reviewError) setError(userFacingErrorMessage(reviewError,'Could not review this request. Refresh and try again.'));
      else { setNotice(approve ? 'Business approved and account activation was sent to its in-app inbox.' : 'Business request declined and the applicant was notified in-app.'); await loadData(); }
    } catch (reviewError) { setError(userFacingErrorMessage(reviewError,'Could not review this request. Refresh and try again.')); }
    finally { setBusy(false); }
  }

  async function deleteRequests(ids) {
    const requestIds = [...new Set(ids)];
    if (!requestIds.length || !window.confirm(`Move ${requestIds.length} selected request record${requestIds.length === 1 ? '' : 's'} to Recently deleted? You can restore them later; approved business accounts remain active.`)) return;
    setDeletingRequests(true); setError(''); setNotice('');
    try {
      const { data: deleted, error: deleteError } = await supabaseBrowser.rpc('carwash_delete_business_requests', { p_request_ids: requestIds }).abortSignal(AbortSignal.timeout(15000));
      if (deleteError) setError(deleteError.code === 'PGRST202' ? 'This action is temporarily unavailable. Contact support if the problem continues.' : userFacingErrorMessage(deleteError,'Could not delete the selected requests. Refresh and try again.'));
      else if (!Number.isInteger(deleted) || deleted !== requestIds.length) { setError('Some requests could not be deleted. Refresh the list and try again.'); void loadData({ quiet: true }); }
      else { setSelectedRequests([]); setData((old)=>({...old,requests:old.requests.filter((request)=>!requestIds.includes(request.id))})); setNotice(`${deleted} request${deleted === 1 ? '' : 's'} moved to Recently deleted. Approved business accounts remain active.`); void loadData({ quiet: true }).catch((refreshError)=>setError(userFacingErrorMessage(refreshError,'Requests were moved, but the list could not refresh.'))); }
    } catch (deleteError) { setError(deleteError.name === 'TimeoutError' || deleteError.name === 'AbortError' ? 'The deletion took too long. Check your connection and refresh the request list before trying again.' : userFacingErrorMessage(deleteError,'Could not delete these requests.')); }
    finally { setDeletingRequests(false); }
  }

  async function activatePlan(tenant) {
    const planId = planSelections[tenant.id];
    if (!planId) { setError('Choose a plan before activating it.'); return; }
    const plan = data.plans.find((item) => item.id === planId);
    if (!data.billingSchemaReady) { setError('Payment confirmation is temporarily unavailable. Contact support if the problem continues.'); return; }
    const branchCount=data.subscriptions.find((subscription)=>subscription.tenant_id===tenant.id)?.branch_count||data.subscriptionPayments.find((payment)=>payment.tenant_id===tenant.id)?.branch_count||1;
    const branchLimit=Number(plan?.feature_flags?.branches??1);
    if(branchLimit!==-1&&branchCount>branchLimit){setError(`${plan.name} supports ${branchLimit} branch${branchLimit===1?'':'es'}. Choose a plan that covers all ${branchCount} branches.`);return;}
    const onboardingFee=data.subscriptionPayments.some((payment)=>payment.tenant_id===tenant.id)?0:8500*branchCount;
    setActivationTenant({ ...tenant, selectedPlan: { ...plan, branchCount, onboardingFee, totalDue: Number(plan.price_kes)+onboardingFee } });
  }

  async function reviewBillingRequest(request, approve) {
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: reviewError } = await supabaseBrowser.rpc('carwash_review_billing_request', { p_request_id: request.id, p_approve: approve });
      if (reviewError) setError(userFacingErrorMessage(reviewError,'Could not review this payment. Refresh and try again.'));
      else { setNotice(approve ? 'Billing request approved. The business was notified.' : 'Billing request declined. The business was notified.'); await loadData(); }
    } catch (reviewError) { setError(userFacingErrorMessage(reviewError,'Could not review this payment. Refresh and try again.')); }
    finally { setBusy(false); }
  }

  async function confirmPlanActivation(event) {
    event.preventDefault();
    const tenant=activationTenant;
    if(!tenant)return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: activationError } = await supabaseBrowser.rpc('carwash_activate_tenant_plan', { target_tenant: tenant.id, target_plan: tenant.selectedPlan.id, payment_method: paymentMethod, payment_reference: paymentReference.trim()||null,p_branch_count:tenant.selectedPlan.branchCount||1 });
      if (activationError) setError(userFacingErrorMessage(activationError,'Could not activate this plan. Check the selection and try again.'));
      else { setNotice(`${tenant.selectedPlan.name} activated for ${tenant.name}; KES ${money(tenant.selectedPlan.totalDue)} recorded, including the KES ${money(tenant.selectedPlan.onboardingFee)} onboarding fee. The business team was notified.`); setActivationTenant(null); setPaymentReference(''); await loadData(); }
    } catch (activationError) { setError(userFacingErrorMessage(activationError,'Could not activate this plan. Check the selection and try again.')); }
    finally { setBusy(false); }
  }

  async function saveAdminName(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const { data: membership, error: nameError } = await supabaseBrowser.rpc('carwash_update_platform_admin_name', { p_full_name: adminName });
      if (nameError) setError(userFacingErrorMessage(nameError,'Could not save your Super Admin name. Check it and try again.'));
      else { setSession((old) => ({ ...old, membership })); setNotice('Super Admin profile name updated.'); }
    } catch (nameError) { setError(userFacingErrorMessage(nameError,'Could not save your Super Admin name. Try again.')); }
    finally { setBusy(false); }
  }

  async function saveAdminTheme(nextTheme) {
    setTheme(nextTheme);
    if(!session?.user?.id)return;
    const {data,error:themeError}=await supabaseBrowser.auth.updateUser({data:{oshaHubTheme:nextTheme}});
    if(themeError)setError(userFacingErrorMessage(themeError,'Theme saved on this device, but could not sync to your account.'));
    else if(data?.user)setSession((old)=>old?{...old,user:data.user}:old);
  }

  function saveCompactView(nextValue) {
    setCompactView(nextValue);
    try {
      const key=`osha-cw-preferences:${session.user.id}`;
      const current=JSON.parse(window.localStorage.getItem(key)||'{}');
      window.localStorage.setItem(key,JSON.stringify({...current,compactView:nextValue}));
    } catch { setError('Could not save the app layout on this device.'); }
  }

  function savePlatformAlerts(nextValue) {
    setPlatformAlerts(nextValue);
    try{const key=`osha-cw-preferences:${session.user.id}`;const current=JSON.parse(window.localStorage.getItem(key)||'{}');window.localStorage.setItem(key,JSON.stringify({...current,paymentAlerts:nextValue}));}
    catch{setError('Could not save the notification preference on this device.');}
  }

  function saveSessionTimeout(nextValue) {
    setSessionTimeout(nextValue);
    try{const key=`osha-cw-preferences:${session.user.id}`;const current=JSON.parse(window.localStorage.getItem(key)||'{}');window.localStorage.setItem(key,JSON.stringify({...current,sessionTimeout:nextValue}));}
    catch{setError('Could not save the session timeout on this device.');}
  }

  async function installPlatformApp() {
    if(!installPrompt){setNotice('In your browser menu, choose Install app or Add to Home Screen.');return;}
    try{await installPrompt.prompt();const result=await installPrompt.userChoice;setNotice(result?.outcome==='accepted'?'OshaHub was installed on this device.':'You can install OshaHub any time from the browser menu.');}
    catch{setError('The browser could not start the install prompt.');}
    finally{setInstallPrompt(null);}
  }

  async function updateAccount(event) {
    event.preventDefault();setError('');setNotice('');setAccountMessage('');
    const emailChanged=accountEmail.trim().toLowerCase()!==(session.user.email||'').toLowerCase();
    if(!emailChanged&&!newPassword){setError('Enter a new email address or password first.');return;}
    if(newPassword&&newPassword.length<8){setError('Use a password with at least 8 characters.');return;}
    if(newPassword!==confirmPassword){setError('The new passwords do not match.');return;}
    setBusy(true);
    try{const updates={};if(emailChanged)updates.email=accountEmail.trim();if(newPassword)updates.password=newPassword;const {data,error:accountError}=await supabaseBrowser.auth.updateUser(updates);if(accountError)throw accountError;if(data?.user)setSession((old)=>old?{...old,user:data.user}:old);setNewPassword('');setConfirmPassword('');setAccountMessage(emailChanged?'Check your new email address for a confirmation link.':'Your password has been changed.');}
    catch(accountError){setError(userFacingErrorMessage(accountError,'Could not update your account. Try again.'));}
    finally{setBusy(false);}
  }

  async function saveAdminPhoto(file) {
    if(!file)return;
    if(!file.type.startsWith('image/')||file.size>8*1024*1024){setError('Choose an image file smaller than 8 MB.');return;}
    setPhotoBusy(true);setError('');
    const previousPhoto=profilePhoto;
    try {
      const photo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('This image could not be read.'));reader.onload=()=>{const image=new Image();image.onerror=()=>reject(new Error('This image could not be opened.'));image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const scale=Math.max(256/image.width,256/image.height);canvas.getContext('2d').drawImage(image,(256-image.width*scale)/2,(256-image.height*scale)/2,image.width*scale,image.height*scale);resolve(canvas.toDataURL('image/jpeg',.78));};image.src=String(reader.result);};reader.readAsDataURL(file);});
      setProfilePhoto(photo);
      const {data,error:photoError}=await supabaseBrowser.auth.updateUser({data:{oshaHubAvatar:photo}});
      if(photoError)throw photoError;
      if(data?.user)setSession((old)=>old?{...old,user:data.user}:old);
    } catch(photoError) {setProfilePhoto(previousPhoto);setError(userFacingErrorMessage(photoError,'Could not save your profile picture.'));}
    finally {setPhotoBusy(false);}
  }

  async function deleteAdminPhoto() {
    setPhotoBusy(true);setError('');
    const {data,error:photoError}=await supabaseBrowser.auth.updateUser({data:{oshaHubAvatar:null}});
    if(photoError)setError(userFacingErrorMessage(photoError,'Could not remove your profile picture.'));
    else {if(data?.user)setSession((old)=>old?{...old,user:data.user}:old);setProfilePhoto('');}
    setPhotoBusy(false);
  }

  async function changeTenantStatus(tenant, status) {
    if (status === 'TRIAL') {
      await grantTenantTrial(tenant);
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: updateError } = await supabaseBrowser.rpc('carwash_update_platform_tenant',{target_tenant:tenant.id,p_name:tenant.name,p_owner_name:tenant.owner_name,p_status:status});
      if (updateError) setError(userFacingErrorMessage(updateError,'Could not update this business. Try again.'));
      else { setNotice(`${tenant.name} updated to ${status}.`); await loadData(); }
    } catch (updateError) { setError(userFacingErrorMessage(updateError,'Could not update this business. Try again.')); }
    finally { setBusy(false); }
  }

  async function grantTenantTrial(tenant) {
    if (!window.confirm(`Grant ${tenant.name} a new 7-day trial starting now?`)) return;
    setGrantingTrial(tenant.id); setBusy(true); setError(''); setNotice('');
    try {
      const { error: grantError } = await supabaseBrowser.rpc('carwash_grant_tenant_trial', { target_tenant: tenant.id });
      if (grantError) throw grantError;
      setNotice(`A new 7-day trial was granted to ${tenant.name}.`);
      await loadData();
    } catch (grantError) {
      setError(userFacingErrorMessage(grantError, 'Could not grant a new trial. Refresh and try again.'));
    } finally { setGrantingTrial(''); setBusy(false); }
  }

  async function restoreDeletedRecord(record) {
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: restoreError } = await supabaseBrowser.rpc('carwash_restore_admin_record', { p_entity_type: record.entity_type, p_record_id: record.entity_id });
      if (restoreError) throw restoreError;
      setNotice(`${record.label} restored.`);
      await loadData();
    } catch (restoreError) {
      setError(userFacingErrorMessage(restoreError, 'Could not restore this record. Refresh and try again.'));
    } finally { setBusy(false); }
  }

  async function updateTenantDetails(tenant, fields) {
    const name=fields.name.trim(),owner_name=fields.owner_name.trim();
    if(name.length<2||name.length>120||owner_name.length<2||owner_name.length>120){setError('Business and owner names must be 2 to 120 characters.');return false;}
    setBusy(true);setError('');setNotice('');
    try {
      const {error:updateError}=await supabaseBrowser.rpc('carwash_update_platform_tenant',{target_tenant:tenant.id,p_name:name,p_owner_name:owner_name,p_status:tenant.status});
      if(updateError){setError(userFacingErrorMessage(updateError,'Could not save these business details. Check them and try again.'));return false;}
      setNotice(`${name} details updated.`);await loadData();return true;
    } catch(updateError) { setError(userFacingErrorMessage(updateError,'Could not save these business details. Try again.'));return false; }
    finally { setBusy(false); }
  }

  async function updatePlan(plan, fields) {
    const name=fields.name.trim(),price_kes=Number(fields.price_kes),duration_days=Number(fields.duration_days);
    const branches=Number(fields.branches),staff=Number(fields.staff),description=fields.description.trim();
    if(name.length<2||!Number.isFinite(price_kes)||price_kes<0||!Number.isInteger(duration_days)||duration_days<1||!Number.isInteger(branches)||branches===0||!Number.isInteger(staff)||staff===0){setError('Enter a valid plan name, price, duration and capacity. Use -1 for unlimited capacity.');return false;}
    setBusy(true);setError('');setNotice('');
    try {
      const {error:updateError}=await supabaseBrowser.rpc('carwash_update_platform_plan',{target_plan:plan.id,p_name:name,p_price_kes:price_kes,p_duration_days:duration_days,p_feature_flags:{...plan.feature_flags,branches,staff,description}});
      if(updateError){setError(userFacingErrorMessage(updateError,'Could not update this plan. Try again.'));return false;}
      setNotice(`${name} plan updated.`);await loadData();return true;
    } catch(updateError) { setError(userFacingErrorMessage(updateError,'Could not update this plan. Try again.'));return false; }
    finally { setBusy(false); }
  }

  async function deleteSelectedPlans(ids) {
    const selected=[...new Set(ids)];
    if(!selected.length)return;
    const protectedPlans=selected.filter((id)=>data.subscriptions.some((row)=>row.plan_id===id)||data.subscriptionPayments.some((row)=>row.plan_id===id)||data.billingRequests.some((row)=>row.plan_id===id));
    const deletable=selected.filter((id)=>!protectedPlans.includes(id));
    if(!deletable.length){setError('These plans are linked to subscriptions, payment history or billing requests, so they must stay for records.');return;}
    if(!window.confirm(`Move ${deletable.length} unused plan${deletable.length===1?'':'s'} to Recently deleted? You can restore them later. Plans with billing history will be kept.`))return;
    setDeletingPlans(true);setError('');setNotice('');
    try{const {data:deleted,error:deleteError}=await supabaseBrowser.rpc('carwash_delete_unused_plans',{p_plan_ids:deletable}).abortSignal(AbortSignal.timeout(15000));if(deleteError)throw deleteError;if(!Number.isInteger(deleted)||deleted!==deletable.length)throw new Error('Some selected plans are in use or no longer available. Refresh the list; plans with billing history are kept.');setSelectedPlanIds([]);setNotice(`${deleted} unused plan${deleted===1?'':'s'} moved to Recently deleted.${protectedPlans.length?` ${protectedPlans.length} linked plan${protectedPlans.length===1?' was':'s were'} kept.`:''}`);await loadData();}
    catch(deleteError){setError(deleteError.code==='PGRST202'?'This action is temporarily unavailable. Contact support if the problem continues.':userFacingErrorMessage(deleteError,'Could not delete unused plans.'))}
    finally{setDeletingPlans(false);}
  }

  function openTenantPlan(tenant, planId) {
    setPlanSelections((old) => ({ ...old, [tenant.id]: planId || old[tenant.id] || '' }));
    setSection('activation');
  }

  function handleOutsidePointerDown(event) {
    if (event.target.closest?.('.pa-sidebar, .pa-sidebar-toggle, .pa-mobile-open')) return;
    if (window.matchMedia('(max-width: 680px)').matches) setMenuOpen(false);
    else setSidebarCollapsed(true);
  }

  if (authLoading) return <AdminAuthLoading/>;
  if (!session) return <AdminSignIn email={email} setEmail={setEmail} password={password} setPassword={setPassword} onSubmit={signIn} busy={busy} error={error} />;

  const pending = data.requests.filter((request) => request.status === 'PENDING');
  const requestHistory = data.requests.filter((request) => request.status !== 'APPROVED' || request.payment_reviewed_at);
  const filteredTenants = data.tenants.filter((tenant) => `${tenant.name} ${tenant.owner_name}`.toLowerCase().includes(search.toLowerCase()));
  const billingRows=data.tenants.map((tenant)=>{const subscription=data.subscriptions.find((row)=>row.tenant_id===tenant.id);const payment=subscription&&data.subscriptionPayments.find((row)=>row.subscription_id===subscription.id);const plan=data.plans.find((row)=>row.id===(subscription?.plan_id||payment?.plan_id));const current=subscription&&new Date(subscription.ends_at)>=new Date()&&['ACTIVE','TRIAL','EXPIRING SOON'].includes(subscription.status);return {tenant,subscription,payment,plan,isPaid:Boolean(payment&&current)};});
  const unpaidBillingRows=billingRows.filter((row)=>!row.isPaid);
  const paidBillingRows=billingRows.filter((row)=>row.isPaid);
  const collected=data.subscriptionPayments.reduce((sum,row)=>sum+Number(row.amount_kes||0),0);
  const pendingBillingRequests=data.billingRequests.filter((request)=>request.status==='PENDING');
  const platformNotices=platformAlerts?[...pending.map((request)=>({id:`request-${request.id}`,title:'Business request awaiting review',detail:`${request.tenant_name} · ${request.owner_name}`,section:'requests'})),...pendingBillingRequests.map((request)=>({id:`billing-${request.id}`,title:request.request_type==='TRIAL_EXTENSION'?'Free trial extension requested':'Plan payment needs verification',detail:`${data.tenants.find((tenant)=>tenant.id===request.tenant_id)?.name||'Business'} · ${request.payment_reference||'7-day extension'}`,section:'plans'})),...unpaidBillingRows.map((row)=>({id:`unpaid-${row.tenant.id}`,title:'Plan payment not recorded',detail:`${row.tenant.name} · ${row.subscription?date(row.subscription.ends_at):'No subscription'}`,section:'plans'})),...paidBillingRows.map((row)=>({id:`paid-${row.payment.id}`,title:'Plan payment confirmed',detail:`${row.tenant.name} · ${row.plan?.name||'Plan'} · KES ${money(row.payment.amount_kes)}`,section:'plans'}))]:[];

  return <div className={`pa-shell ${sidebarCollapsed?'is-collapsed':''} ${menuOpen?'menu-open':''} ${theme==='dark'?'theme-dark':''} ${compactView?'compact-view':''}`} onPointerDownCapture={handleOutsidePointerDown}>
    <SearchableTables />
    <aside className="pa-sidebar">
      <div className="pa-sidebar-head"><a className="pa-brand" href="/"><img src="/osha-hub-logo.svg" alt="OshaHub"/><span>PLATFORM CONTROL</span></a><button className="pa-sidebar-toggle" onClick={()=>{if(window.matchMedia('(max-width: 680px)').matches)setMenuOpen(false);else setSidebarCollapsed((collapsed)=>!collapsed);}} aria-label={menuOpen?'Close side menu':sidebarCollapsed?'Expand side menu':'Collapse side menu'} aria-expanded={window.matchMedia('(max-width: 680px)').matches?menuOpen:!sidebarCollapsed}>{menuOpen?<X size={19}/>:<Menu size={19}/>}</button></div>
      <div className="pa-nav-label">ADMINISTRATION</div>
      <nav onClick={() => setMenuOpen(false)}>
        {[["overview", "Overview", LayoutDashboard], ["requests", "Business requests", ArrowDownToLine], ["recent-businesses", "Recent businesses", Clock3], ["businesses", "Businesses", Building2], ["plans", "Plans & billing", CreditCard], ["activation", "Activate a business plan", BadgeCheck], ["reconciliation", "Reconciliation", Activity]].map(([key, label, Icon]) => <button key={key} className={section === key ? 'active' : ''} onClick={() => setSection(key)}><Icon size={18}/><span>{label}</span>{key === 'requests' && pending.length > 0 && <i>{pending.length}</i>}</button>)}
        <button className={section === 'settings' ? 'active' : ''} onClick={() => setSection('settings')}><Settings size={18}/><span>Settings</span></button>
      </nav>
      <div className="pa-side-bottom"><div className="pa-secure"><ShieldCheck size={17}/><span><b>Platform owner</b><small>Full platform access</small></span></div><button className="pa-signout" onClick={signOut}><LogOut size={17}/> Sign out</button></div>
    </aside>
    {menuOpen&&<button className="pa-scrim" onClick={()=>setMenuOpen(false)} aria-label="Close navigation"/>}
    <main className="pa-main">
      <header className="pa-topbar">{!menuOpen&&<button className="pa-mobile-open" onClick={()=>setMenuOpen(true)} aria-label="Open navigation menu"><MoreHorizontal size={21}/></button>}<div className="pa-crumb"><span>OSHAHUB / PLATFORM</span><ChevronRight size={14}/><b>{sectionLabel(section)}</b></div><div className="pa-top-actions"><div className="pa-notification-wrap"><button className="pa-bell" onClick={()=>setNotificationsOpen((open)=>!open)} aria-label="Notifications"><Bell size={18}/>{platformNotices.length>0&&<i>{platformNotices.length>99?'99+':platformNotices.length}</i>}</button>{notificationsOpen&&<div className="pa-notification-panel"><b>Platform notifications</b>{platformNotices.slice(0,30).map((item)=><button key={item.id} onClick={()=>{setSection(item.section);setNotificationsOpen(false);}}><strong>{item.title}</strong><span>{item.detail}</span></button>)}{!platformNotices.length&&<p>{platformAlerts?'All businesses are paid and requests are up to date.':'Platform alerts are turned off in Settings.'}</p>}</div>}</div><div className="pa-user"><span className="pa-avatar">{profilePhoto?<img src={profilePhoto} alt=""/>:initials(session.membership.full_name)}</span><span><b>{session.membership.full_name}</b><small>SUPER ADMIN</small></span></div></div></header>
      <section className="pa-content">
        {notice && <div className="pa-alert success"><Check size={17}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={16}/></button></div>}
        {error && <div className="pa-alert error"><CircleAlert size={17}/>{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={16}/></button></div>}
        {busy && <div className="pa-loading"><LoaderCircle size={15}/> Syncing platform data…</div>}
        {section === 'overview' && <>
          <PageTitle eyebrow="PLATFORM OVERVIEW" title={`Welcome, ${session.membership.full_name.split(' ')[0]}.`} description="Review business access and monitor the OshaHub network."/>
          {pending.length > 0 && <section className="pa-approval-callout"><div><span>BUSINESS APPROVALS</span><strong>{pending.length} registration{pending.length===1?'':'s'} waiting</strong><p>Review new business accounts and approve access.</p></div><button type="button" onClick={()=>setSection('requests')}>Review requests <ChevronRight size={16}/></button></section>}
          <div className="pa-metrics"><Metric label="Collected" value={`KES ${money(collected)}`} icon={Banknote}/><Metric label="Unpaid businesses" value={unpaidBillingRows.length} icon={Clock3} highlight/><Metric label="M-Pesa payments" value={data.subscriptionPayments.filter((row)=>row.method==='M-PESA').length} icon={Smartphone}/><Metric label="Pending requests" value={pending.length+pendingBillingRequests.length} icon={ArrowDownToLine}/></div>
          <PlatformActivityChart tenants={data.tenants} payments={data.subscriptionPayments}/>
        </>}
        {section === 'requests' && <><PageTitle eyebrow="ACCESS REVIEW" title="Business requests" description="Registration requests awaiting review and history for businesses whose payments have been reviewed."/><div className="pa-bulk-actions"><span>{selectedRequests.length} selected{deletingRequests?' · Deleting…':''}</span><button disabled={busy || deletingRequests || (!requestHistory.length&&!selectedRequests.length)} onClick={() => selectedRequests.length ? setSelectedRequests([]) : setSelectedRequests(requestHistory.slice(0,250).map((request) => request.id))}>{selectedRequests.length?'Deselect all':'Select up to 250'}</button><button disabled={!selectedRequests.length || deletingRequests} onClick={() => setSelectedRequests([])}>Clear selection</button><button className="danger" disabled={busy || deletingRequests || !requestHistory.some((request) => request.status === 'REJECTED')} onClick={() => deleteRequests(requestHistory.filter((request) => request.status === 'REJECTED').slice(0,250).map((request) => request.id))}>Clear rejected</button><button className="danger" disabled={busy || deletingRequests || !selectedRequests.length} onClick={() => deleteRequests(selectedRequests)}><Trash2 size={14}/> {deletingRequests?'Deleting…':'Delete selected'}</button></div><section className="pa-panel"><RequestTable requests={requestHistory} onReview={reviewRequest} busy={busy || deletingRequests} selectedIds={selectedRequests} onToggle={(id) => setSelectedRequests((old) => old.includes(id) ? old.filter((item) => item !== id) : [...old, id])} selectable/></section></>}
        {section === 'businesses' && <><PageTitle eyebrow="TENANT DIRECTORY" title="Businesses" description="Manage tenant access and monitor account status."/><div className="pa-search"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search business or owner"/></div><section className="pa-panel"><TenantTable tenants={filteredTenants} onStatus={changeTenantStatus} onUpdate={updateTenantDetails} onGrantTrial={grantTenantTrial} grantingTrial={grantingTrial} selectedIds={selectedTenantIds} onToggle={(id)=>setSelectedTenantIds((old)=>old.includes(id)?old.filter((item)=>item!==id):old.length<100?[...old,id]:old)} onSelectAll={(ids)=>setSelectedTenantIds((old)=>[...new Set([...old,...ids])].slice(0,100))} onClear={()=>setSelectedTenantIds([])} busy={busy}/></section></>}
        {section === 'recent-businesses' && <><PageTitle eyebrow="NEW ACCOUNTS" title="Recent businesses" description="The latest businesses registered on the OshaHub platform."/><section className="pa-panel"><TenantTable tenants={[...data.tenants].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,10)} onStatus={changeTenantStatus} onUpdate={updateTenantDetails} onGrantTrial={grantTenantTrial} grantingTrial={grantingTrial} selectedIds={selectedTenantIds} onToggle={(id)=>setSelectedTenantIds((old)=>old.includes(id)?old.filter((item)=>item!==id):old.length<100?[...old,id]:old)} onSelectAll={(ids)=>setSelectedTenantIds((old)=>[...new Set([...old,...ids])].slice(0,100))} onClear={()=>setSelectedTenantIds([])} busy={busy}/></section></>}
        {section === 'activation' && <><PageTitle eyebrow="SUBSCRIPTION CONTROL" title="Activate a business plan" description="Review a business subscription and confirm its recorded payment before activating access."/><section className="pa-panel"><div className="pa-panel-head"><div><h2>Business plan activation</h2><p>Choose the plan for each business. Payment confirmation is recorded before access changes.</p></div></div><TenantPlanTable tenants={data.tenants} plans={data.plans.filter((plan) => plan.active)} subscriptions={data.subscriptions} payments={data.subscriptionPayments} selections={planSelections} onSelect={(tenantId,planId) => setPlanSelections((old) => ({ ...old, [tenantId]: planId }))} onActivate={activatePlan} busy={busy} selectedIds={selectedActivationTenantIds} onToggle={(id)=>setSelectedActivationTenantIds((old)=>old.includes(id)?old.filter((item)=>item!==id):old.length<100?[...old,id]:old)} onSelectAll={(ids)=>setSelectedActivationTenantIds(ids.slice(0,100))} onClear={()=>setSelectedActivationTenantIds([])}/><div className="pa-plan-foot">Each confirmation records the plan amount and payment method, activates the tenant plan and notifies the business team.</div></section></>}
        {section === 'reconciliation' && <><PageTitle eyebrow="PAYMENT OPERATIONS" title="Reconciliation" description="Compare confirmed payments with the current subscription status for each business."/><BillingDashboard rows={billingRows} tenants={data.tenants} plans={data.plans} paidRows={paidBillingRows} unpaidRows={unpaidBillingRows} payments={data.subscriptionPayments} collected={collected} ready={data.billingSchemaReady} onViewPlans={()=>setSection('plans')} onUpdateTenant={openTenantPlan}/></>}
        {section === 'plans' && <><PageTitle eyebrow="SUBSCRIPTIONS" title="Plans & billing" description="Review customer payment requests, subscription terms and payment history."/><section className="pa-panel"><div className="pa-panel-head"><div><h2>Customer billing requests</h2><p>Verify receipts and review one-time trial extensions.</p></div><span className="pa-status pending">{pendingBillingRequests.length} pending</span></div><BillingRequestsTable requests={pendingBillingRequests} tenants={data.tenants} plans={data.plans} onReview={reviewBillingRequest} busy={busy}/></section><section className="pa-panel"><h2>Recent confirmed payments</h2><PlatformPaymentsTable payments={data.subscriptionPayments} tenants={data.tenants} plans={data.plans} onUpdateTenant={openTenantPlan}/></section><section className="pa-panel"><h2>Available plans</h2><PlanTable plans={data.plans} onUpdate={updatePlan} busy={busy} selectedIds={selectedPlanIds} onToggle={(id)=>setSelectedPlanIds((old)=>old.includes(id)?old.filter((item)=>item!==id):old.length<100?[...old,id]:old)} onSelectAll={(ids)=>setSelectedPlanIds(ids.slice(0,100))} onClear={()=>setSelectedPlanIds([])} onDelete={()=>deleteSelectedPlans(selectedPlanIds)} deleting={deletingPlans}/></section></>}
        {section === 'settings' && <>
          <PageTitle eyebrow="PLATFORM PROFILE" title="Settings" description="Your profile, preferences and account access."/>
          <div className="pa-settings-page">
            <header className="pa-settings-profile-card"><div className="pa-settings-identity"><div className="pa-settings-avatar">{profilePhoto?<img src={profilePhoto} alt="Profile"/>:initials(adminName)}</div><strong>{adminName||session.user.email}</strong></div><div className="pa-settings-photo-actions"><label className="pa-activate"><Camera size={16}/>{photoBusy?'Saving…':'Add profile picture'}<input type="file" accept="image/*" disabled={photoBusy} onChange={(event)=>saveAdminPhoto(event.target.files?.[0])}/></label>{profilePhoto&&<button type="button" className="pa-danger-outline" disabled={photoBusy} onClick={deleteAdminPhoto}><Trash2 size={16}/>Delete profile picture</button>}</div></header>
            <AdminSettingsGroup title="Appearance"><AdminSettingsRow icon={Sun} label="Theme"><div className="pa-settings-choice"><button type="button" className={theme==='light'?'selected':''} onClick={()=>saveAdminTheme('light')}><Sun size={15}/>Light</button><button type="button" className={theme==='dark'?'selected':''} onClick={()=>saveAdminTheme('dark')}><Moon size={15}/>Dark</button></div></AdminSettingsRow><AdminSettingsRow icon={Settings} label="App layout"><div className="pa-settings-choice"><button type="button" className={!compactView?'selected':''} onClick={()=>saveCompactView(false)}>App view</button><button type="button" className={compactView?'selected':''} onClick={()=>saveCompactView(true)}>Compact</button></div></AdminSettingsRow><AdminSettingsRow icon={Download} label="Install app"><button type="button" className="pa-settings-action" onClick={installPlatformApp}>Install app <ChevronRight size={17}/></button></AdminSettingsRow></AdminSettingsGroup>
            <AdminSettingsGroup title="Profile"><form onSubmit={saveAdminName} className="pa-settings-profile-form"><AdminSettingsRow icon={UserRound} label="Name"><input required minLength="2" maxLength="120" value={adminName} onChange={(event)=>setAdminName(event.target.value)}/></AdminSettingsRow><AdminSettingsRow icon={ShieldCheck} label="Role"><input value="Super Admin" readOnly/></AdminSettingsRow><AdminSettingsRow icon={Smartphone} label="Phone"><input value={session.user.phone||''} readOnly placeholder="Not set"/></AdminSettingsRow><AdminSettingsRow icon={Building2} label="Branch"><input value="Platform-wide" readOnly/></AdminSettingsRow><div className="pa-settings-save"><button className="pa-primary" disabled={busy}>{busy?'Saving…':'Save'}</button></div></form></AdminSettingsGroup>
            <AdminSettingsGroup title="Notifications"><AdminSettingsRow icon={Bell} label="Platform alerts"><label className="pa-settings-switch"><span>{platformAlerts?'On':'Off'}</span><input type="checkbox" checked={platformAlerts} onChange={(event)=>savePlatformAlerts(event.target.checked)}/></label></AdminSettingsRow></AdminSettingsGroup>
            <AdminSettingsGroup title="Security"><AdminSettingsRow icon={ShieldCheck} label="App access"><span className="pa-settings-value">Platform owner account</span></AdminSettingsRow><AdminSettingsRow icon={ShieldCheck} label="OTP sign-in"><span className="pa-settings-value">Managed by account security</span></AdminSettingsRow><AdminSettingsRow icon={Clock3} label="Session timeout"><select value={sessionTimeout} onChange={(event)=>saveSessionTimeout(Number(event.target.value))}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option></select></AdminSettingsRow><AdminSettingsRow icon={Smartphone} label="Device lock"><span className="pa-settings-value">Use your device screen lock</span></AdminSettingsRow></AdminSettingsGroup>
            <AdminSettingsGroup title="Account"><form onSubmit={updateAccount} className="pa-settings-account-form"><AdminSettingsRow icon={UserRound} label="Sign-in email"><input type="email" autoComplete="email" required value={accountEmail} onChange={(event)=>setAccountEmail(event.target.value)}/></AdminSettingsRow><AdminSettingsRow icon={ShieldCheck} label="New password"><input type="password" autoComplete="new-password" minLength="8" value={newPassword} onChange={(event)=>setNewPassword(event.target.value)} placeholder="Leave blank to keep current password"/></AdminSettingsRow><AdminSettingsRow icon={ShieldCheck} label="Confirm password"><input type="password" autoComplete="new-password" minLength="8" value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)} placeholder="Enter the new password again"/></AdminSettingsRow>{accountMessage&&<p className="pa-settings-message">{accountMessage}</p>}<div className="pa-settings-save"><button className="pa-primary" disabled={busy}>{busy?'Updating…':'Change password'}</button></div></form></AdminSettingsGroup>
            <AdminSettingsGroup title="Help"><AdminSettingsRow icon={Building2} label="Membership"><span className="pa-settings-value">{session.membership.status} · platform-wide</span></AdminSettingsRow><AdminSettingsRow icon={Activity} label="Contact support"><a className="pa-settings-action" href="/#faq" target="_blank" rel="noreferrer">Help center <ChevronRight size={17}/></a></AdminSettingsRow></AdminSettingsGroup>
          </div>
        </>}
        {section === 'requests' && <DeletedRecordsPanel records={data.deletedRecords.filter((record) => record.entity_type === 'ACCESS_REQUEST')} onRestore={restoreDeletedRecord} busy={busy}/>}
        {section === 'plans' && <DeletedRecordsPanel records={data.deletedRecords.filter((record) => record.entity_type === 'PLAN')} onRestore={restoreDeletedRecord} busy={busy}/>}
      </section>
    </main>
        {activationTenant&&<div className="pa-drawer-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)setActivationTenant(null);}}><aside className="pa-drawer"><header><div><span>PAYMENT CONFIRMATION</span><h2>{activationTenant.tenant_name||activationTenant.name}</h2><p>{activationTenant.owner_name}</p></div><button className="pa-drawer-close" type="button" onClick={()=>setActivationTenant(null)} aria-label="Close"><X size={18}/></button></header><form onSubmit={confirmPlanActivation}><div className="pa-drawer-plan"><small>PLAN TO ACTIVATE</small><strong>{activationTenant.selectedPlan?.name}</strong><span>Plan KES {money(activationTenant.selectedPlan?.price_kes)} · {activationTenant.selectedPlan?.duration_days} days</span><label>Business branches<input type="number" min="1" max="100" value={activationTenant.selectedPlan?.branchCount||1} onChange={(event)=>setActivationTenant((old)=>{const count=Math.max(1,Math.min(100,Number(event.target.value)||1));const onboardingFee=data.subscriptionPayments.some((payment)=>payment.tenant_id===old.id)?0:8500*count;return {...old,selectedPlan:{...old.selectedPlan,branchCount:count,onboardingFee,totalDue:Number(old.selectedPlan.price_kes)+onboardingFee}}})}/></label><span>One-time onboarding · KES 8,500 per branch: KES {money(activationTenant.selectedPlan?.onboardingFee)}</span><strong>Total due KES {money(activationTenant.selectedPlan?.totalDue)}</strong></div><label>Payment method<select value={paymentMethod} onChange={(event)=>setPaymentMethod(event.target.value)}><option value="M-PESA">M-Pesa</option><option value="CASH">Cash</option><option value="CARD">Card</option><option value="BANK TRANSFER">Bank transfer</option></select></label><label>Payment reference <span>Optional</span><input value={paymentReference} onChange={(event)=>setPaymentReference(event.target.value)} placeholder="M-Pesa code or receipt number"/></label><p className="pa-drawer-note">Confirm only after the full total has reached OshaHub. The one-time KES 8,500 onboarding fee applies per branch on a business’s first paid plan.</p><button className="pa-primary" disabled={busy}><Check size={16}/>{busy?'Recording payment…':'Confirm payment and activate'}</button></form></aside></div>}
  </div>;
}

function AdminSettingsGroup({title,children}){return <section className="pa-settings-group"><h2>{title}</h2><div className="pa-settings-card">{children}</div></section>}
function AdminSettingsRow({icon:Icon,label,children}){return <div className="pa-settings-row"><span className="pa-settings-row-icon"><Icon size={19}/></span><b>{label}</b><div className="pa-settings-row-control">{children}</div></div>}
function AdminAuthLoading() { return <main className="pa-auth-loading" role="status" aria-live="polite"><img src="/osha-hub-logo.svg" alt="OshaHub"/><h1>Restoring your secure session…</h1><p>Connecting to the platform console</p><div><i/></div></main>; }

function AdminSignIn({ email, setEmail, password, setPassword, onSubmit, busy, error }) {
  return <main className="pa-login"><section className="pa-login-brand"><a href="/"><img src="/osha-hub-logo.svg" alt="OshaHub"/></a><span>PLATFORM OWNER CONSOLE</span><h1>One platform.<br/>Every car wash.</h1><p>Review tenant applications, manage platform access and oversee subscriptions from a private administrator workspace.</p><div><ShieldCheck size={16}/> ACCESS RESTRICTED TO PLATFORM ADMINS</div></section><section className="pa-login-form-wrap"><form className="pa-login-form" onSubmit={onSubmit}><span className="pa-kicker">SUPER ADMINISTRATION</span><h2>Super Admin sign in</h2><p>Use the platform owner account assigned to you.</p><label>Email address<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@yourbusiness.com"/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password"/></label><button disabled={busy || !supabaseBrowser}>{busy ? 'Signing in…' : 'Sign in to platform'}</button>{!supabaseBrowser && <div className="pa-feedback error"><CircleAlert size={16}/><span>Sign-in is temporarily unavailable. {supabaseConfigMessage}</span></div>}{error && <div className="pa-feedback error"><CircleAlert size={16}/><span>{error}</span></div>}<small>OshaHub platform administration · Authorized accounts only</small></form></section></main>;
}

function PageTitle({ eyebrow, title, description }) { return <div className="pa-page-title"><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>; }
function Metric({ label, value, icon: Icon, highlight }) { return <article className={`pa-metric ${highlight ? 'highlight' : ''}`}><span>{label}</span><strong>{value}</strong><i><Icon size={19}/></i></article>; }

function PlatformActivityChart({tenants,payments}){
  const [view,setView]=useState('businesses');
  const today=new Date();today.setHours(0,0,0,0);
  const points=Array.from({length:7},(_,index)=>{const dateValue=new Date(today);dateValue.setDate(today.getDate()-6+index);const key=`${dateValue.getFullYear()}-${String(dateValue.getMonth()+1).padStart(2,'0')}-${String(dateValue.getDate()).padStart(2,'0')}`;const registrations=tenants.filter((tenant)=>tenant.created_at&&new Date(tenant.created_at).toDateString()===dateValue.toDateString()).length;const collected=payments.filter((payment)=>payment.paid_at&&new Date(payment.paid_at).toDateString()===dateValue.toDateString()).reduce((sum,payment)=>sum+Number(payment.amount_kes||0),0);return {key,label:dateValue.toLocaleDateString('en-KE',{weekday:'short'}),registrations,collected};});
  const values=points.map((point)=>view==='businesses'?point.registrations:point.collected);const max=Math.max(1,...values);const total=values.reduce((sum,value)=>sum+value,0);const hasActivity=total>0;
  return <section className="pa-panel pa-activity-chart"><div className="pa-panel-head"><div><h2>Platform activity</h2><p>Daily totals for the last seven days.</p></div><div className="pa-chart-switch" role="group" aria-label="Activity chart metric"><button className={view==='businesses'?'active':''} onClick={()=>setView('businesses')}>New businesses</button><button className={view==='collections'?'active':''} onClick={()=>setView('collections')}>Collections</button></div></div><div className="pa-chart-summary"><strong>{view==='businesses'?total:`KES ${money(total)}`}</strong><span>{view==='businesses'?'new businesses':'confirmed collections'} · last 7 days</span></div><div className="pa-chart-plot" role="img" aria-label={`${view==='businesses'?'New business registrations':'Confirmed subscription collections'} over the last seven days`}><div className="pa-chart-grid"><i/><i/><i/><i/></div><div className="pa-chart-columns">{points.map((point,index)=>{const value=values[index];const height=value?Math.max(7,(value/max)*100):0;return <div className="pa-chart-column" key={point.key}><b>{view==='businesses'?value:money(value)}</b><div className="pa-chart-bar-area">{value>0&&<i style={{height:`${height}%`}}/>}</div><small>{point.label}</small></div>;})}</div></div>{!hasActivity&&<p className="pa-chart-empty">No business registrations or confirmed collections in this period.</p>}</section>;
}

function BillingRequestsTable({requests,tenants,plans,onReview,busy}){const [selected,setSelected]=useState([]);return <><SelectionControls rows={requests} selectedIds={selected} onSelectAll={(ids)=>setSelected(ids)} onClear={()=>setSelected([])} disabled={busy} note="Requests must be approved or declined to keep the billing audit trail."/><div className="pa-table-wrap"><table><thead><tr><th aria-label="Select"/><th>BUSINESS</th><th>REQUEST</th><th>PLAN</th><th>BRANCHES</th><th>ONBOARDING</th><th>PAYMENT STATUS</th><th>SUBMITTED</th><th>ACTION</th></tr></thead><tbody>{requests.map((request)=>{const tenant=tenants.find((item)=>item.id===request.tenant_id);const plan=plans.find((item)=>item.id===request.plan_id);const stk=request.request_type==='PLAN_PURCHASE'&&request.payment_method==='M-PESA';return <tr key={request.id}><td><input type="checkbox" aria-label={`Select billing request for ${tenant?.name||'business'}`} checked={selected.includes(request.id)} disabled={busy||(!selected.includes(request.id)&&selected.length>=100)} onChange={()=>setSelected((old)=>old.includes(request.id)?old.filter((id)=>id!==request.id):[...old,request.id])}/></td><td><b>{tenant?.name||'Business'}</b></td><td>{request.request_type==='TRIAL_EXTENSION'?'Extra 7-day free trial':'Paid plan · M-Pesa STK Push'}</td><td>{request.request_type==='TRIAL_EXTENSION'?'—':`${plan?.name||'Plan'} · ${plan?.term||''}`}</td><td>{request.request_type==='PLAN_PURCHASE'?request.branch_count||1:'—'}</td><td>{request.request_type==='PLAN_PURCHASE'?`KES ${money(request.onboarding_fee_kes||0)}`:'—'}</td><td>{stk?`${request.mpesa_payment_status||'NOT_STARTED'} · KES ${money(request.mpesa_expected_amount_kes||request.onboarding_fee_kes)}`:'Trial review'}</td><td>{date(request.created_at)}</td><td><div className="pa-actions">{request.request_type==='TRIAL_EXTENSION'&&<button className="approve" disabled={busy} onClick={()=>onReview(request,true)}>Approve extension</button>}{request.request_type==='TRIAL_EXTENSION'&&<button className="reject" disabled={busy} onClick={()=>onReview(request,false)}>Decline</button>}{stk&&<span className="pa-status pending">{request.mpesa_payment_status==='PAID'?'Confirmed by Safaricom':request.mpesa_payment_status==='FAILED'?'Customer may retry':'Waiting for customer'}</span>}</div></td></tr>;})}{!requests.length&&<tr><td colSpan="9"><EmptyState>No customer billing requests are waiting for review.</EmptyState></td></tr>}</tbody></table></div></>;}

function BillingDashboard({rows,tenants,plans,paidRows,unpaidRows,payments,collected,ready,onViewPlans,onUpdateTenant}){
  return <>
    {!ready&&<div className="pa-alert error"><CircleAlert size={17}/>Confirmed payment totals are temporarily unavailable. Contact support if the problem continues.</div>}
    <div className="pa-metrics pa-billing-metrics"><Metric label="Collected" value={`KES ${money(collected)}`} icon={Banknote}/><Metric label="Unpaid businesses" value={unpaidRows.length} icon={Clock3} highlight/><Metric label="M-Pesa payments" value={payments.filter((row)=>row.method==='M-PESA').length} icon={Smartphone}/><Metric label="Refunds" value="KES 0" icon={ArrowDownToLine}/></div>
    <div className="pa-billing-grid"><section className="pa-panel"><div className="pa-panel-head"><div><h2>Unpaid or overdue</h2><p>Businesses without a confirmed current plan payment.</p></div><button className="pa-text-button" onClick={onViewPlans}>Manage billing <ChevronRight size={15}/></button></div><BillingStatusTable rows={unpaidRows} onUpdateTenant={onUpdateTenant}/></section><section className="pa-panel"><div className="pa-panel-head"><div><h2>Paid businesses</h2><p>Current subscriptions with recorded payment confirmations.</p></div></div><BillingStatusTable rows={paidRows} onUpdateTenant={onUpdateTenant}/></section></div>
    <section className="pa-panel"><div className="pa-panel-head"><div><h2>Recent collections</h2><p>{payments.length} confirmed subscription payments · lifetime</p></div><button className="pa-text-button" onClick={onViewPlans}>View billing <ChevronRight size={15}/></button></div><PlatformPaymentsTable payments={payments.slice(0,5)} tenants={tenants} plans={plans} onUpdateTenant={onUpdateTenant}/></section>
  </>;
}
function BillingStatusTable({rows,onUpdateTenant}){const [selected,setSelected]=useState([]);return <><SelectionControls rows={rows.map((row)=>({id:row.tenant.id}))} selectedIds={selected} onSelectAll={(ids)=>setSelected(ids)} onClear={()=>setSelected([])}/><div className="pa-table-wrap"><table><thead><tr><th aria-label="Select"/><th>BUSINESS</th><th>PLAN</th><th>PAYMENT</th><th>ENDS</th><th>ACTION</th></tr></thead><tbody>{rows.map(({tenant,subscription,payment,plan,isPaid})=><tr key={tenant.id}><td><input type="checkbox" aria-label={`Select ${tenant.name}`} checked={selected.includes(tenant.id)} disabled={!selected.includes(tenant.id)&&selected.length>=100} onChange={()=>setSelected((old)=>old.includes(tenant.id)?old.filter((id)=>id!==tenant.id):[...old,tenant.id])}/></td><td><b>{tenant.name}</b><small className="pa-id">{tenant.owner_name}</small></td><td>{plan?.name||'No plan'}</td><td><StatusPill status={isPaid?'PAID':'UNPAID'}/>{payment&&<small className="pa-id">{payment.method}</small>}</td><td>{subscription?date(subscription.ends_at):'—'}</td><td><button className="pa-activate" onClick={()=>onUpdateTenant(tenant,plan?.id)}>Update plan</button></td></tr>)}{!rows.length&&<tr><td colSpan="6"><EmptyState>No businesses in this group.</EmptyState></td></tr>}</tbody></table></div></>;}
function PlatformPaymentsTable({payments,tenants,plans,onUpdateTenant}){const [selected,setSelected]=useState([]);return <><SelectionControls rows={payments} selectedIds={selected} onSelectAll={(ids)=>setSelected(ids)} onClear={()=>setSelected([])} note="Confirmed payment records are retained for audit."/><div className="pa-table-wrap"><table><thead><tr><th aria-label="Select"/><th>BUSINESS</th><th>PLAN</th><th>PAYMENT TYPE</th><th>AMOUNT PAID</th><th>BRANCHES</th><th>METHOD</th><th>REFERENCE</th><th>PAID</th><th>ACTION</th></tr></thead><tbody>{payments.map((payment)=>{const tenant=tenants.find((item)=>item.id===payment.tenant_id);return <tr key={payment.id}><td><input type="checkbox" aria-label={`Select payment for ${tenant?.name||'business'}`} checked={selected.includes(payment.id)} disabled={!selected.includes(payment.id)&&selected.length>=100} onChange={()=>setSelected((old)=>old.includes(payment.id)?old.filter((id)=>id!==payment.id):[...old,payment.id])}/></td><td><b>{tenant?.name||'Business'}</b></td><td>{plans.find((plan)=>plan.id===payment.plan_id)?.name||'Subscription plan'}</td><td>{payment.payment_stage==='ONBOARDING'?'Onboarding':payment.payment_stage==='SUBSCRIPTION'?'Subscription':'Legacy payment'}</td><td><b>KES {money(payment.amount_kes)}</b></td><td>{payment.branch_count||1}</td><td>{payment.method}</td><td>{payment.external_reference||'—'}</td><td>{date(payment.paid_at)}</td><td><button className="pa-activate" disabled={!tenant||!onUpdateTenant} onClick={()=>tenant&&onUpdateTenant(tenant,payment.plan_id)}>Update plan</button></td></tr>;})}{!payments.length&&<tr><td colSpan="10"><EmptyState>No subscription payments have been confirmed yet.</EmptyState></td></tr>}</tbody></table></div></>;}
function RequestTable({ requests, onReview, busy, selectable = false, selectedIds = [], onToggle }) {
  const orderedRequests=[...requests].sort((a,b)=>Number(b.status==='PENDING')-Number(a.status==='PENDING')||new Date(b.created_at||0)-new Date(a.created_at||0));
  return <div className={`pa-table-wrap ${selectable ? 'pa-requests' : ''}`}>
    <table>
      <thead><tr>{selectable && <th aria-label="Select"/>}<th>BUSINESS</th><th>OWNER</th><th>PHONE</th><th>STATUS</th><th>RECEIVED</th><th>ACTION</th></tr></thead>
      <tbody>{orderedRequests.map((request) => <tr key={request.id}>
        {selectable && <td><input aria-label={`Select ${request.tenant_name}`} type="checkbox" checked={selectedIds.includes(request.id)} disabled={busy||(!selectedIds.includes(request.id)&&selectedIds.length>=250)} onChange={() => onToggle(request.id)}/></td>}
        <td><b>{request.tenant_name}</b></td><td>{request.owner_name}</td><td>{request.phone}</td><td><StatusPill status={request.status}/></td><td>{date(request.created_at)}</td>
        <td>{['PENDING', 'REJECTED'].includes(request.status) ? <div className="pa-actions">
          <button className="approve" disabled={busy} onClick={() => onReview(request.id, true)}>{request.status === 'REJECTED' ? 'Re-approve' : 'Approve'}</button>
          {request.status === 'PENDING' && <button className="reject" disabled={busy} onClick={() => onReview(request.id, false)}>Reject</button>}
        </div> : <span className="pa-muted">Reviewed</span>}</td>
      </tr>)}</tbody>
    </table>
    {requests.length === 0 && <EmptyState>No business requests to review.</EmptyState>}
  </div>;
}
function TenantTable({ tenants, onStatus, onUpdate, onGrantTrial, grantingTrial, selectedIds=[], onToggle, onSelectAll, onClear, busy }) {
  const [editingId,setEditingId]=useState('');const [editName,setEditName]=useState('');const [editOwner,setEditOwner]=useState('');
  function startEdit(tenant){setEditingId(tenant.id);setEditName(tenant.name);setEditOwner(tenant.owner_name);}
  async function saveEdit(tenant){if(await onUpdate(tenant,{name:editName,owner_name:editOwner}))setEditingId('');}
  return <><div className="pa-bulk-actions"><span>{selectedIds.length} selected</span><button disabled={busy||(!tenants.length&&!selectedIds.length)} onClick={()=>selectedIds.length?onClear():onSelectAll(tenants.slice(0,100).map((tenant)=>tenant.id))}>{selectedIds.length?'Deselect all':'Select up to 100'}</button><button disabled={busy||!selectedIds.length} onClick={onClear}>Clear selection</button></div><div className="pa-table-wrap pa-tenant-table"><table><thead><tr><th aria-label="Select"/><th>BUSINESS</th><th>OWNER</th><th>STATUS</th><th>CREATED</th><th>ACCESS</th><th>ACTION</th></tr></thead><tbody>{tenants.map((tenant) => <tr key={tenant.id}><td><input type="checkbox" aria-label={`Select ${tenant.name}`} checked={selectedIds.includes(tenant.id)} disabled={busy||(!selectedIds.includes(tenant.id)&&selectedIds.length>=100)} onChange={()=>onToggle(tenant.id)}/></td><td>{editingId===tenant.id?<input aria-label="Business name" value={editName} onChange={(event)=>setEditName(event.target.value)}/>:<b>{tenant.name}</b>}<small className="pa-id">{tenant.id.slice(0, 8)}</small></td><td>{editingId===tenant.id?<input aria-label="Business owner" value={editOwner} onChange={(event)=>setEditOwner(event.target.value)}/>:tenant.owner_name}</td><td><StatusPill status={tenant.status}/></td><td>{date(tenant.created_at)}</td><td><select aria-label={`Change access for ${tenant.name}`} disabled={busy||grantingTrial===tenant.id} value={tenant.status} onChange={(event) => onStatus(tenant, event.target.value)}><option>TRIAL</option><option>ACTIVE</option><option>EXPIRING SOON</option><option>EXPIRED</option><option>SUSPENDED</option><option>CANCELLED</option></select></td><td><div className="pa-actions">{editingId===tenant.id?<><button type="button" disabled={busy} onClick={()=>saveEdit(tenant)}>Save</button><button type="button" className="pa-cancel" disabled={busy} onClick={()=>setEditingId('')}>Cancel</button></>:<><button className="pa-activate" disabled={busy} onClick={()=>startEdit(tenant)}>Update</button>{tenant.status==='EXPIRED'&&<button className="pa-activate" disabled={busy||grantingTrial===tenant.id} onClick={()=>onGrantTrial(tenant)}>{grantingTrial===tenant.id?'Granting…':'Grant 7-day trial'}</button>}</>}</div></td></tr>)}</tbody></table>{tenants.length === 0 && <EmptyState>No businesses are registered yet.</EmptyState>}</div></>;
}
function DeletedRecordsPanel({records,onRestore,busy}){return <section className="pa-panel"><div className="pa-panel-head"><div><h2>Recently deleted</h2><p>Deleted records are retained and can be restored by a Super Admin.</p></div></div>{records.length?<div className="pa-table-wrap"><table><thead><tr><th>RECORD</th><th>DELETED</th><th>ACTOR</th><th>ACTION</th></tr></thead><tbody>{records.map((record)=><tr key={`${record.entity_type}-${record.entity_id}`}><td><b>{record.label}</b><small className="pa-id">{record.entity_type.replaceAll('_',' ')}</small></td><td>{date(record.deleted_at)}</td><td>{record.deleted_by||'—'}</td><td><button className="pa-activate" disabled={busy} onClick={()=>onRestore(record)}><RotateCcw size={14}/> Restore</button></td></tr>)}</tbody></table></div>:<EmptyState>There are no deleted records to restore.</EmptyState>}</section>;}
function SelectionControls({rows,selectedIds,onSelectAll,onClear,disabled=false,onDelete,deleting=false,note}){return <div className="pa-bulk-actions"><span>{selectedIds.length} selected</span><button disabled={disabled||(!rows.length&&!selectedIds.length)} onClick={()=>selectedIds.length?onClear():onSelectAll(rows.slice(0,100).map((row)=>row.id))}>{selectedIds.length?'Deselect all':'Select up to 100'}</button><button disabled={disabled||!selectedIds.length} onClick={onClear}>Clear selection</button>{onDelete&&<button className="danger" disabled={disabled||deleting||!selectedIds.length} onClick={onDelete}><Trash2 size={13}/>{deleting?'Deleting…':'Delete selected'}</button>}{note&&<small>{note}</small>}</div>;}
function PlanTable({plans,onUpdate,busy,selectedIds,onToggle,onSelectAll,onClear,onDelete,deleting}){
  const [editingId,setEditingId]=useState('');const [form,setForm]=useState({});const set=(key,value)=>setForm((old)=>({...old,[key]:value}));
  function start(plan){setEditingId(plan.id);setForm({name:plan.name,price_kes:plan.price_kes,duration_days:plan.duration_days,branches:plan.feature_flags?.branches??1,staff:plan.feature_flags?.staff??1,description:plan.feature_flags?.description||''});}
  async function save(plan){if(await onUpdate(plan,form))setEditingId('');}
  return <><SelectionControls rows={plans} selectedIds={selectedIds} onSelectAll={onSelectAll} onClear={onClear} disabled={busy} onDelete={onDelete} deleting={deleting} note="Only plans with no subscriptions or billing history can be deleted."/><div className="pa-table-wrap pa-plan-table"><table><thead><tr><th aria-label="Select"/><th>PLAN</th><th>PRICE</th><th>DURATION</th><th>BRANCHES</th><th>STAFF</th><th>FEATURES</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{plans.map((plan)=><tr key={plan.id}><td><input type="checkbox" aria-label={`Select ${plan.name}`} checked={selectedIds.includes(plan.id)} disabled={busy||(!selectedIds.includes(plan.id)&&selectedIds.length>=100)} onChange={()=>onToggle(plan.id)}/></td><td>{editingId===plan.id?<input aria-label="Plan name" value={form.name} onChange={(event)=>set('name',event.target.value)}/>:<b>{plan.name}</b>}</td><td>{editingId===plan.id?<input aria-label="Plan price" type="number" min="0" value={form.price_kes} onChange={(event)=>set('price_kes',event.target.value)}/>:<>KES {money(plan.price_kes)}</>}</td><td>{editingId===plan.id?<input aria-label="Plan duration in days" type="number" min="1" value={form.duration_days} onChange={(event)=>set('duration_days',event.target.value)}/>:<>{plan.duration_days} days</>}</td><td>{editingId===plan.id?<input aria-label="Branch limit, minus one for unlimited" type="number" value={form.branches} onChange={(event)=>set('branches',event.target.value)}/>:plan.feature_flags?.branches===-1?'Unlimited':plan.feature_flags?.branches??1}</td><td>{editingId===plan.id?<input aria-label="Staff limit, minus one for unlimited" type="number" value={form.staff} onChange={(event)=>set('staff',event.target.value)}/>:plan.feature_flags?.staff===-1?'Unlimited':plan.feature_flags?.staff??1}</td><td>{editingId===plan.id?<input aria-label="Plan features" value={form.description} onChange={(event)=>set('description',event.target.value)}/>:plan.feature_flags?.description||'—'}</td><td><StatusPill status={plan.active?'ACTIVE':'INACTIVE'}/></td><td>{editingId===plan.id?<div className="pa-actions"><button type="button" disabled={busy} onClick={()=>save(plan)}>Save</button><button type="button" className="pa-cancel" disabled={busy} onClick={()=>setEditingId('')}>Cancel</button></div>:<button className="pa-activate" disabled={busy} onClick={()=>start(plan)}>Update</button>}</td></tr>)}{!plans.length&&<tr><td colSpan="9"><EmptyState>There are no plans in the platform yet.</EmptyState></td></tr>}</tbody></table></div></>;
}
function TenantPlanTable({ tenants, plans, subscriptions, payments, selections, onSelect, onActivate, busy, selectedIds,onToggle,onSelectAll,onClear }) { return <><SelectionControls rows={tenants} selectedIds={selectedIds} onSelectAll={onSelectAll} onClear={onClear} disabled={busy} note="Choose and confirm each business plan individually."/><div className="pa-table-wrap"><table><thead><tr><th aria-label="Select"/><th>BUSINESS</th><th>CURRENT PLAN</th><th>PAYMENT</th><th>EXPIRES</th><th>PLAN TO ACTIVATE</th><th>ACTION</th></tr></thead><tbody>{tenants.map((tenant) => { const current = subscriptions.find((subscription) => subscription.tenant_id === tenant.id); const payment=current&&payments.find((row)=>row.subscription_id===current.id); const branchCount=current?.branch_count||payments.find((row)=>row.tenant_id===tenant.id)?.branch_count||1; const planName = plans.find((plan) => plan.id === current?.plan_id)?.name || 'No active plan'; return <tr key={tenant.id}><td><input type="checkbox" aria-label={`Select ${tenant.name}`} checked={selectedIds.includes(tenant.id)} disabled={busy||(!selectedIds.includes(tenant.id)&&selectedIds.length>=100)} onChange={()=>onToggle(tenant.id)}/></td><td><b>{tenant.name}</b><small className="pa-id">{tenant.owner_name} · {branchCount} branch(es)</small></td><td><StatusPill status={current?.status || tenant.status}/><small className="pa-id">{planName}</small></td><td><StatusPill status={payment?'PAID':'UNPAID'}/></td><td>{current ? date(current.ends_at) : '—'}</td><td><select value={selections[tenant.id] || ''} onChange={(event) => onSelect(tenant.id, event.target.value)} aria-label={`Plan for ${tenant.name}`}><option value="">Choose a plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id} disabled={Number(plan.feature_flags?.branches??1)!==-1&&branchCount>Number(plan.feature_flags?.branches??1)}>{plan.name} · KES {money(plan.price_kes)}</option>)}</select></td><td><button className="pa-activate" disabled={busy || !selections[tenant.id]} onClick={() => onActivate(tenant)}>Review payment</button></td></tr>; })}{!tenants.length&&<tr><td colSpan="7"><EmptyState>No businesses need plan activation.</EmptyState></td></tr>}</tbody></table></div></>; }
function StatusPill({ status }) { return <span className={`pa-status ${String(status).toLowerCase().replaceAll(' ', '-')}`}>{status}</span>; }
function EmptyState({ children }) { return <div className="pa-empty">{children}</div>; }
function sectionLabel(section) { return ({ overview: 'Overview', requests: 'Business requests', 'recent-businesses': 'Recent businesses', businesses: 'Businesses', plans: 'Plans & billing', activation: 'Activate a business plan', reconciliation: 'Reconciliation', settings: 'Settings' })[section] || 'Overview'; }
function initials(name = '') { return name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'SA'; }
function money(value) { return Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function date(value) { return value ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }
