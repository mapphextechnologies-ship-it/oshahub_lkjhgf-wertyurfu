import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowDownToLine, Banknote, Bell, Building2, Check, BadgeCheck, ChevronRight, CircleAlert, Clock3, CreditCard, LayoutDashboard, LoaderCircle, LogOut, Menu, Search, Settings, ShieldCheck, Smartphone, Trash2, X } from 'lucide-react';
import { supabaseBrowser, supabaseConfigMessage } from '../services/supabaseBrowser.js';

const EMPTY_DATA = { tenants: [], requests: [], plans: [], subscriptions: [], subscriptionPayments: [], billingRequests: [], billingSchemaReady: true };

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
  const [planSelections, setPlanSelections] = useState({});
  const [adminName, setAdminName] = useState('');

  useEffect(() => { setAdminName(session?.membership.full_name || ''); }, [session?.membership.full_name]);

  useEffect(() => {
    if (!supabaseBrowser) { setAuthLoading(false); return undefined; }
    let active = true;
    supabaseBrowser.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) { setError(sessionError.message); setAuthLoading(false); return; }
      const user = data.session?.user;
      if (!user) { setAuthLoading(false); return; }
      const { data: memberships, error: membershipError } = await supabaseBrowser.from('carwash_memberships')
        .select('id,role,tenant_id,full_name,status').eq('user_id', user.id).eq('role', 'SUPER_ADMIN').eq('status', 'ACTIVE').is('tenant_id', null).limit(1);
      if (!active) return;
      if (membershipError) setError(membershipError.message);
      else if (memberships?.[0]) setSession({ user, membership: memberships[0] });
      else setError('This signed-in account does not have an active Super Admin membership.');
      setAuthLoading(false);
    }).catch((sessionError) => { if (active) { setError(sessionError.message || 'Unable to restore your administrator session.'); setAuthLoading(false); } });
    return () => { active = false; };
  }, []);

  const loadData = useCallback(async ({ quiet = false } = {}) => {
    if (!supabaseBrowser) return;
    if (!quiet) setBusy(true);
    setError('');
    const [tenants, requests, plans, subscriptions, subscriptionPayments, billingRequests] = await Promise.all([
      supabaseBrowser.from('carwash_tenants').select('id,name,owner_name,status,created_at').order('created_at', { ascending: false }),
      supabaseBrowser.from('carwash_access_requests').select('id,tenant_name,owner_name,phone,status,created_at').order('created_at', { ascending: false }),
      supabaseBrowser.from('carwash_plans').select('id,name,price_kes,duration_days,feature_flags,active').order('price_kes'),
      supabaseBrowser.from('carwash_subscriptions').select('*').order('starts_at', { ascending: false }),
      supabaseBrowser.from('carwash_subscription_payments').select('*').order('paid_at', { ascending: false }),
      supabaseBrowser.from('carwash_billing_requests').select('*').order('created_at', { ascending: false })
    ]);
    const failed = [tenants, requests, plans, subscriptions].find((result) => result.error);
    if (failed) setError(failed.error.message);
    else {
      const billingSchemaReady=!subscriptionPayments.error;
      setData({ tenants: tenants.data || [], requests: requests.data || [], plans: plans.data || [], subscriptions: subscriptions.data || [], subscriptionPayments: subscriptionPayments.data || [], billingRequests: billingRequests.error ? [] : billingRequests.data || [], billingSchemaReady });
      if(!billingSchemaReady)setError('Run database/migrations/20260929_platform_billing.sql in the Supabase SQL Editor to enable confirmed payment totals.');
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
    const { data: result, error: authError } = await supabaseBrowser.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) { setError(authError.message); setBusy(false); return; }
    const { data: memberships, error: membershipError } = await supabaseBrowser.from('carwash_memberships')
      .select('id,role,tenant_id,full_name,status').eq('user_id', result.user.id).eq('role', 'SUPER_ADMIN').eq('status', 'ACTIVE').is('tenant_id', null).limit(1);
    const membership = memberships?.[0];
    if (membershipError || !membership) {
      setError(membershipError?.message || 'This account does not have an active Super Admin membership.');
      setBusy(false); return;
    }
    setSession({ user: result.user, membership });
    setPassword('');
    setBusy(false);
  }

  async function signOut() {
    await supabaseBrowser?.auth.signOut();
    setSession(null); setData(EMPTY_DATA); setSection('overview');
  }

  async function reviewRequest(id, approve) {
    setBusy(true); setError(''); setNotice('');
    const { error: reviewError } = await supabaseBrowser.rpc('carwash_review_business_request', { p_request: id, p_approve: approve });
    if (reviewError) setError(reviewError.message);
    else { setNotice(approve ? 'Business approved and account activation was sent to its in-app inbox.' : 'Business request declined and the applicant was notified in-app.'); await loadData(); }
    setBusy(false);
  }

  async function deleteRequests(ids) {
    const requestIds = [...new Set(ids)];
    if (!requestIds.length || !window.confirm(`Delete ${requestIds.length} selected request record${requestIds.length === 1 ? '' : 's'}? This removes application records only; approved business accounts remain active.`)) return;
    setDeletingRequests(true); setError(''); setNotice('');
    try {
      const { data: deleted, error: deleteError } = await supabaseBrowser.rpc('carwash_delete_business_requests', { p_request_ids: requestIds }).abortSignal(AbortSignal.timeout(15000));
      if (deleteError) setError(deleteError.code === 'PGRST202' ? 'The database is missing this Super Admin request-cleanup function. Apply database/migrations/20260930_platform_request_cleanup.sql in Supabase, then retry.' : deleteError.message);
      else if (deleted < requestIds.length) { setError('Some selected request records were not deleted. Apply database/migrations/20261002_safe_bulk_cleanup.sql in Supabase to enable deletion for every request status.'); void loadData({ quiet: true }); }
      else { setSelectedRequests([]); setData((old)=>({...old,requests:old.requests.filter((request)=>!requestIds.includes(request.id))})); setNotice(`${deleted} request${deleted === 1 ? '' : 's'} deleted. Approved business accounts remain active.`); void loadData({ quiet: true }).catch((refreshError)=>setError(refreshError.message||'Requests were deleted, but the list could not refresh.')); }
    } catch (deleteError) { setError(deleteError.name === 'TimeoutError' || deleteError.name === 'AbortError' ? 'The deletion took too long. Check your connection and refresh the request list before trying again.' : deleteError.message || 'Could not delete these requests.'); }
    finally { setDeletingRequests(false); }
  }

  async function activatePlan(tenant) {
    const planId = planSelections[tenant.id];
    if (!planId) { setError('Choose a plan before activating it.'); return; }
    const plan = data.plans.find((item) => item.id === planId);
    if (!data.billingSchemaReady) { setError('Run the platform billing database migration before confirming subscription payments.'); return; }
    const branchCount=data.subscriptions.find((subscription)=>subscription.tenant_id===tenant.id)?.branch_count||data.subscriptionPayments.find((payment)=>payment.tenant_id===tenant.id)?.branch_count||1;
    const branchLimit=Number(plan?.feature_flags?.branches??1);
    if(branchLimit!==-1&&branchCount>branchLimit){setError(`${plan.name} supports ${branchLimit} branch${branchLimit===1?'':'es'}. Choose a plan that covers all ${branchCount} branches.`);return;}
    const onboardingFee=data.subscriptionPayments.some((payment)=>payment.tenant_id===tenant.id)?0:8500*branchCount;
    setActivationTenant({ ...tenant, selectedPlan: { ...plan, branchCount, onboardingFee, totalDue: Number(plan.price_kes)+onboardingFee } });
  }

  async function reviewBillingRequest(request, approve) {
    setBusy(true); setError(''); setNotice('');
    const { error: reviewError } = await supabaseBrowser.rpc('carwash_review_billing_request', { p_request_id: request.id, p_approve: approve });
    if (reviewError) setError(reviewError.message);
    else { setNotice(approve ? 'Billing request approved. The business was notified.' : 'Billing request declined. The business was notified.'); await loadData(); }
    setBusy(false);
  }

  async function confirmPlanActivation(event) {
    event.preventDefault();
    const tenant=activationTenant;
    if(!tenant)return;
    setBusy(true); setError(''); setNotice('');
    const { error: activationError } = await supabaseBrowser.rpc('carwash_activate_tenant_plan', { target_tenant: tenant.id, target_plan: tenant.selectedPlan.id, payment_method: paymentMethod, payment_reference: paymentReference.trim()||null,p_branch_count:tenant.selectedPlan.branchCount||1 });
    if (activationError) setError(activationError.code==='PGRST202'?'Run database/migrations/20261001_subscription_terms_and_branches.sql in Supabase to enable branch-aware plan activation.':activationError.message);
    else { setNotice(`${tenant.selectedPlan.name} activated for ${tenant.name}; KES ${money(tenant.selectedPlan.totalDue)} recorded, including the KES ${money(tenant.selectedPlan.onboardingFee)} onboarding fee. The business team was notified.`); setActivationTenant(null); setPaymentReference(''); await loadData(); }
    setBusy(false);
  }

  async function saveAdminName(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const { data: membership, error: nameError } = await supabaseBrowser.rpc('carwash_update_platform_admin_name', { p_full_name: adminName });
    if (nameError) setError(nameError.message);
    else { setSession((old) => ({ ...old, membership })); setNotice('Super Admin profile name updated.'); }
    setBusy(false);
  }

  async function changeTenantStatus(tenant, status) {
    setBusy(true); setError(''); setNotice('');
    const { error: updateError } = await supabaseBrowser.from('carwash_tenants').update({ status }).eq('id', tenant.id);
    if (updateError) setError(updateError.message);
    else { setNotice(`${tenant.name} updated to ${status}.`); await loadData(); }
    setBusy(false);
  }

  function handleOutsidePointerDown(event) {
    if (event.target.closest?.('.pa-sidebar, .pa-sidebar-toggle, .pa-mobile-open')) return;
    if (window.matchMedia('(max-width: 680px)').matches) setMenuOpen(false);
    else setSidebarCollapsed(true);
  }

  if (authLoading) return <AdminAuthLoading/>;
  if (!session) return <AdminSignIn email={email} setEmail={setEmail} password={password} setPassword={setPassword} onSubmit={signIn} busy={busy} error={error} />;

  const pending = data.requests.filter((request) => request.status === 'PENDING');
  const filteredTenants = data.tenants.filter((tenant) => `${tenant.name} ${tenant.owner_name}`.toLowerCase().includes(search.toLowerCase()));
  const billingRows=data.tenants.map((tenant)=>{const subscription=data.subscriptions.find((row)=>row.tenant_id===tenant.id);const payment=subscription&&data.subscriptionPayments.find((row)=>row.subscription_id===subscription.id);const plan=data.plans.find((row)=>row.id===(subscription?.plan_id||payment?.plan_id));const current=subscription&&new Date(subscription.ends_at)>=new Date()&&['ACTIVE','TRIAL','EXPIRING SOON'].includes(subscription.status);return {tenant,subscription,payment,plan,isPaid:Boolean(payment&&current)};});
  const unpaidBillingRows=billingRows.filter((row)=>!row.isPaid);
  const paidBillingRows=billingRows.filter((row)=>row.isPaid);
  const collected=data.subscriptionPayments.reduce((sum,row)=>sum+Number(row.amount_kes||0),0);
  const pendingBillingRequests=data.billingRequests.filter((request)=>request.status==='PENDING');
  const platformNotices=[...pending.map((request)=>({id:`request-${request.id}`,title:'Business request awaiting review',detail:`${request.tenant_name} · ${request.owner_name}`,section:'requests'})),...pendingBillingRequests.map((request)=>({id:`billing-${request.id}`,title:request.request_type==='TRIAL_EXTENSION'?'Free trial extension requested':'Plan payment needs verification',detail:`${data.tenants.find((tenant)=>tenant.id===request.tenant_id)?.name||'Business'} · ${request.payment_reference||'7-day extension'}`,section:'plans'})),...unpaidBillingRows.map((row)=>({id:`unpaid-${row.tenant.id}`,title:'Plan payment not recorded',detail:`${row.tenant.name} · ${row.subscription?date(row.subscription.ends_at):'No subscription'}`,section:'plans'})),...paidBillingRows.map((row)=>({id:`paid-${row.payment.id}`,title:'Plan payment confirmed',detail:`${row.tenant.name} · ${row.plan?.name||'Plan'} · KES ${money(row.payment.amount_kes)}`,section:'plans'}))];

  return <div className={`pa-shell ${sidebarCollapsed?'is-collapsed':''} ${menuOpen?'menu-open':''}`} onPointerDownCapture={handleOutsidePointerDown}>
    <aside className="pa-sidebar">
      <div className="pa-sidebar-head"><a className="pa-brand" href="/"><img src="/osha-hub-logo.svg" alt="OshaHub"/><span>PLATFORM CONTROL</span></a><button className="pa-sidebar-toggle" onClick={()=>{if(window.matchMedia('(max-width: 680px)').matches)setMenuOpen(false);else setSidebarCollapsed((collapsed)=>!collapsed);}} aria-label={menuOpen?'Close side menu':sidebarCollapsed?'Expand side menu':'Collapse side menu'} aria-expanded={window.matchMedia('(max-width: 680px)').matches?menuOpen:!sidebarCollapsed}>{menuOpen?<X size={19}/>:<Menu size={19}/>}</button></div>
      <div className="pa-nav-label">ADMINISTRATION</div>
      <nav onClick={() => setMenuOpen(false)}>
        {[["overview", "Overview", LayoutDashboard], ["requests", "Business requests", ArrowDownToLine], ["recent-businesses", "Recent businesses", Clock3], ["businesses", "Businesses", Building2], ["plans", "Plans & billing", CreditCard], ["activation", "Activate a business plan", BadgeCheck], ["reconciliation", "Reconciliation", Activity]].map(([key, label, Icon]) => <button key={key} className={section === key ? 'active' : ''} onClick={() => setSection(key)}><Icon size={18}/><span>{label}</span>{key === 'requests' && pending.length > 0 && <i>{pending.length}</i>}</button>)}
        <button className={section === 'settings' ? 'active' : ''} onClick={() => setSection('settings')}><Settings size={18}/><span>Settings</span></button>
      </nav>
      <div className="pa-side-bottom"><div className="pa-secure"><ShieldCheck size={17}/><span><b>Restricted access</b><small>Platform owner account</small></span></div><button className="pa-signout" onClick={signOut}><LogOut size={17}/> Sign out</button></div>
    </aside>
    {menuOpen&&<button className="pa-scrim" onClick={()=>setMenuOpen(false)} aria-label="Close navigation"/>}
    {!menuOpen&&<button className="pa-mobile-open" onClick={()=>setMenuOpen(true)} aria-label="Open side menu"><Menu size={19}/></button>}
    <main className="pa-main">
      <header className="pa-topbar"><div className="pa-crumb"><span>OSHAHUB / PLATFORM</span><ChevronRight size={14}/><b>{sectionLabel(section)}</b></div><div className="pa-top-actions"><div className="pa-notification-wrap"><button className="pa-bell" onClick={()=>setNotificationsOpen((open)=>!open)} aria-label="Notifications"><Bell size={18}/>{platformNotices.length>0&&<i>{platformNotices.length>99?'99+':platformNotices.length}</i>}</button>{notificationsOpen&&<div className="pa-notification-panel"><b>Platform notifications</b>{platformNotices.slice(0,30).map((item)=><button key={item.id} onClick={()=>{setSection(item.section);setNotificationsOpen(false);}}><strong>{item.title}</strong><span>{item.detail}</span></button>)}{!platformNotices.length&&<p>All businesses are paid and requests are up to date.</p>}</div>}</div><div className="pa-user"><span className="pa-avatar">{initials(session.membership.full_name)}</span><span><b>{session.membership.full_name}</b><small>SUPER ADMIN</small></span></div></div></header>
      <section className="pa-content">
        {notice && <div className="pa-alert success"><Check size={17}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={16}/></button></div>}
        {error && <div className="pa-alert error"><CircleAlert size={17}/>{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={16}/></button></div>}
        {busy && <div className="pa-loading"><LoaderCircle size={15}/> Syncing platform data…</div>}
        {section === 'overview' && <>
          <PageTitle eyebrow="PLATFORM OVERVIEW" title={`Welcome, ${session.membership.full_name.split(' ')[0]}.`} description="Review business access and monitor the OshaHub network."/>
          <div className="pa-metrics"><Metric label="Collected" value={`KES ${money(collected)}`} icon={Banknote}/><Metric label="Unpaid businesses" value={unpaidBillingRows.length} icon={Clock3} highlight/><Metric label="M-Pesa payments" value={data.subscriptionPayments.filter((row)=>row.method==='M-PESA').length} icon={Smartphone}/><Metric label="Pending requests" value={pending.length+pendingBillingRequests.length} icon={ArrowDownToLine}/></div>
          <PlatformActivityChart tenants={data.tenants} payments={data.subscriptionPayments}/>
        </>}
        {section === 'requests' && <><PageTitle eyebrow="ACCESS REVIEW" title="Business requests" description="Approve, re-approve, reject, or clear business registration requests."/><div className="pa-bulk-actions"><span>{selectedRequests.length} selected{deletingRequests?' · Deleting…':''}</span><button disabled={busy || deletingRequests || !data.requests.length} onClick={() => setSelectedRequests(data.requests.slice(0,250).map((request) => request.id))}>Select up to 250</button><button disabled={!selectedRequests.length || deletingRequests} onClick={() => setSelectedRequests([])}>Clear selection</button><button className="danger" disabled={busy || deletingRequests || !data.requests.some((request) => request.status === 'REJECTED')} onClick={() => deleteRequests(data.requests.filter((request) => request.status === 'REJECTED').slice(0,250).map((request) => request.id))}>Clear rejected</button><button className="danger" disabled={busy || deletingRequests || !selectedRequests.length} onClick={() => deleteRequests(selectedRequests)}><Trash2 size={14}/> {deletingRequests?'Deleting…':'Delete selected'}</button></div><section className="pa-panel"><RequestTable requests={data.requests} onReview={reviewRequest} busy={busy || deletingRequests} selectedIds={selectedRequests} onToggle={(id) => setSelectedRequests((old) => old.includes(id) ? old.filter((item) => item !== id) : [...old, id])} selectable/></section></>}
        {section === 'businesses' && <><PageTitle eyebrow="TENANT DIRECTORY" title="Businesses" description="Manage tenant access and monitor account status."/><div className="pa-search"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search business or owner"/></div><section className="pa-panel"><TenantTable tenants={filteredTenants} onStatus={changeTenantStatus}/></section></>}
        {section === 'recent-businesses' && <><PageTitle eyebrow="NEW ACCOUNTS" title="Recent businesses" description="The latest businesses registered on the OshaHub platform."/><section className="pa-panel"><TenantTable tenants={[...data.tenants].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,10)} onStatus={changeTenantStatus}/></section></>}
        {section === 'activation' && <><PageTitle eyebrow="SUBSCRIPTION CONTROL" title="Activate a business plan" description="Review a business subscription and confirm its recorded payment before activating access."/><section className="pa-panel"><div className="pa-panel-head"><div><h2>Business plan activation</h2><p>Choose the plan for each business. Payment confirmation is recorded before access changes.</p></div></div><div className="pa-table-wrap"><TenantPlanTable tenants={data.tenants} plans={data.plans.filter((plan) => plan.active)} subscriptions={data.subscriptions} payments={data.subscriptionPayments} selections={planSelections} onSelect={(tenantId,planId) => setPlanSelections((old) => ({ ...old, [tenantId]: planId }))} onActivate={activatePlan} busy={busy}/></div><div className="pa-plan-foot">Each confirmation records the plan amount and payment method, activates the tenant plan and notifies the business team.</div></section></>}
        {section === 'reconciliation' && <><PageTitle eyebrow="PAYMENT OPERATIONS" title="Reconciliation" description="Compare confirmed payments with the current subscription status for each business."/><BillingDashboard rows={billingRows} tenants={data.tenants} plans={data.plans} paidRows={paidBillingRows} unpaidRows={unpaidBillingRows} payments={data.subscriptionPayments} collected={collected} ready={data.billingSchemaReady} onViewPlans={()=>setSection('plans')}/></>}
        {section === 'plans' && <><PageTitle eyebrow="SUBSCRIPTIONS" title="Plans & billing" description="Review customer payment requests, subscription terms and payment history."/><section className="pa-panel"><div className="pa-panel-head"><div><h2>Customer billing requests</h2><p>Verify receipts and review one-time trial extensions.</p></div><span className="pa-status pending">{pendingBillingRequests.length} pending</span></div><BillingRequestsTable requests={pendingBillingRequests} tenants={data.tenants} plans={data.plans} onReview={reviewBillingRequest} busy={busy}/></section><section className="pa-panel"><h2>Recent confirmed payments</h2><PlatformPaymentsTable payments={data.subscriptionPayments} tenants={data.tenants} plans={data.plans}/></section><section className="pa-panel"><h2>Available plans</h2><div className="pa-table-wrap"><table><thead><tr><th>PLAN</th><th>PRICE</th><th>DURATION</th><th>STATUS</th></tr></thead><tbody>{data.plans.map((plan) => <tr key={plan.id}><td><b>{plan.name}</b></td><td>KES {money(plan.price_kes)}</td><td>{plan.duration_days} days</td><td><StatusPill status={plan.active ? 'ACTIVE' : 'SUSPENDED'}/></td></tr>)}</tbody></table>{data.plans.length === 0 && <EmptyState>There are no plans in the platform yet.</EmptyState>}</div></section></>}
        {section === 'settings' && <>
          <PageTitle eyebrow="PLATFORM PROFILE" title="Super Admin settings" description="Manage your platform profile and review the access attached to your administrator account."/>
          <div className="pa-settings-grid">
            <section className="pa-panel pa-settings-panel"><div className="pa-panel-head"><div><h2>Administrator profile</h2><p>This name appears in the platform console and audit activity.</p></div></div><form onSubmit={saveAdminName}><label>Display name<input required minLength="2" maxLength="120" value={adminName} onChange={(event) => setAdminName(event.target.value)}/></label><label>Sign-in email<input value={session.user.email || ''} readOnly/></label><button className="pa-primary" disabled={busy}>Save profile</button></form></section>
            <section className="pa-panel pa-settings-security"><ShieldCheck size={23}/><h2>Access and security</h2><p>Platform controls are limited to an active Super Admin membership.</p><div><span>Account role</span><b>Super Admin</b></div><div><span>Membership</span><b>{session.membership.status}</b></div><div><span>Business workspace access</span><b>Platform-wide</b></div><div><span>Sign-in account</span><b>{session.user.email || 'Email unavailable'}</b></div></section>
          </div>
        </>}
      </section>
    </main>
        {activationTenant&&<div className="pa-drawer-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)setActivationTenant(null);}}><aside className="pa-drawer"><header><div><span>PAYMENT CONFIRMATION</span><h2>{activationTenant.tenant_name||activationTenant.name}</h2><p>{activationTenant.owner_name}</p></div><button className="pa-drawer-close" type="button" onClick={()=>setActivationTenant(null)} aria-label="Close"><X size={18}/></button></header><form onSubmit={confirmPlanActivation}><div className="pa-drawer-plan"><small>PLAN TO ACTIVATE</small><strong>{activationTenant.selectedPlan?.name}</strong><span>Plan KES {money(activationTenant.selectedPlan?.price_kes)} · {activationTenant.selectedPlan?.duration_days} days</span><label>Business branches<input type="number" min="1" max="100" value={activationTenant.selectedPlan?.branchCount||1} onChange={(event)=>setActivationTenant((old)=>{const count=Math.max(1,Math.min(100,Number(event.target.value)||1));const onboardingFee=data.subscriptionPayments.some((payment)=>payment.tenant_id===old.id)?0:8500*count;return {...old,selectedPlan:{...old.selectedPlan,branchCount:count,onboardingFee,totalDue:Number(old.selectedPlan.price_kes)+onboardingFee}}})}/></label><span>One-time onboarding · KES 8,500 per branch: KES {money(activationTenant.selectedPlan?.onboardingFee)}</span><strong>Total due KES {money(activationTenant.selectedPlan?.totalDue)}</strong></div><label>Payment method<select value={paymentMethod} onChange={(event)=>setPaymentMethod(event.target.value)}><option value="M-PESA">M-Pesa</option><option value="CASH">Cash</option><option value="CARD">Card</option><option value="BANK TRANSFER">Bank transfer</option></select></label><label>Payment reference <span>Optional</span><input value={paymentReference} onChange={(event)=>setPaymentReference(event.target.value)} placeholder="M-Pesa code or receipt number"/></label><p className="pa-drawer-note">Confirm only after the full total has reached OshaHub. The one-time KES 8,500 onboarding fee applies per branch on a business’s first paid plan.</p><button className="pa-primary" disabled={busy}><Check size={16}/>{busy?'Recording payment…':'Confirm payment and activate'}</button></form></aside></div>}
  </div>;
}

function AdminAuthLoading() { return <main className="pa-auth-loading" role="status" aria-live="polite"><img src="/osha-hub-logo.svg" alt="OshaHub"/><h1>Restoring your secure session…</h1><p>Connecting to the platform console</p><div><i/></div></main>; }

function AdminSignIn({ email, setEmail, password, setPassword, onSubmit, busy, error }) {
  return <main className="pa-login"><section className="pa-login-brand"><a href="/"><img src="/osha-hub-logo.svg" alt="OshaHub"/></a><span>PLATFORM OWNER CONSOLE</span><h1>One platform.<br/>Every car wash.</h1><p>Review tenant applications, manage platform access and oversee subscriptions from a private administrator workspace.</p><div><ShieldCheck size={16}/> ACCESS RESTRICTED TO PLATFORM ADMINS</div></section><section className="pa-login-form-wrap"><form className="pa-login-form" onSubmit={onSubmit}><span className="pa-kicker">SUPER ADMINISTRATION</span><h2>Super Admin sign in</h2><p>Use the platform owner account assigned to you.</p><label>Email address<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@yourbusiness.com"/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password"/></label><button disabled={busy || !supabaseBrowser}>{busy ? 'Signing in…' : 'Sign in to platform'}</button>{!supabaseBrowser && <div className="pa-feedback error"><CircleAlert size={16}/><span>Supabase is not configured. {supabaseConfigMessage}</span></div>}{error && <div className="pa-feedback error"><CircleAlert size={16}/><span>{error}</span></div>}<small>OshaHub platform administration · Authorized accounts only</small></form></section></main>;
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

function BillingRequestsTable({requests,tenants,plans,onReview,busy}){return <div className="pa-table-wrap"><table><thead><tr><th>BUSINESS</th><th>REQUEST</th><th>PLAN</th><th>BRANCHES</th><th>ONBOARDING</th><th>PAYMENT STATUS</th><th>SUBMITTED</th><th>ACTION</th></tr></thead><tbody>{requests.map((request)=>{const tenant=tenants.find((item)=>item.id===request.tenant_id);const plan=plans.find((item)=>item.id===request.plan_id);const stk=request.request_type==='PLAN_PURCHASE'&&request.payment_method==='M-PESA';return <tr key={request.id}><td><b>{tenant?.name||'Business'}</b></td><td>{request.request_type==='TRIAL_EXTENSION'?'Extra 7-day free trial':'Paid plan · M-Pesa STK Push'}</td><td>{request.request_type==='TRIAL_EXTENSION'?'—':`${plan?.name||'Plan'} · ${plan?.term||''}`}</td><td>{request.request_type==='PLAN_PURCHASE'?request.branch_count||1:'—'}</td><td>{request.request_type==='PLAN_PURCHASE'?`KES ${money(request.onboarding_fee_kes||0)}`:'—'}</td><td>{stk?`${request.mpesa_payment_status||'NOT_STARTED'} · KES ${money(request.mpesa_expected_amount_kes||request.onboarding_fee_kes)}`:'Trial review'}</td><td>{date(request.created_at)}</td><td><div className="pa-actions">{request.request_type==='TRIAL_EXTENSION'&&<button className="approve" disabled={busy} onClick={()=>onReview(request,true)}>Approve extension</button>}{request.request_type==='TRIAL_EXTENSION'&&<button className="reject" disabled={busy} onClick={()=>onReview(request,false)}>Decline</button>}{stk&&<span className="pa-status pending">{request.mpesa_payment_status==='PAID'?'Confirmed by Safaricom':request.mpesa_payment_status==='FAILED'?'Customer may retry':'Waiting for customer'}</span>}</div></td></tr>;})}</tbody></table>{!requests.length&&<EmptyState>No customer billing requests are waiting for review.</EmptyState>}</div>;}

function BillingDashboard({rows,tenants,plans,paidRows,unpaidRows,payments,collected,ready,onViewPlans}){
  return <>
    {!ready&&<div className="pa-alert error"><CircleAlert size={17}/>Apply database/migrations/20260929_platform_billing.sql to record confirmed plan payments.</div>}
    <div className="pa-metrics pa-billing-metrics"><Metric label="Collected" value={`KES ${money(collected)}`} icon={Banknote}/><Metric label="Unpaid businesses" value={unpaidRows.length} icon={Clock3} highlight/><Metric label="M-Pesa payments" value={payments.filter((row)=>row.method==='M-PESA').length} icon={Smartphone}/><Metric label="Refunds" value="KES 0" icon={ArrowDownToLine}/></div>
    <div className="pa-billing-grid"><section className="pa-panel"><div className="pa-panel-head"><div><h2>Unpaid or overdue</h2><p>Businesses without a confirmed current plan payment.</p></div><button className="pa-text-button" onClick={onViewPlans}>Manage billing <ChevronRight size={15}/></button></div><BillingStatusTable rows={unpaidRows}/></section><section className="pa-panel"><div className="pa-panel-head"><div><h2>Paid businesses</h2><p>Current subscriptions with recorded payment confirmations.</p></div></div><BillingStatusTable rows={paidRows}/></section></div>
    <section className="pa-panel"><div className="pa-panel-head"><div><h2>Recent collections</h2><p>{payments.length} confirmed subscription payments · lifetime</p></div><button className="pa-text-button" onClick={onViewPlans}>View billing <ChevronRight size={15}/></button></div><PlatformPaymentsTable payments={payments.slice(0,5)} tenants={tenants} plans={plans}/></section>
  </>;
}
function BillingStatusTable({rows}){return <div className="pa-table-wrap"><table><thead><tr><th>BUSINESS</th><th>PLAN</th><th>PAYMENT</th><th>ENDS</th></tr></thead><tbody>{rows.map(({tenant,subscription,payment,plan,isPaid})=><tr key={tenant.id}><td><b>{tenant.name}</b><small className="pa-id">{tenant.owner_name}</small></td><td>{plan?.name||'No plan'}</td><td><StatusPill status={isPaid?'PAID':'UNPAID'}/>{payment&&<small className="pa-id">{payment.method}</small>}</td><td>{subscription?date(subscription.ends_at):'—'}</td></tr>)}{!rows.length&&<tr><td colSpan="4"><EmptyState>No businesses in this group.</EmptyState></td></tr>}</tbody></table></div>;}
function PlatformPaymentsTable({payments,tenants,plans}){return <div className="pa-table-wrap"><table><thead><tr><th>BUSINESS</th><th>PLAN</th><th>PAYMENT TYPE</th><th>AMOUNT PAID</th><th>BRANCHES</th><th>METHOD</th><th>REFERENCE</th><th>PAID</th></tr></thead><tbody>{payments.map((payment)=><tr key={payment.id}><td><b>{tenants.find((tenant)=>tenant.id===payment.tenant_id)?.name||'Business'}</b></td><td>{plans.find((plan)=>plan.id===payment.plan_id)?.name||'Subscription plan'}</td><td>{payment.payment_stage==='ONBOARDING'?'Onboarding':payment.payment_stage==='SUBSCRIPTION'?'Subscription':'Legacy payment'}</td><td><b>KES {money(payment.amount_kes)}</b></td><td>{payment.branch_count||1}</td><td>{payment.method}</td><td>{payment.external_reference||'—'}</td><td>{date(payment.paid_at)}</td></tr>)}{!payments.length&&<tr><td colSpan="8"><EmptyState>No subscription payments have been confirmed yet.</EmptyState></td></tr>}</tbody></table></div>;}
function RequestTable({ requests, onReview, busy, selectable = false, selectedIds = [], onToggle }) {
  return <div className={`pa-table-wrap ${selectable ? 'pa-requests' : ''}`}>
    <table>
      <thead><tr>{selectable && <th aria-label="Select"/>}<th>BUSINESS</th><th>OWNER</th><th>PHONE</th><th>STATUS</th><th>RECEIVED</th><th>ACTION</th></tr></thead>
      <tbody>{requests.map((request) => <tr key={request.id}>
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
function TenantTable({ tenants, onStatus }) { return <div className="pa-table-wrap"><table><thead><tr><th>BUSINESS</th><th>OWNER</th><th>STATUS</th><th>CREATED</th><th>ACCESS</th></tr></thead><tbody>{tenants.map((tenant) => <tr key={tenant.id}><td><b>{tenant.name}</b><small className="pa-id">{tenant.id.slice(0, 8)}</small></td><td>{tenant.owner_name}</td><td><StatusPill status={tenant.status}/></td><td>{date(tenant.created_at)}</td><td><select aria-label={`Change access for ${tenant.name}`} value={tenant.status} onChange={(event) => onStatus(tenant, event.target.value)}><option>TRIAL</option><option>ACTIVE</option><option>EXPIRING SOON</option><option>EXPIRED</option><option>SUSPENDED</option><option>CANCELLED</option></select></td></tr>)}</tbody></table>{tenants.length === 0 && <EmptyState>No businesses are registered yet.</EmptyState>}</div>; }
function TenantPlanTable({ tenants, plans, subscriptions, payments, selections, onSelect, onActivate, busy }) { return <table><thead><tr><th>BUSINESS</th><th>CURRENT PLAN</th><th>PAYMENT</th><th>EXPIRES</th><th>PLAN TO ACTIVATE</th><th>ACTION</th></tr></thead><tbody>{tenants.map((tenant) => { const current = subscriptions.find((subscription) => subscription.tenant_id === tenant.id); const payment=current&&payments.find((row)=>row.subscription_id===current.id); const branchCount=current?.branch_count||payments.find((row)=>row.tenant_id===tenant.id)?.branch_count||1; const planName = plans.find((plan) => plan.id === current?.plan_id)?.name || 'No active plan'; return <tr key={tenant.id}><td><b>{tenant.name}</b><small className="pa-id">{tenant.owner_name} · {branchCount} branch(es)</small></td><td><StatusPill status={current?.status || tenant.status}/><small className="pa-id">{planName}</small></td><td><StatusPill status={payment?'PAID':'UNPAID'}/></td><td>{current ? date(current.ends_at) : '—'}</td><td><select value={selections[tenant.id] || ''} onChange={(event) => onSelect(tenant.id, event.target.value)} aria-label={`Plan for ${tenant.name}`}><option value="">Choose a plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id} disabled={Number(plan.feature_flags?.branches??1)!==-1&&branchCount>Number(plan.feature_flags?.branches??1)}>{plan.name} · KES {money(plan.price_kes)}</option>)}</select></td><td><button className="pa-activate" disabled={busy || !selections[tenant.id]} onClick={() => onActivate(tenant)}>Review payment</button></td></tr>; })}</tbody></table>; }
function StatusPill({ status }) { return <span className={`pa-status ${String(status).toLowerCase().replaceAll(' ', '-')}`}>{status}</span>; }
function EmptyState({ children }) { return <div className="pa-empty">{children}</div>; }
function sectionLabel(section) { return ({ overview: 'Overview', requests: 'Business requests', 'recent-businesses': 'Recent businesses', businesses: 'Businesses', plans: 'Plans & billing', activation: 'Activate a business plan', reconciliation: 'Reconciliation', settings: 'Settings' })[section] || 'Overview'; }
function initials(name = '') { return name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'SA'; }
function money(value) { return Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function date(value) { return value ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }
