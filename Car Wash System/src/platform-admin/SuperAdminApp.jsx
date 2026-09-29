import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowDownToLine, Building2, Check, ChevronRight, CircleAlert, Clock3, CreditCard, LayoutDashboard, LoaderCircle, LogOut, Search, ShieldCheck, X } from 'lucide-react';
import { supabaseBrowser, supabaseConfigMessage } from '../services/supabaseBrowser.js';

const EMPTY_DATA = { tenants: [], requests: [], plans: [], subscriptions: [] };

export default function SuperAdminApp() {
  const [session, setSession] = useState(null);
  const [section, setSection] = useState('overview');
  const [data, setData] = useState(EMPTY_DATA);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    if (!supabaseBrowser) return;
    setBusy(true);
    setError('');
    const [tenants, requests, plans, subscriptions] = await Promise.all([
      supabaseBrowser.from('carwash_tenants').select('id,name,owner_name,status,created_at').order('created_at', { ascending: false }),
      supabaseBrowser.from('carwash_access_requests').select('id,tenant_name,owner_name,phone,status,created_at').order('created_at', { ascending: false }),
      supabaseBrowser.from('carwash_plans').select('id,name,price_kes,duration_days,active').order('price_kes'),
      supabaseBrowser.from('carwash_subscriptions').select('id,status,ends_at,tenant_id')
    ]);
    const failed = [tenants, requests, plans, subscriptions].find((result) => result.error);
    if (failed) setError(failed.error.message);
    else setData({ tenants: tenants.data || [], requests: requests.data || [], plans: plans.data || [], subscriptions: subscriptions.data || [] });
    setBusy(false);
  }, []);

  useEffect(() => {
    if (session) loadData();
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
      await supabaseBrowser.auth.signOut();
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
    else { setNotice(approve ? 'Business approved and account activated.' : 'Business request declined.'); await loadData(); }
    setBusy(false);
  }

  async function changeTenantStatus(tenant, status) {
    setBusy(true); setError(''); setNotice('');
    const { error: updateError } = await supabaseBrowser.from('carwash_tenants').update({ status }).eq('id', tenant.id);
    if (updateError) setError(updateError.message);
    else { setNotice(`${tenant.name} updated to ${status}.`); await loadData(); }
    setBusy(false);
  }

  if (!session) return <AdminSignIn email={email} setEmail={setEmail} password={password} setPassword={setPassword} onSubmit={signIn} busy={busy} error={error} />;

  const pending = data.requests.filter((request) => request.status === 'PENDING');
  const filteredTenants = data.tenants.filter((tenant) => `${tenant.name} ${tenant.owner_name}`.toLowerCase().includes(search.toLowerCase()));

  return <div className="pa-shell">
    <aside className="pa-sidebar">
      <a className="pa-brand" href="/"><img src="/osha-hub-logo.svg" alt="OshaHub"/><span>PLATFORM CONTROL</span></a>
      <div className="pa-nav-label">ADMINISTRATION</div>
      <nav>
        {[["overview", "Overview", LayoutDashboard], ["requests", "Business requests", ArrowDownToLine], ["businesses", "Businesses", Building2], ["plans", "Plans & billing", CreditCard]].map(([key, label, Icon]) => <button key={key} className={section === key ? 'active' : ''} onClick={() => setSection(key)}><Icon size={18}/><span>{label}</span>{key === 'requests' && pending.length > 0 && <i>{pending.length}</i>}</button>)}
      </nav>
      <div className="pa-side-bottom"><div className="pa-secure"><ShieldCheck size={17}/><span><b>Restricted access</b><small>Platform owner account</small></span></div><button className="pa-signout" onClick={signOut}><LogOut size={17}/> Sign out</button></div>
    </aside>

    <main className="pa-main">
      <header className="pa-topbar"><div><span>OSHAHUB / PLATFORM</span><ChevronRight size={14}/><b>{sectionLabel(section)}</b></div><div className="pa-user"><span className="pa-avatar">{initials(session.membership.full_name)}</span><span><b>{session.membership.full_name}</b><small>SUPER ADMIN</small></span></div></header>
      <section className="pa-content">
        {notice && <div className="pa-alert success"><Check size={17}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={16}/></button></div>}
        {error && <div className="pa-alert error"><CircleAlert size={17}/>{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={16}/></button></div>}
        {busy && <div className="pa-loading"><LoaderCircle size={15}/> Syncing platform data…</div>}
        {section === 'overview' && <>
          <PageTitle eyebrow="PLATFORM OVERVIEW" title={`Welcome, ${session.membership.full_name.split(' ')[0]}.`} description="Review business access and monitor the OshaHub network."/>
          <div className="pa-metrics"><Metric label="Businesses" value={data.tenants.length} icon={Building2}/><Metric label="Active businesses" value={data.tenants.filter((tenant) => tenant.status === 'ACTIVE' || tenant.status === 'TRIAL').length} icon={Activity}/><Metric label="Awaiting review" value={pending.length} icon={Clock3} highlight/><Metric label="Subscription plans" value={data.plans.filter((plan) => plan.active).length} icon={CreditCard}/></div>
          <section className="pa-panel"><div className="pa-panel-head"><div><h2>New business requests</h2><p>Review and activate incoming business accounts.</p></div><button className="pa-text-button" onClick={() => setSection('requests')}>All requests <ChevronRight size={15}/></button></div><RequestTable requests={pending.slice(0, 5)} onReview={reviewRequest} busy={busy}/></section>
          <section className="pa-panel"><div className="pa-panel-head"><div><h2>Recent businesses</h2><p>Latest accounts registered on the platform.</p></div><button className="pa-text-button" onClick={() => setSection('businesses')}>All businesses <ChevronRight size={15}/></button></div><TenantTable tenants={data.tenants.slice(0, 5)} onStatus={changeTenantStatus}/></section>
        </>}
        {section === 'requests' && <><PageTitle eyebrow="ACCESS REVIEW" title="Business requests" description="Approve or reject requests for a tenant account."/><section className="pa-panel"><RequestTable requests={data.requests} onReview={reviewRequest} busy={busy}/></section></>}
        {section === 'businesses' && <><PageTitle eyebrow="TENANT DIRECTORY" title="Businesses" description="Manage tenant access and monitor account status."/><div className="pa-search"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search business or owner"/></div><section className="pa-panel"><TenantTable tenants={filteredTenants} onStatus={changeTenantStatus}/></section></>}
        {section === 'plans' && <><PageTitle eyebrow="SUBSCRIPTIONS" title="Plans & billing" description="Platform subscription plans and tenant billing status."/><section className="pa-panel"><h2>Plans</h2><div className="pa-table-wrap"><table><thead><tr><th>PLAN</th><th>PRICE / MONTH</th><th>DURATION</th><th>STATUS</th></tr></thead><tbody>{data.plans.map((plan) => <tr key={plan.id}><td><b>{plan.name}</b></td><td>KES {money(plan.price_kes)}</td><td>{plan.duration_days} days</td><td><StatusPill status={plan.active ? 'ACTIVE' : 'SUSPENDED'}/></td></tr>)}</tbody></table>{data.plans.length === 0 && <EmptyState>There are no plans in the platform yet.</EmptyState>}</div><div className="pa-plan-foot">{data.subscriptions.length} tenant subscriptions recorded</div></section></>}
      </section>
    </main>
  </div>;
}

function AdminSignIn({ email, setEmail, password, setPassword, onSubmit, busy, error }) {
  return <main className="pa-login"><section className="pa-login-brand"><a href="/"><img src="/osha-hub-logo.svg" alt="OshaHub"/></a><span>PLATFORM OWNER CONSOLE</span><h1>One platform.<br/>Every car wash.</h1><p>Review tenant applications, manage platform access and oversee subscriptions from a private administrator workspace.</p><div><ShieldCheck size={16}/> ACCESS RESTRICTED TO PLATFORM ADMINS</div></section><section className="pa-login-form-wrap"><form className="pa-login-form" onSubmit={onSubmit}><span className="pa-kicker">SUPER ADMINISTRATION</span><h2>Super Admin sign in</h2><p>Use the platform owner account assigned to you.</p><label>Email address<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@yourbusiness.com"/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password"/></label><button disabled={busy || !supabaseBrowser}>{busy ? 'Signing in…' : 'Sign in to platform'}</button>{!supabaseBrowser && <div className="pa-feedback error"><CircleAlert size={16}/><span>Supabase is not configured. {supabaseConfigMessage}</span></div>}{error && <div className="pa-feedback error"><CircleAlert size={16}/><span>{error}</span></div>}<small>OshaHub platform administration · Authorized accounts only</small></form></section></main>;
}

function PageTitle({ eyebrow, title, description }) { return <div className="pa-page-title"><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>; }
function Metric({ label, value, icon: Icon, highlight }) { return <article className={`pa-metric ${highlight ? 'highlight' : ''}`}><span>{label}</span><strong>{value}</strong><i><Icon size={19}/></i></article>; }
function RequestTable({ requests, onReview, busy }) { return <div className="pa-table-wrap"><table><thead><tr><th>BUSINESS</th><th>OWNER</th><th>PHONE</th><th>STATUS</th><th>RECEIVED</th><th>ACTION</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td><b>{request.tenant_name}</b></td><td>{request.owner_name}</td><td>{request.phone}</td><td><StatusPill status={request.status}/></td><td>{date(request.created_at)}</td><td>{request.status === 'PENDING' ? <div className="pa-actions"><button className="approve" disabled={busy} onClick={() => onReview(request.id, true)}>Approve</button><button className="reject" disabled={busy} onClick={() => onReview(request.id, false)}>Reject</button></div> : <span className="pa-muted">Reviewed</span>}</td></tr>)}</tbody></table>{requests.length === 0 && <EmptyState>No business requests to review.</EmptyState>}</div>; }
function TenantTable({ tenants, onStatus }) { return <div className="pa-table-wrap"><table><thead><tr><th>BUSINESS</th><th>OWNER</th><th>STATUS</th><th>CREATED</th><th>ACCESS</th></tr></thead><tbody>{tenants.map((tenant) => <tr key={tenant.id}><td><b>{tenant.name}</b><small className="pa-id">{tenant.id.slice(0, 8)}</small></td><td>{tenant.owner_name}</td><td><StatusPill status={tenant.status}/></td><td>{date(tenant.created_at)}</td><td><select aria-label={`Change access for ${tenant.name}`} value={tenant.status} onChange={(event) => onStatus(tenant, event.target.value)}><option>TRIAL</option><option>ACTIVE</option><option>EXPIRING SOON</option><option>EXPIRED</option><option>SUSPENDED</option><option>CANCELLED</option></select></td></tr>)}</tbody></table>{tenants.length === 0 && <EmptyState>No businesses are registered yet.</EmptyState>}</div>; }
function StatusPill({ status }) { return <span className={`pa-status ${String(status).toLowerCase().replaceAll(' ', '-')}`}>{status}</span>; }
function EmptyState({ children }) { return <div className="pa-empty">{children}</div>; }
function sectionLabel(section) { return ({ overview: 'Overview', requests: 'Business requests', businesses: 'Businesses', plans: 'Plans & billing' })[section] || 'Overview'; }
function initials(name = '') { return name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'SA'; }
function money(value) { return Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function date(value) { return value ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }
