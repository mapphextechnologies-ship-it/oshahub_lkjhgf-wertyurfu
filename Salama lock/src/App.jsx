import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Check,
  ChevronRight,
  CircleCheck,
  Cloud,
  Copy,
  Download,
  Fingerprint,
  Building2,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  Languages,
  LockKeyhole,
  Menu,
  Mail,
  MessageCircle,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Settings,
  UsersRound,
  UserRound,
  Volume2,
  VolumeX,
  WalletCards,
  Wifi,
  X,
  Zap
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "./index.css";

const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const merchantPricingPlans = [
  { id: "phones-1-10", phones: "1–10", onboarding: "KES 2,000", monthly: "KES 500", firstMonth: "KES 2,500" },
  { id: "phones-11-25", phones: "11–25", onboarding: "KES 5,000", monthly: "KES 1,500", firstMonth: "KES 6,500" },
  { id: "phones-26-50", phones: "26–50", onboarding: "KES 10,000", monthly: "KES 3,500", firstMonth: "KES 13,500" },
  { id: "phones-51-100", phones: "51–100", onboarding: "KES 20,000", monthly: "KES 7,500", firstMonth: "KES 27,500" },
  { id: "phones-101-150", phones: "101–150", onboarding: "KES 35,000", monthly: "KES 15,000", firstMonth: "KES 50,000" },
  { id: "phones-151-300", phones: "151–300", onboarding: "KES 60,000", monthly: "KES 25,000", firstMonth: "KES 85,000" },
  { id: "phones-301-500", phones: "301–500", onboarding: "KES 100,000", monthly: "KES 40,000", firstMonth: "KES 140,000" },
  { id: "phones-501-1000", phones: "501–1,000", onboarding: "KES 180,000", monthly: "KES 70,000", firstMonth: "KES 250,000" },
  { id: "phones-1001-plus", phones: "1,001+", onboarding: "Custom quote", monthly: "Custom quote", firstMonth: "Custom quote" }
];

function merchantPlanStorageKey() {
  let profile = {};
  try { profile = JSON.parse(window.localStorage.getItem("salamaMerchantProfile") || "{}"); } catch { profile = {}; }
  const identity = merchantSlug(window.localStorage.getItem("salamaMerchantLoginIdentity") || profile.username || "merchant");
  return `salamaMerchantPlan:${identity}`;
}

function getMerchantPlan() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(merchantPlanStorageKey()) || "null");
    return stored?.id ? stored : null;
  } catch {
    return null;
  }
}

function saveMerchantPlan(plan) {
  const selection = { ...plan, selectedAt: new Date().toISOString(), status: "Selected" };
  window.localStorage.setItem(merchantPlanStorageKey(), JSON.stringify(selection));
  return selection;
}

function getPendingMerchantPlan() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(`${merchantPlanStorageKey()}:pending`) || "null");
    return stored?.id ? stored : null;
  } catch {
    return null;
  }
}

function planPhoneLimit(plan) {
  if (!plan?.phones || String(plan.phones).includes("+")) return null;
  const values = String(plan.phones).replaceAll(",", "").match(/\d+/g) || [];
  return values.length ? Number(values.at(-1)) : null;
}

function kesNumber(value) {
  return Number(String(value || "").replace(/\D/g, "")) || 0;
}

function calculateUpgradeTopUp(activePhones = 0) {
  if (Number(activePhones) >= 250 && Number(activePhones) <= 600) return 6500;
  return Number(activePhones) > 900 ? 17000 : 15000;
}

function hasActiveSession(authKey) {
  const verified = window.sessionStorage.getItem(authKey) === "verified";
  const lastActive = Number(window.sessionStorage.getItem(`${authKey}At`));
  const active = verified && lastActive > 0 && Date.now() - lastActive < SESSION_TIMEOUT_MS;
  if (!active) {
    window.sessionStorage.removeItem(authKey);
    window.sessionStorage.removeItem(`${authKey}At`);
  }
  return active;
}

function startProtectedSession(authKey) {
  window.sessionStorage.setItem(authKey, "verified");
  window.sessionStorage.setItem(`${authKey}At`, String(Date.now()));
}

const benefits = [
  {
    icon: Cloud,
    eyebrow: "CLOUD NATIVE",
    title: "Zero hardware dependencies",
    text: "Nothing is installed on the customer’s phone. Enroll it securely using only its IMEI."
  },
  {
    icon: ShieldCheck,
    eyebrow: "CAPITAL PROTECTED",
    title: "Your investment stays safe",
    text: "A missed payment locks the phone at system level. It cannot be formatted, bypassed or reset."
  },
  {
    icon: WalletCards,
    eyebrow: "YOUR BUSINESS",
    title: "Keep every shilling earned",
    text: "Payments go directly to your M-Pesa Till or Paybill. We never take a commission."
  }
];

const steps = [
  {
    number: "01",
    icon: ScanLine,
    title: "Create your account",
    text: "Register your shop through the portal or a Salama Lock field agent. Registration is free."
  },
  {
    number: "02",
    icon: WalletCards,
    title: "Connect M-Pesa",
    text: "Link your Till or Paybill. Customer installments continue going directly to your business."
  },
  {
    number: "03",
    icon: Zap,
    title: "Activate your subscription",
    text: "Activate your account for 30 days and enroll unlimited phones with zero per-device fees."
  }
];

const planFeatures = [
  "Unlimited IMEI enrollments",
  "Zero per-phone enrollment fees",
  "Secure merchant admin portal",
  "Automatic M-Pesa payment tracking",
  "Automatic lock and instant unlock",
  "Existing devices stay protected if your plan lapses"
];

function Logo({ dark = false }) {
  return (
    <a className="logo" href="#/" aria-label="Salama Lock home">
      <img src={dark ? "/images/salama-lock-logo-dark.png" : "/images/salama-lock-logo.png"} alt="Salama Lock" />
    </a>
  );
}

function SiteHeader() {
  return (
    <header className="nav-wrap">
      <nav>
        <Logo />
        <div className="nav-links">
          <a href="#/product">Product</a>
          <a href="#/pricing">Pricing</a>
          <a href="#/platforms">Platforms</a>
          <a href="#/developers">Developers</a>
          <a href="#/about">About Us</a>
          <a href="#/faq">FAQ</a>
        </div>
        <div className="nav-tools">
          <button aria-label="Change language"><Languages size={20} /></button>
          <a href="#/merchant-login" aria-label="Merchant login"><UserRound size={22} /></a>
        </div>
        <button className="menu-button" aria-label="Open menu"><Menu /></button>
      </nav>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer>
      <div className="footer-brand">
        <Logo dark />
        <img className="footer-feature-strip" src="/images/footer-feature-strip.png" alt="Lock, unlock, manage and protect devices" />
        <p><strong>Grow Your Sales Safely.</strong><br />Secure phone financing infrastructure built for African retailers.</p>
      </div>
      <div className="footer-columns">
        <div><b>PLATFORM</b><a href="#/product">Product</a><a href="#/platforms">Platforms</a><a href="#/pricing">Pricing</a></div>
        <div><b>MERCHANTS</b><a href="#/pricing">Get started</a><a href="mailto:support@salama.lock">Support</a><a href="#/pricing">Merchant login</a></div>
        <div><b>COMPANY</b><a href="#/about">About us</a><a href="mailto:hello@salama.lock">Contact</a><a href="#/developers">Security</a></div>
        <div><b>LEGAL</b><a href="#/privacy">Privacy policy</a><a href="#/terms">Terms of service</a><a href="https://new.kenyalaw.org/akn/ke/act/2019/24" target="_blank" rel="noreferrer">Data Protection Act</a></div>
        <div><b>FIND US</b><a href="https://www.facebook.com/" target="_blank" rel="noreferrer">Facebook</a><a href="https://www.instagram.com/" target="_blank" rel="noreferrer">Instagram</a><a href="https://www.linkedin.com/" target="_blank" rel="noreferrer">LinkedIn</a></div>
      </div>
      <div className="footer-bottom"><span>© 2026 Salama Lock. All rights reserved.</span><span>Made with purpose in Kenya <b>🇰🇪</b></span></div>
    </footer>
  );
}

function ProtectedLink({ destination, authType, className, children }) {
  const openDestination = (event) => {
    const authKey = authType === "api" ? "salamaApiAuth" : "salamaMerchantAuth";
    if (hasActiveSession(authKey)) {
      event.preventDefault();
      if (destination.startsWith("/docs")) window.location.assign(destination);
      else window.location.hash = destination;
      return;
    }
    event.preventDefault();
    window.sessionStorage.setItem(`${authType}Next`, destination);
    window.location.hash = authType === "api" ? "/api-login" : "/merchant-login";
  };
  const href = destination.startsWith("/docs") ? destination : `#${destination}`;
  return <a className={className} href={href} onClick={openDestination}>{children}</a>;
}

function GoogleIcon() {
  return <svg className="brand-auth-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.12-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.63.39 3.17 1.04 4.55l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.94c1.47 0 2.78.5 3.82 1.49l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"/></svg>;
}

function MicrosoftIcon() {
  return <svg className="brand-auth-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#F25022" d="M2 2h9.5v9.5H2z"/><path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z"/><path fill="#00A4EF" d="M2 12.5h9.5V22H2z"/><path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z"/></svg>;
}

function AuthPage({ mode = "login", authType = "merchant" }) {
  const [step, setStep] = useState("credentials");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const isRegister = mode === "register";
  const isApi = authType === "api";

  const requestOtp = async (event) => {
    event?.preventDefault();
    setError("");
    if (!isApi && event?.currentTarget instanceof HTMLFormElement) {
      const formData = new FormData(event.currentTarget);
      const identity = String(formData.get("username") || "").trim();
      if (identity) window.localStorage.setItem("salamaMerchantLoginIdentity", identity);
    }
    if (isRegister && !isApi && event?.currentTarget instanceof HTMLFormElement) {
      const formData = new FormData(event.currentTarget);
      window.localStorage.setItem("salamaMerchantProfile", JSON.stringify({
        appName: String(formData.get("appName") || "").trim(),
        username: String(formData.get("username") || "").trim(),
        fullName: String(formData.get("fullName") || "").trim()
      }));
    }
    setStep("otp");
  };

  const verifyOtp = (event) => {
    event.preventDefault();
    if (otp !== "123456") {
      setError("Enter the six-digit verification code. For this prototype, use 123456.");
      return;
    }
    const authKey = isApi ? "salamaApiAuth" : "salamaMerchantAuth";
    const nextKey = isApi ? "apiNext" : "merchantNext";
    startProtectedSession(authKey);
    const requestedDestination = window.sessionStorage.getItem(nextKey) || (isApi ? "/docs/api.html" : "/merchant");
    const destination = !isApi && !getMerchantPlan() ? "/merchant-plan-selection" : requestedDestination;
    window.sessionStorage.removeItem(nextKey);
    window.sessionStorage.setItem("salamaSystemDestination", destination);
    window.location.hash = "/system-loading";
  };

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-logo"><Logo dark /></div>
        <div>
          <span className="kicker">{isApi ? "SECURE DEVELOPER ACCESS" : "SECURE MERCHANT ACCESS"}</span>
          <h1>{isApi ? <>Build secure connections.<br /><span>Access the APIs.</span></> : <>Control every device.<br /><span>Protect every sale.</span></>}</h1>
          <p>{isApi ? "This developer identity is used only for Salama Lock API documentation and integration resources." : "This merchant identity is used only for your Salama Lock business profile and merchant workspace."}</p>
        </div>
        <small>Authenticated access · OTP verification · Auditable sessions</small>
      </section>
      <section className="auth-form-panel">
        <div className="auth-card">
          <a className="auth-back" href="#/"><ArrowRight size={15} /> Back to website</a>
          {step === "credentials" ? (
            <>
              <span className="kicker">{isRegister ? (isApi ? "CREATE DEVELOPER ACCOUNT" : "CREATE MERCHANT ACCOUNT") : (isApi ? "DEVELOPER SIGN IN" : "MERCHANT SIGN IN")}</span>
              <h2>{isRegister ? (isApi ? "Register for API access." : "Register your merchant profile.") : (isApi ? "Sign in to View APIs." : "Sign in to your merchant portal.")}</h2>
              <p>{isRegister ? "Create your profile, then verify your identity with a one-time code." : "Use your username or email and password to continue."}</p>
              <div className="social-auth">
                <button type="button" onClick={requestOtp}><GoogleIcon /> Continue with Google</button>
                <button type="button" onClick={requestOtp}><MicrosoftIcon /> Continue with Microsoft</button>
              </div>
              <div className="auth-divider"><span>or continue with credentials</span></div>
              <form onSubmit={requestOtp}>
                {isRegister && <label>Full name<input required name="fullName" type="text" autoComplete="name" placeholder="Your full name" /></label>}
                {isRegister && !isApi && <label>App name<input required name="appName" type="text" placeholder="Your business or app name" /></label>}
                {isRegister && !isApi && <label>Username<input required name="username" type="text" autoComplete="username" placeholder="Choose a username" /></label>}
                {(!isRegister || isApi) && <label>Username or email<input required name="username" type="text" autoComplete="username" placeholder="name@business.com" /></label>}
                {isRegister && <label>Email address<input required name="email" type="email" autoComplete="email" placeholder="name@business.com" /></label>}
                <label>Password<input required name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} minLength={8} placeholder="At least 8 characters" /></label>
                {isRegister && <label>Confirm password<input required type="password" autoComplete="new-password" minLength={8} placeholder="Repeat your password" /></label>}
                {error && <div className="auth-error">{error}</div>}
                <button className="auth-submit" type="submit">{isRegister ? "Create account" : "Continue securely"} <ArrowRight size={17} /></button>
              </form>
              <p className="auth-switch">{isRegister ? "Already have an account?" : "No account yet?"} <a href={isRegister ? `#/${authType}-login` : `#/${authType}-register`}>{isRegister ? "Sign in" : "Register"}</a></p>
            </>
          ) : (
            <form className="otp-form" onSubmit={verifyOtp}>
              <span className="otp-icon"><ShieldCheck size={25} /></span>
              <span className="kicker">TWO-STEP VERIFICATION</span>
              <h2>Enter your OTP.</h2>
              <p>A six-digit security code is required before protected pages can open.</p>
              <label>Verification code<input required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="otp-input" /></label>
              <small className="demo-code">Prototype verification code: <b>123456</b></small>
              {error && <div className="auth-error">{error}</div>}
              <button className="auth-submit" type="submit">Verify and continue <ArrowRight size={17} /></button>
              <button className="auth-text-button" type="button" onClick={() => { setStep("credentials"); setError(""); }}>Use different credentials</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

function MerchantPlaceholder({ view = "dashboard" }) {
  const portalBase = import.meta.env.VITE_PAYGO_PORTAL_URL || "http://localhost:5174";
  const devicePortalBase = (import.meta.env.VITE_DEVICE_ADMIN_URL || "http://localhost:3000").replace(/\/$/, "");
  const dashboardReturnUrl = `${window.location.origin}${window.location.pathname}#/merchant`;
  const [menuOpen, setMenuOpen] = useState(true);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [customerMenuOpen, setCustomerMenuOpen] = useState(false);
  const [liveRecords] = useState({ customers: [], payments: [], loading: false, error: "" });
  const [planWelcome, setPlanWelcome] = useState(() => window.sessionStorage.getItem("salamaPlanWelcome") || "");
  const profile = (() => {
    try {
      return JSON.parse(window.localStorage.getItem("salamaMerchantProfile") || "{}");
    } catch {
      return {};
    }
  })();
  const appName = profile.appName || "Your Salama Business";
  const username = profile.username || "merchant";
  const customerRows = liveRecords.customers;
  const paymentRows = liveRecords.payments;
  const branchMap = customerRows.reduce((branches, customer) => {
    const branch = String(customer.branch || customer.location || customer.region || customer.agentRegion || "Unassigned").trim() || "Unassigned";
    const current = branches.get(branch) || { name: branch, customers: 0, active: 0 };
    current.customers += 1;
    if (!["inactive", "suspended", "rejected"].includes(String(customer.status || customer.repaymentStatus || "active").toLowerCase())) current.active += 1;
    branches.set(branch, current);
    return branches;
  }, new Map());
  const branches = [...branchMap.values()].sort((a, b) => b.customers - a.customers);
  const maximumBranchCustomers = Math.max(...branches.map((branch) => branch.customers), 1);
  const activeDevices = customerRows.filter((customer) => customer.imei || customer.deviceId || customer.serialNumber || customer.phoneImei).length;
  const merchantPlan = getMerchantPlan();
  const planLimit = planPhoneLimit(merchantPlan);
  const planRemaining = planLimit === null ? null : planLimit - activeDevices;
  const planBlocked = planLimit !== null && activeDevices > planLimit;
  const planNearLimit = planLimit !== null && !planBlocked && planRemaining <= 15;
  const monthlyCollections = paymentRows.reduce((sum, payment) => {
    const status = String(payment.status || "").toLowerCase();
    if (status && !["paid", "completed", "success", "verified"].includes(status)) return sum;
    return sum + Number(payment.paidAmount ?? payment.paid_amount ?? payment.amount ?? 0);
  }, 0);
  const formatCompactKes = (amount) => amount >= 1_000_000 ? `KES ${(amount / 1_000_000).toFixed(1)}m` : amount >= 1_000 ? `KES ${Math.round(amount / 1_000)}k` : `KES ${amount.toLocaleString()}`;
  useEffect(() => {
    const authKey = "salamaMerchantAuth";
    if (!hasActiveSession(authKey)) {
      window.sessionStorage.setItem("merchantNext", "/merchant");
      window.location.hash = "/merchant-login";
      return undefined;
    }
    if (!getMerchantPlan()) {
      window.location.hash = "/merchant-plan-selection";
      return undefined;
    }
    const touch = () => window.sessionStorage.setItem(`${authKey}At`, String(Date.now()));
    const events = ["click", "keydown", "pointermove", "scroll"];
    events.forEach((event) => window.addEventListener(event, touch, { passive: true }));
    const timeoutCheck = window.setInterval(() => {
      if (!hasActiveSession(authKey)) window.location.hash = "/merchant-login";
    }, 30000);
    return () => {
      events.forEach((event) => window.removeEventListener(event, touch));
      window.clearInterval(timeoutCheck);
    };
  }, []);
  useEffect(() => {
    if (!planWelcome) return undefined;
    window.sessionStorage.removeItem("salamaPlanWelcome");
    const timeout = window.setTimeout(() => setPlanWelcome(""), 9000);
    return () => window.clearTimeout(timeout);
  }, [planWelcome]);
  return (
    <main className={`merchant-dashboard ${menuOpen ? "" : "menu-collapsed"}`}>
      <aside className="merchant-side-menu">
        <div className="merchant-side-head">
          <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle menu"><Menu size={24}/></button>
          <Logo />
        </div>
        <nav>
          <a className={view === "dashboard" ? "active" : ""} href="#/merchant"><LayoutDashboard/><span>Dashboard</span></a>
          <a href={`${portalBase}/finance-salama-lock?returnTo=${encodeURIComponent(dashboardReturnUrl)}#/login`} target="_blank" rel="noopener noreferrer"><WalletCards/><span>Finance portal</span><ChevronRight/></a>
          <a href={`${portalBase}/admin-salama-lock?returnTo=${encodeURIComponent(dashboardReturnUrl)}#/admin/login`} target="_blank" rel="noopener noreferrer"><ShieldCheck/><span>Admin portal</span><ChevronRight/></a>
          <button className={`merchant-nav-toggle ${agentMenuOpen ? "is-open" : ""}`} type="button" onClick={() => setAgentMenuOpen((open) => !open)}><UsersRound/><span>Agent app</span><ChevronRight/></button>
          {agentMenuOpen && <div className="merchant-nav-submenu">
            <a className={view === "agent-generator" ? "active" : ""} href="#/merchant-agent-app"><span>Generate Agent app</span><ArrowRight/></a>
          </div>}
          <button className={`merchant-nav-toggle ${customerMenuOpen ? "is-open" : ""}`} type="button" onClick={() => setCustomerMenuOpen((open) => !open)}><Smartphone/><span>Customer app</span><ChevronRight/></button>
          {customerMenuOpen && <div className="merchant-nav-submenu">
            <a className={view === "customer-generator" ? "active" : ""} href="#/merchant-customer-app"><span>Generate Customer app</span><ArrowRight/></a>
          </div>}
          <a href={`${devicePortalBase}/login`} target="_blank" rel="noopener noreferrer"><ScanLine/><span>Add device</span><ChevronRight/></a>
          <a className={view === "subscription" ? "active" : ""} href="#/merchant-subscription"><BadgeCheck/><span>Subscription</span><ChevronRight/></a>
        </nav>
        <div className="merchant-side-bottom">
          <a className={view === "settings" ? "active" : ""} href="#/merchant-settings"><Settings/><span>Settings</span><ChevronRight/></a>
          <button type="button" onClick={() => {
            window.sessionStorage.removeItem("salamaMerchantAuth");
            window.sessionStorage.removeItem("salamaMerchantAuthAt");
            window.sessionStorage.removeItem("salamaMerchantApiToken");
            window.location.hash = "/merchant-login";
          }}><LogOut/><span>Logout</span></button>
        </div>
      </aside>
      <section className="merchant-dashboard-main">
        {view === "settings" ? (
          <MerchantSettings appName={appName} username={username} />
        ) : view === "subscription" ? (
          <MerchantSubscription appName={appName} activePhones={activeDevices} />
        ) : view === "agent-generator" ? (
          <MerchantAppGenerator appName={appName} username={username} portalBase={portalBase} appType="Agent" />
        ) : view === "customer-generator" ? (
          <MerchantAppGenerator appName={appName} username={username} portalBase={portalBase} appType="Customer" />
        ) : (
        <>
        {planWelcome && <div className="merchant-plan-welcome"><BadgeCheck size={25}/><div><b>Congratulations! You have chosen the {planWelcome} subscription plan.</b><span>Manage all your workflows under one secure workspace.</span></div><button type="button" onClick={() => setPlanWelcome("")}><X size={17}/></button></div>}
        {planBlocked ? <section className="merchant-account-blocked"><ShieldCheck size={42}/><span>ACCOUNT FLAGGED AND BLOCKED</span><h1>Your active-phone limit has been exceeded.</h1><p>Your {merchantPlan?.phones} plan allows up to {planLimit} active phones. This workspace currently has {activeDevices}. A <b>KES 20,000 plan-breach fine</b> is required before the account can be reviewed and restored.</p><a href="#/merchant-subscription">View subscription and fine</a></section> : <>
        {planNearLimit && <div className="merchant-limit-warning"><BadgeCheck size={21}/><div><b>You are approaching your subscription limit.</b><span>{planRemaining} phone{planRemaining === 1 ? "" : "s"} remaining on the {merchantPlan?.phones} plan. Upgrade before registering more than {planLimit} active phones to avoid account blocking and a KES 20,000 fine.</span></div></div>}
        <header>
          <button type="button" onClick={() => setMenuOpen((open) => !open)}><Menu size={22}/></button>
          <div>
            <span className="kicker">MERCHANT DASHBOARD</span>
            <a className="merchant-dashboard-back" href="#/"><ArrowRight size={14}/> Back to website</a>
            <h1>{appName}</h1>
            <p>Business performance and customer usage across every branch.</p>
          </div>
          <div className="merchant-header-identity"><b>App Name: <span>{appName}</span></b><b>Username: <span>{username}</span></b></div>
        </header>
        <div className={`merchant-live-status ${liveRecords.error ? "has-error" : ""}`}>
          <span>Demo mode</span>
          <small>Live customer data is disconnected and can be connected later.</small>
        </div>
        <div className="merchant-stats">
          <article><Building2/><span>Active branches</span><strong>{branches.length}</strong><small>From registered customers</small></article>
          <article><UsersRound/><span>Total customers</span><strong>{customerRows.length.toLocaleString()}</strong><small>Live registrations</small></article>
          <article><Smartphone/><span>Registered devices</span><strong>{activeDevices.toLocaleString()}</strong><small>Linked customer devices</small></article>
          <article><WalletCards/><span>Total collections</span><strong>{formatCompactKes(monthlyCollections)}</strong><small>Verified payment records</small></article>
        </div>
        <div className="merchant-chart-grid">
          <article className="merchant-chart-card">
            <div><span><b>Registered customers by branch</b><small>Live customer records</small></span><em>{customerRows.length.toLocaleString()} total</em></div>
            <div className="merchant-bars">
              {branches.length ? branches.slice(0, 6).map((branch)=><span key={branch.name} style={{"--bar-height":`${Math.max(8, (branch.customers / maximumBranchCustomers) * 92)}%`}}><i/><b>{branch.customers}</b><small>{branch.name}</small></span>) : <p className="merchant-empty-chart">No registered customer branches yet.</p>}
            </div>
          </article>
          <article className="merchant-chart-card branch-card">
            <div><span><b>Branch activity</b><small>Registered and active customers</small></span></div>
            {branches.length ? branches.slice(0, 5).map((branch)=><p key={branch.name}><span><b>{branch.name}</b><small>{branch.customers} registered customers</small></span><strong>{branch.customers ? Math.round((branch.active / branch.customers) * 100) : 0}%</strong></p>) : <p className="merchant-empty-branch">Branch activity appears when customers register.</p>}
          </article>
        </div>
        </>}
        </>
        )}
      </section>
    </main>
  );
}

function SystemLoadingPage() {
  const [online, setOnline] = useState(window.navigator.onLine);
  const [status, setStatus] = useState(window.navigator.onLine ? "Loading your system…" : "Network is down");
  useEffect(() => {
    const updateNetwork = () => setOnline(window.navigator.onLine);
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    return () => {
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
    };
  }, []);
  useEffect(() => {
    if (!online) {
      setStatus("Network is down");
      return undefined;
    }
    setStatus("Loading your system…");
    const redirectNotice = window.setTimeout(() => setStatus("Redirecting to your workspace…"), 1600);
    const redirect = window.setTimeout(() => {
      const destination = window.sessionStorage.getItem("salamaSystemDestination") || "/merchant";
      window.sessionStorage.removeItem("salamaSystemDestination");
      if (destination.startsWith("/docs")) window.location.href = destination;
      else window.location.hash = destination;
    }, 2600);
    return () => {
      window.clearTimeout(redirectNotice);
      window.clearTimeout(redirect);
    };
  }, [online]);
  return <main className="system-loading-page"><div className="system-loading-brand"><Logo/></div><section><div className="system-loader-mark"><ShieldCheck size={30}/><i/></div><span className="kicker">{online ? "SECURE WORKSPACE" : "CONNECTION REQUIRED"}</span><h1>{status}</h1><p>{online ? "Please wait while Salama Lock prepares your protected merchant tools." : "Check your internet connection. Loading will continue automatically when the network returns."}</p><div className="system-skeleton"><aside><i/><i/><i/><i/><i/></aside><div><i className="system-line"/><span><i/><i/><i/></span><i className="system-panel"/></div></div></section></main>;
}

function merchantSlug(value) {
  return String(value || "merchant").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "merchant";
}

function merchantEnrollmentCode(username) {
  const identity = merchantSlug(username).replace(/-/g, "").toUpperCase().slice(0, 10) || "MERCHANT";
  let checksum = 0;
  for (const character of identity) checksum = ((checksum * 31) + character.charCodeAt(0)) % 10000;
  return `SL-${identity}-${String(checksum).padStart(4, "0")}`;
}

function MerchantAppGenerator({ appName, username, portalBase, appType }) {
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareMode, setShareMode] = useState("sms");
  const [recipient, setRecipient] = useState("");
  const [apkAvailable, setApkAvailable] = useState(false);
  const slug = merchantSlug(`${username}-${appName}`);
  const isCustomerApp = appType === "Customer";
  const enrollmentCode = merchantEnrollmentCode(username);
  const apkUrl = `${portalBase}/downloads/salama-lock-${appType.toLowerCase()}.apk`;
  const appLink = isCustomerApp
    ? (import.meta.env.VITE_CUSTOMER_PLAY_STORE_URL || apkUrl)
    : (import.meta.env.VITE_AGENT_PLAY_STORE_URL || apkUrl);
  const isPhone = /Android|iPhone|iPad|Mobile/i.test(window.navigator.userAgent);
  useEffect(() => {
    fetch(apkUrl, { method: "HEAD" }).then((response) => setApkAvailable(response.ok)).catch(() => setApkAvailable(false));
  }, [apkUrl]);

  const copyLink = async () => {
    await window.navigator.clipboard?.writeText(isCustomerApp ? enrollmentCode : appLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  const share = () => {
    const message = `Open the ${appName} Salama Lock ${appType} app: ${appLink}`;
    if (shareMode === "email") {
      window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(`${appName} ${appType} app`)}&body=${encodeURIComponent(message)}`;
    } else {
      window.location.href = `sms:${encodeURIComponent(recipient)}?body=${encodeURIComponent(message)}`;
    }
  };

  return <div className="merchant-agent-generator">
    <header><span className="kicker">{appType.toUpperCase()} APP GENERATOR</span><h1>{isCustomerApp ? `Customer onboarding for ${appName}.` : `Generate the ${appType} app for ${appName}.`}</h1><p>{isCustomerApp ? "Customers install one Salama Lock app from Google Play and enter this shop code before signing in." : "Create a merchant-specific invitation that identifies this shop when an agent signs in."}</p></header>
    {!generated ? <section className="generator-start-card"><UsersRound size={35}/><div><h2>{appName}</h2><p>Merchant username: <b>{username}</b></p><small>App identity: {slug}</small></div><button type="button" onClick={() => setGenerated(true)}>Generate app access</button></section> : <>
      <section className="generated-app-card">
        <div className="generated-app-icon"><Smartphone size={34}/></div>
        <div><span>GENERATED {appType.toUpperCase()} ACCESS</span><h2>{appName} {appType}</h2><p>{isCustomerApp ? `Give this code to customers during onboarding. Their app will bind to ${appName} before sign-in.` : `Agents entering through this link will see ${appName} as their merchant and shop identity.`}</p></div>
        <BadgeCheck size={28}/>
      </section>
      <section className={`generator-link-card ${isCustomerApp ? "customer-code-card" : ""}`}><label>{isCustomerApp ? "CUSTOMER SHOP CODE" : `Merchant ${appType} app link`}</label><div><input readOnly value={isCustomerApp ? enrollmentCode : appLink}/><button type="button" onClick={copyLink}><Copy size={17}/>{copied ? "Copied" : isCustomerApp ? "Copy code" : "Copy"}</button></div><small>{isCustomerApp ? `Merchant: ${appName} · Username: ${username}` : `Merchant ID: ${slug}`}</small></section>
      {isCustomerApp ? <div className="generator-delivery-grid">
        <section><Smartphone size={25}/><h3>One Play Store app</h3><p>The customer downloads the public Salama Lock Customer app. No merchant link or separate APK is required.</p><span className="generator-device-note">Google Play listing will appear here when the production app is published.</span></section>
        <section><ShieldCheck size={25}/><h3>Agent onboarding</h3><p>The agent gives the customer code <b>{enrollmentCode}</b>. The customer enters it once, confirms {appName}, then signs in.</p></section>
      </div> : <div className="generator-delivery-grid">
        <section><Download size={25}/><h3>Android app</h3><p>Use the same secure APK. The merchant is identified after sign-in and must be enforced by the backend account.</p>{isPhone && apkAvailable ? <a href={apkUrl} download>Download APK</a> : <span className="generator-device-note">{apkAvailable ? "Open this page on an Android phone to download, or share the link." : "The APK download will appear here after the Android build is published."}</span>}</section>
        <section><MessageCircle size={25}/><h3>Send the app link</h3><div className="share-mode"><button className={shareMode === "sms" ? "active" : ""} type="button" onClick={() => setShareMode("sms")}><MessageCircle size={15}/>SMS</button><button className={shareMode === "email" ? "active" : ""} type="button" onClick={() => setShareMode("email")}><Mail size={15}/>Email</button></div><input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder={shareMode === "sms" ? "+254 700 000 000" : "agent@example.com"}/><button className="send-app-link" type="button" disabled={!recipient.trim()} onClick={share}>Send link</button></section>
      </div>}
      <aside className="tenant-security-note"><ShieldCheck size={22}/><div><b>Secure merchant separation</b><p>{isCustomerApp ? "The code selects the merchant during onboarding. In production, the server must validate it, bind the signed-in customer to that merchant, and filter every customer, device, payment, and activity query by merchant ID." : "Customer, inventory, payment, task, and commission isolation must be enforced by merchant ID in the database and every API query before production use."}</p></div></aside>
    </>}
  </div>;
}

function MerchantSettings({ appName, username }) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [values, setValues] = useState({
    appName,
    username,
    email: "",
    phone: "",
    branchAlerts: true,
    paymentAlerts: true,
    customerAlerts: true,
    compactMode: false,
    paymentMode: "paybill",
    paybillNumber: "",
    tillNumber: "",
    accountReference: username
  });

  const update = (field, value) => {
    setSaved(false);
    setValues((current) => ({ ...current, [field]: value }));
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError("");
    const selectedNumber = values.paymentMode === "paybill" ? values.paybillNumber.trim() : values.tillNumber.trim();
    if (!/^\d{5,10}$/.test(selectedNumber)) {
      setSaveError(`Enter a valid M-PESA ${values.paymentMode === "paybill" ? "Paybill" : "Till"} number.`);
      setSaving(false);
      return;
    }
    const current = JSON.parse(window.localStorage.getItem("salamaMerchantProfile") || "{}");
    window.localStorage.setItem("salamaMerchantProfile", JSON.stringify({
      ...current,
      appName: values.appName.trim(),
      username: values.username.trim(),
      email: values.email.trim(),
      phone: values.phone.trim()
    }));
    try {
      const token = window.sessionStorage.getItem("salamaMerchantApiToken") || "";
      const existingResponse = await fetch("/paygo-api/admin/settings/finance", { headers: { Authorization: `Bearer ${token}` } });
      const existingPayload = existingResponse.ok ? await existingResponse.json() : {};
      const existingValues = existingPayload.setting?.values || {};
      const response = await fetch("/paygo-api/admin/settings/finance", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ values: {
          ...existingValues,
          paymentMode: values.paymentMode,
          paybillNumber: values.paymentMode === "paybill" ? values.paybillNumber.trim() : "",
          tillNumber: values.paymentMode === "till" ? values.tillNumber.trim() : "",
          paybillAccountReference: values.accountReference.trim() || username,
          paybillNote: `Pay to ${values.appName.trim()} using account ${values.accountReference.trim() || username}.`
        } })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Payment settings could not be saved.");
      setSaved(true);
    } catch (error) {
      setSaveError(`${error.message} An administrator must approve payment-number changes.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="merchant-settings-page">
      <header>
        <span className="kicker">MERCHANT SETTINGS</span>
        <h1>Settings</h1>
        <p>Manage your business profile, notifications, display, and account security.</p>
      </header>
      <form onSubmit={save}>
        <section className="merchant-settings-card">
          <div><h2>Business profile</h2><p>These details identify your merchant workspace.</p></div>
          <label>App name<input required value={values.appName} onChange={(event) => update("appName", event.target.value)} placeholder="Your business or app name"/></label>
          <label>Username<input required value={values.username} onChange={(event) => update("username", event.target.value)} placeholder="Merchant username"/></label>
          <label>Email address<input type="email" value={values.email} onChange={(event) => update("email", event.target.value)} placeholder="name@business.com"/></label>
          <label>Business phone<input value={values.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+254 700 000 000"/></label>
        </section>
        <section className="merchant-settings-card payment-setup-card">
          <div><h2>M-PESA payment collection</h2><p>Register the Paybill or Till customers will use when paying for financed phones.</p></div>
          <label>Collection method<select value={values.paymentMode} onChange={(event) => update("paymentMode", event.target.value)}><option value="paybill">M-PESA Paybill</option><option value="till">M-PESA Till / Buy Goods</option></select></label>
          {values.paymentMode === "paybill"
            ? <label>Paybill number<input required inputMode="numeric" value={values.paybillNumber} onChange={(event) => update("paybillNumber", event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Enter business Paybill number"/></label>
            : <label>Till number<input required inputMode="numeric" value={values.tillNumber} onChange={(event) => update("tillNumber", event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Enter Buy Goods Till number"/></label>}
          <label>Customer account reference<input required value={values.accountReference} onChange={(event) => update("accountReference", event.target.value)} placeholder={username}/></label>
          <div className="merchant-payment-preview"><b>Customer payment instruction</b><span>{values.paymentMode === "paybill" ? "Go to M-PESA → Lipa na M-PESA → Pay Bill" : "Go to M-PESA → Lipa na M-PESA → Buy Goods"}</span><strong>{values.paymentMode === "paybill" ? `Paybill: ${values.paybillNumber || "Not entered"}` : `Till: ${values.tillNumber || "Not entered"}`}</strong><small>Account: {values.accountReference || username} · Registered to {values.appName}</small></div>
        </section>
        <section className="merchant-settings-card">
          <div><h2>Notifications</h2><p>Choose the operational updates you want to receive.</p></div>
          {[["branchAlerts","Branch activity alerts"],["paymentAlerts","Payment and collection alerts"],["customerAlerts","New customer registration alerts"]].map(([field,label]) => (
            <label className="merchant-setting-toggle" key={field}><span>{label}</span><input type="checkbox" checked={values[field]} onChange={(event) => update(field, event.target.checked)}/></label>
          ))}
        </section>
        <section className="merchant-settings-card">
          <div><h2>Display and security</h2><p>Control dashboard density and secure your session.</p></div>
          <label className="merchant-setting-toggle"><span>Compact dashboard layout</span><input type="checkbox" checked={values.compactMode} onChange={(event) => update("compactMode", event.target.checked)}/></label>
          <button className="merchant-secondary-action" type="button" onClick={() => window.location.hash = "/merchant-login"}>Review sign-in security</button>
        </section>
        <div className="merchant-settings-actions">{saved && <span>Settings and payment collection saved.</span>}{saveError && <span className="settings-save-error">{saveError}</span>}<button type="submit" disabled={saving}>{saving ? "Saving…" : "Save settings"}</button></div>
      </form>
    </div>
  );
}

function MerchantSubscription({ appName, activePhones = 0 }) {
  const [selectedPlan, setSelectedPlan] = useState(getMerchantPlan);
  const [showUpgrades, setShowUpgrades] = useState(false);
  if (!selectedPlan) return null;
  const limit = planPhoneLimit(selectedPlan);
  const remaining = limit === null ? null : limit - activePhones;
  const blocked = limit !== null && activePhones > limit;
  const nearLimit = limit !== null && !blocked && remaining <= 15;
  const selectedIndex = merchantPricingPlans.findIndex((plan) => plan.id === selectedPlan.id);
  const upgradePlans = selectedIndex >= 0 ? merchantPricingPlans.slice(selectedIndex + 1) : [];
  const upgradePlan = (plan) => {
    const upgradeTopUp = calculateUpgradeTopUp(activePhones);
    window.localStorage.setItem(`${merchantPlanStorageKey()}:pending`, JSON.stringify({
      ...plan,
      upgrade: true,
      previousPlanId: selectedPlan.id,
      previousPlanPhones: selectedPlan.phones,
      upgradeTopUp
    }));
    window.location.hash = "/merchant-plan-payment";
  };
  return (
    <div className="merchant-subscription-page">
      <header><span className="kicker">YOUR SUBSCRIPTION</span><h1>{appName} subscription.</h1><p>This is the active-phone plan selected during your first sign-in.</p></header>
      <div className="merchant-selected-plan">
        <div><span>SELECTED PLAN</span><h2>{selectedPlan.phones} active phones</h2><p>Selected {selectedPlan.selectedAt ? new Date(selectedPlan.selectedAt).toLocaleDateString() : "for this merchant account"}.</p></div>
        <BadgeCheck size={34}/>
        <dl><div><dt>Subscription plan</dt><dd>{selectedPlan.firstMonth}</dd></div><div><dt>Monthly subscription</dt><dd>{selectedPlan.monthly}</dd></div></dl>
        <div className="selected-plan-status"><Check size={17}/>{selectedPlan.status || "Selected"} · The {selectedPlan.onboarding} onboarding fee is paid once only. Monthly renewals are {selectedPlan.monthly}.</div>
      </div>
      <section className={`subscription-usage-policy ${blocked ? "is-blocked" : nearLimit ? "is-warning" : ""}`}>
        <div><span>ACTIVE-PHONE USAGE</span><h2>{activePhones}{limit === null ? "" : ` / ${limit}`}</h2><p>{limit === null ? "Custom capacity is confirmed in your merchant agreement." : blocked ? `Limit exceeded by ${activePhones - limit} phone${activePhones - limit === 1 ? "" : "s"}.` : `${remaining} phone${remaining === 1 ? "" : "s"} remaining in this plan.`}</p></div>
        <aside><b>{blocked ? "KES 20,000 fine required" : nearLimit ? "Limit warning" : "Usage within plan"}</b><span>{blocked ? "The workspace is blocked until the plan-breach fine is paid and the account is reviewed." : nearLimit ? "You are within 15 phones of the limit. Upgrade before exceeding it." : "We will warn you when only 15 phone spaces remain."}</span>{upgradePlans.length > 0 && <button className="small-upgrade-button" type="button" onClick={() => setShowUpgrades((visible) => !visible)}>{showUpgrades ? "Close upgrades" : "Upgrade plan"} <ArrowRight size={14}/></button>}</aside>
      </section>
      {showUpgrades && <section className="subscription-upgrade-panel"><div><span className="kicker">AVAILABLE UPGRADES</span><h2>Choose a higher active-phone limit.</h2><p>Upgrade top-up: KES 6,500 for 250–600 active phones, KES 15,000 for other merchants up to 900 phones, and KES 17,000 above 900. The displayed monthly subscription remains unchanged.</p></div><div className="subscription-upgrade-options">{upgradePlans.map((plan) => { const topUp = calculateUpgradeTopUp(activePhones); return <article key={plan.id}><div><b>{plan.phones} active phones</b><span>{plan.monthly} / month</span></div><small>One-time upgrade top-up KES {topUp.toLocaleString()} · Normal plan onboarding {plan.onboarding}</small><button type="button" onClick={() => upgradePlan(plan)}>Upgrade plan</button></article>; })}</div></section>}
      <section className="subscription-enforcement-note"><ShieldCheck size={22}/><div><b>Subscription usage policy</b><p>Registering one or more active phones above the selected plan limit flags and blocks the merchant workspace. Restoring a blocked account requires a KES 20,000 fine and account review. Upgrade before reaching the limit to keep the workspace active.</p></div></section>
    </div>
  );
}

function MerchantPlanSelection() {
  const profile = (() => {
    try { return JSON.parse(window.localStorage.getItem("salamaMerchantProfile") || "{}"); } catch { return {}; }
  })();
  useEffect(() => {
    if (!hasActiveSession("salamaMerchantAuth")) window.location.hash = "/merchant-login";
    else if (getMerchantPlan()) window.location.hash = "/merchant";
  }, []);
  const choosePlan = (plan) => {
    window.localStorage.setItem(`${merchantPlanStorageKey()}:pending`, JSON.stringify(plan));
    window.location.hash = "/merchant-plan-payment";
  };
  return <main className="first-plan-page">
    <div className="first-plan-brandbar"><Logo/></div>
    <header className="first-plan-header"><div><span className="kicker">FIRST-TIME ACCOUNT SETUP</span><a className="first-plan-home-link" href="#/"><ArrowRight size={15}/> Back to homepage</a><h1>Choose your subscription before continuing.</h1><p>Select your expected number of active financed phones. You will not see this selection screen again after choosing.</p></div><aside><b>{profile.appName || "Your Salama Business"}</b><span>@{profile.username || "merchant"}</span></aside></header>
    <section className="first-plan-grid">
      {merchantPricingPlans.map((plan) => <article key={plan.id}>
        <span className="plan-phone-range">{plan.phones} ACTIVE PHONES</span>
        <h2>{plan.monthly}</h2><small>monthly subscription</small>
        <dl><div><dt>Onboarding</dt><dd>{plan.onboarding}</dd></div><div><dt>Subscription plan</dt><dd>{plan.firstMonth}</dd></div></dl>
        <ul><li><Check size={15}/>Merchant dashboard</li><li><Check size={15}/>Admin and Finance portals</li><li><Check size={15}/>Agent and Customer apps</li><li><Check size={15}/>M-PESA tracking</li></ul>
        <button type="button" onClick={() => choosePlan(plan)}>Choose this plan <ArrowRight size={16}/></button>
      </article>)}
    </section>
    <p className="first-plan-footnote">Prices follow the Salama Lock active-phone pricing formula. Custom deployment requirements are confirmed during account review.</p>
  </main>;
}

function MerchantPlanPayment() {
  const plan = getPendingMerchantPlan();
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState("ready");
  const [error, setError] = useState("");
  const [requestReference, setRequestReference] = useState("");
  const paymentEndpoint = import.meta.env.VITE_MERCHANT_SUBSCRIPTION_PAYMENT_URL || "";
  const paymentAmount = plan?.upgrade ? `KES ${Number(plan.upgradeTopUp || 0).toLocaleString()}` : plan?.onboarding;
  const paymentPurpose = plan?.upgrade ? "merchant_plan_upgrade_top_up" : "merchant_onboarding_fee";
  useEffect(() => {
    if (!hasActiveSession("salamaMerchantAuth")) window.location.hash = "/merchant-login";
    else if (!plan) window.location.hash = getMerchantPlan() ? "/merchant" : "/merchant-plan-selection";
  }, []);
  const normalizedPhone = () => {
    const digits = phone.replace(/\D/g, "");
    if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
    if (/^254[17]\d{8}$/.test(digits)) return digits;
    return "";
  };
  const requestStk = async (event) => {
    event.preventDefault();
    const payerPhone = normalizedPhone();
    if (!payerPhone) {
      setError("Enter a valid Safaricom or Airtel phone number.");
      return;
    }
    setError("");
    setStage("sending");
    try {
      if (paymentEndpoint) {
        const response = await fetch(paymentEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: payerPhone, amount: kesNumber(paymentAmount), planId: plan.id, previousPlanId: plan.previousPlanId || null, purpose: paymentPurpose })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || "The M-PESA prompt could not be sent.");
        setRequestReference(result.reference || result.checkoutRequestId || "");
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        setRequestReference(`DEMO-${Date.now()}`);
      }
      setStage("prompted");
    } catch (paymentError) {
      setError(paymentError.message);
      setStage("ready");
    }
  };
  const confirmPayment = async () => {
    setStage("checking");
    setError("");
    try {
      if (paymentEndpoint && requestReference) {
        const response = await fetch(`${paymentEndpoint}?reference=${encodeURIComponent(requestReference)}`);
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !["paid", "completed", "success"].includes(String(result.status || "").toLowerCase())) throw new Error(result.message || "Payment has not been confirmed yet. Complete the M-PESA prompt, then try again.");
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
      saveMerchantPlan(plan);
      window.localStorage.removeItem(`${merchantPlanStorageKey()}:pending`);
      window.sessionStorage.setItem("salamaOnboardingPayment", JSON.stringify({ planId: plan.id, amount: paymentAmount, purpose: paymentPurpose, reference: requestReference, paidAt: new Date().toISOString() }));
      setStage("paid");
      window.setTimeout(() => {
        window.location.hash = "/merchant-plan-redirect";
      }, 4000);
    } catch (paymentError) {
      setError(paymentError.message);
      setStage("prompted");
    }
  };
  if (!plan) return null;
  return <main className="merchant-payment-page">
    {stage === "paid" && <div className="payment-success-toast"><CircleCheck size={22}/><div><b>Payment received successfully</b><span>The payment has been recorded. Returning you to your workspace…</span></div></div>}
    <div className="merchant-payment-brand"><Logo/></div>
    <section className="merchant-payment-layout">
      <div className="merchant-payment-copy"><span className="kicker">{plan.upgrade ? "COMPLETE YOUR PLAN UPGRADE" : "COMPLETE YOUR ONBOARDING"}</span><a href={plan.upgrade ? "#/merchant-subscription" : "#/merchant-plan-selection"}><ArrowRight size={14}/> {plan.upgrade ? "Back to subscription" : "Change subscription plan"}</a><h1>{plan.upgrade ? "Pay the upgrade top-up." : "Pay your onboarding fee."}</h1><p>{plan.upgrade ? `A small one-time onboarding top-up moves you from ${plan.previousPlanPhones} to ${plan.phones} active phones. Your new plan's monthly subscription remains ${plan.monthly}.` : "Complete this payment before we prepare and open your merchant workspace."}</p><div className="payment-plan-summary"><span>{plan.upgrade ? "UPGRADE SUBSCRIPTION" : "SELECTED SUBSCRIPTION"}</span><h2>{plan.phones} active phones</h2><dl><div><dt>{plan.upgrade ? "One-time upgrade top-up" : "Onboarding fee due now"}</dt><dd>{paymentAmount}</dd></div><div><dt>Monthly subscription</dt><dd>{plan.monthly}</dd></div></dl></div></div>
      <div className="stk-payment-card">
        <span className="mpesa-badge" aria-hidden="true" />
        <h2>{stage === "prompted" || stage === "checking" ? "Check your phone." : "Enter number."}</h2>
        {stage === "paid" ? <div className="stk-paid-state"><CircleCheck size={48}/><h2>Payment received.</h2><p>Your payment is recorded successfully. Please return to your workspace.</p><button className="stk-primary" type="button" onClick={() => { window.location.hash = "/merchant-plan-redirect"; }}>Return to workspace <ArrowRight size={16}/></button></div> : stage === "prompted" || stage === "checking" ? <><div className="stk-phone-visual"><Smartphone size={37}/><i/></div><p>An M-PESA payment prompt for <b>{paymentAmount}</b> was sent to <b>+{normalizedPhone()}</b>. Enter your PIN on your phone.</p><button className="stk-primary" type="button" disabled={stage === "checking"} onClick={confirmPayment}>{stage === "checking" ? "Checking payment…" : "I have completed payment"} <ArrowRight size={16}/></button><button className="stk-secondary" type="button" onClick={() => setStage("ready")}>Use a different number</button></> : <form onSubmit={requestStk}><label>Safaricom or Airtel phone number<input autoFocus required value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="07************"/></label><div className="stk-amount"><span>Amount due</span><b>{paymentAmount}</b></div><button className="stk-primary" disabled={stage === "sending"} type="submit">{stage === "sending" ? "Sending STK Push…" : "Send M-PESA prompt"} <ArrowRight size={16}/></button></form>}
        {error && <div className="stk-error">{error}</div>}
        {!paymentEndpoint && <small className="stk-demo-note">Demo payment mode is active. Connect the merchant subscription payment endpoint to verify real Daraja callbacks.</small>}
        <div className="stk-secure"><ShieldCheck size={15}/> Payment must be confirmed before dashboard access.</div>
      </div>
    </section>
  </main>;
}

function MerchantPlanRedirect() {
  const selectedPlan = getMerchantPlan();
  useEffect(() => {
    if (!hasActiveSession("salamaMerchantAuth")) {
      window.location.hash = "/merchant-login";
      return undefined;
    }
    if (!selectedPlan) {
      window.location.hash = "/merchant-plan-selection";
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      window.sessionStorage.setItem("salamaPlanWelcome", `${selectedPlan.phones} active phones`);
      window.location.hash = "/merchant";
    }, 5500);
    return () => window.clearTimeout(timeout);
  }, [selectedPlan?.id]);
  return <main className="plan-redirect-page">
    <div className="plan-redirect-logo"><Logo dark/></div>
    <section>
      <span className="plan-loader"><i/><i/><i/></span>
      <span className="kicker">PREPARING YOUR WORKSPACE</span>
      <h1>Please wait while we redirect you.</h1>
      <p>Your <b>{selectedPlan?.phones || ""} active phones</b> subscription is being attached to your merchant workspace.</p>
      <div className="workspace-skeleton"><div className="skeleton-side"><i/><i/><i/><i/></div><div className="skeleton-main"><i className="wide"/><span><i/><i/><i/></span><i className="tall"/></div></div>
      <small>This normally takes only a few seconds.</small>
    </section>
  </main>;
}

function DashboardMockup() {
  return (
    <div className="product-scene" aria-label="Salama Lock merchant dashboard preview">
      <div className="orb orb-one" />
      <div className="orb orb-two" />
      <div className="dashboard-shell">
        <div className="dash-sidebar">
          <span className="mini-logo"><LockKeyhole size={14} /></span>
          <span className="side-active"><BarChart3 size={15} /></span>
          <Smartphone size={15} />
          <WalletCards size={15} />
          <ShieldCheck size={15} />
        </div>
        <div className="dash-main">
          <div className="dash-top">
            <div><small>OVERVIEW</small><strong>Good morning, Amani</strong></div>
            <span className="avatar">AM</span>
          </div>
          <div className="stat-grid">
            <div><small>Active devices</small><strong>1,248</strong><em>+12.4%</em></div>
            <div><small>Collected this month</small><strong>KES 842k</strong><em>+8.1%</em></div>
            <div><small>Repayment rate</small><strong>96.8%</strong><em>Healthy</em></div>
          </div>
          <div className="dash-panels">
            <div className="chart-card">
              <div className="panel-title"><span>Payment activity</span><small>Last 7 days</small></div>
              <div className="chart">
                <span style={{ height: "35%" }} /><span style={{ height: "53%" }} />
                <span style={{ height: "46%" }} /><span style={{ height: "72%" }} />
                <span style={{ height: "61%" }} /><span style={{ height: "88%" }} />
                <span style={{ height: "78%" }} />
              </div>
            </div>
            <div className="activity-card">
              <div className="panel-title"><span>Recent</span></div>
              {["Payment received", "Device enrolled", "Device unlocked"].map((item, i) => (
                <div className="activity-row" key={item}>
                  <span><CircleCheck size={12} /></span>
                  <div><b>{item}</b><small>{i === 0 ? "KES 2,400" : i === 1 ? "Samsung A16" : "IMEI ••4812"}</small></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="phone">
        <div className="phone-screen">
          <div className="phone-bar"><span>9:41</span><Wifi size={10} /></div>
          <div className="phone-logo"><span className="mini-logo"><LockKeyhole size={12} /></span> Salama Lock</div>
          <div className="phone-status">
            <span className="status-ring"><Check size={22} /></span>
            <small>DEVICE STATUS</small>
            <strong>Active & secure</strong>
            <p>Samsung Galaxy A16</p>
          </div>
          <div className="payment-note"><span><BadgeCheck size={14} /></span><div><small>LAST PAYMENT</small><b>KES 2,400 received</b></div></div>
          <div className="phone-button">View payment plan</div>
        </div>
      </div>
      <div className="float-chip chip-one"><span><Fingerprint size={16} /></span><div><small>DEVICE VERIFIED</small><b>IMEI protected</b></div></div>
      <div className="float-chip chip-two"><span><BadgeCheck size={16} /></span><div><small>M-PESA PAYMENT</small><b>Received instantly</b></div></div>
    </div>
  );
}

function Home() {
  const [videoStarted, setVideoStarted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);
  const heroVideo = useRef(null);

  useEffect(() => {
    if (videoStarted) return undefined;
    const timer = window.setTimeout(() => setVideoStarted(true), 4500);
    return () => window.clearTimeout(timer);
  }, [videoStarted]);

  const toggleVideoSound = () => {
    const nextMuted = !videoMuted;
    setVideoMuted(nextMuted);
    if (heroVideo.current) {
      heroVideo.current.muted = nextMuted;
      heroVideo.current.play().catch(() => {});
    }
  };

  return (
    <main id="top">
      <SiteHeader />

      <section className="hero">
        {videoStarted && (
          <video
            ref={heroVideo}
            className="hero-commercial"
            src="/videos/SalamaLock_Combined_Promo.mp4"
            autoPlay
            playsInline
            muted={videoMuted}
            preload="auto"
            onEnded={() => setVideoStarted(false)}
          />
        )}
        <div className="hero-bubbles" aria-hidden="true">
          <span /><span /><span /><span /><span /><span /><span /><span />
        </div>
        {videoStarted && (
          <button className="hero-sound-button" type="button" onClick={toggleVideoSound}>
            {videoMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            {videoMuted ? "Turn sound on" : "Sound on"}
          </button>
        )}
        <div className="hero-copy">
          <div className="pill"><span /> Smarter phone financing</div>
          <h1>Sell more phones.<br />Risk <span>nothing.</span></h1>
          <p>Run your own Lipa Mdogo Mdogo business with secure cloud technology—safely, easily and independently.</p>
          <div className="hero-actions">
            <a className="primary-button" href="#/merchant-login">Start your merchant profile <ArrowRight size={18} /></a>
            <a className="text-button" href="#/how-it-works"><span><ChevronRight size={17} /></span> See how it works</a>
          </div>
          <div className="hero-proof">
            <div className="avatar-stack"><span>JM</span><span>AK</span><span>MO</span><span>+</span></div>
            <div><div className="stars">★★★★★</div><small>Trusted by independent retailers</small></div>
          </div>
        </div>
        <div className="hero-white-panel">
          <div className="hero-device-card">
            <span className="device-icon"><Smartphone size={20} /></span>
            <small>LIVE DEVICE CONTROL</small>
            <strong>1,248 phones protected</strong>
            <p><span /> All systems operational</p>
          </div>
          <div className="hero-payment-card">
            <BadgeCheck size={19} />
            <div><small>M-PESA PAYMENT</small><strong>KES 2,400 received</strong></div>
          </div>
          <div className="hero-phone-outline">
            <div className="outline-speaker" />
            <LockKeyhole size={42} />
            <small>SALAMA LOCK</small>
            <strong>Device secure</strong>
          </div>
        </div>
      </section>

      <section className="trust-strip">
        <p>BUILT FOR THE SYSTEMS YOU ALREADY USE</p>
        <div>
          <span className="mpesa-word">M‑PESA</span>
          <span><ShieldCheck /> Secure Cloud</span>
          <span><Cloud /> Android Enterprise</span>
          <span><BadgeCheck /> Data compliant</span>
        </div>
      </section>

      <section className="section benefits" id="benefits">
        <div className="section-heading">
          <div><span className="kicker">THE SALAMA LOCK SOLUTION</span><h2>Run your own installment<br /><em>phone business safely.</em></h2></div>
          <p>We do not sell phones or lend money. We give independent merchants the technology to offer installment plans safely.</p>
        </div>
        <div className="benefit-grid">
          {benefits.map(({ icon: Icon, eyebrow, title, text }) => (
            <article key={title}>
              <div className="card-icon"><Icon size={24} /></div>
              <small>{eyebrow}</small>
              <h3>{title}</h3>
              <p>{text}</p>
              <a href="#how">Learn more <ArrowRight size={14} /></a>
            </article>
          ))}
        </div>
      </section>

      <section className="section how" id="how">
        <div className="center-heading">
          <span className="kicker">FROM BOX TO BUSINESS</span>
          <h2>Start in three simple steps.</h2>
          <p>Free registration. Your own M-Pesa. One flat subscription.</p>
        </div>
        <div className="steps">
          {steps.map(({ number, icon: Icon, title, text }, index) => (
            <article key={number}>
              <div className="step-top"><span className="step-icon"><Icon size={24} /></span><b>{number}</b></div>
              <h3>{title}</h3><p>{text}</p>
              {index < 2 && <span className="connector"><ArrowRight size={16} /></span>}
            </article>
          ))}
        </div>
      </section>

      <section className="control-band">
        <div>
          <span className="kicker">TOTAL CONTROL</span>
          <h2>Hands-free payment collection.</h2>
          <p>Every payment updates the ledger automatically. Phones unlock instantly when payment lands and lock when payment is missed.</p>
          <div className="mini-features">
            <span><Check /> Real-time alerts</span><span><Check /> Automated locking</span>
            <span><Check /> Live analytics</span><span><Check /> Secure by design</span>
          </div>
        </div>
        <div className="lock-visual">
          <span className="lock-halo" />
          <div className="lock-core"><LockKeyhole size={38} /><small>PROTECTION STATUS</small><b>All systems secure</b></div>
          <span className="orbit orbit-a">M‑PESA</span>
          <span className="orbit orbit-b">IMEI</span>
          <span className="orbit orbit-c"><ShieldCheck size={15} /> 256-bit</span>
        </div>
      </section>

      <section className="section pricing" id="pricing">
        <div className="pricing-copy">
          <span className="kicker">ONE SIMPLE PLAN</span>
          <h2>One price.<br />No hidden fees.</h2>
          <p>A flat monthly subscription activates unlimited phone enrollments, with no commission on your sales or interest.</p>
          <div className="quote"><p>Payments go straight to your own Till or Paybill. Salama Lock only reads the payment confirmation.</p><small>Your cash always remains yours.</small></div>
        </div>
        <div className="price-card">
          <div className="popular">UNLIMITED ENROLLMENTS</div>
          <small>UNLIMITED RETAIL PLAN</small>
          <a className="price-more-button" href="#/pricing-more">More About Pricing <ArrowRight size={17}/></a>
          <p>Everything your shop needs to sell devices safely.</p>
          <ul>{planFeatures.map((feature) => <li key={feature}><Check size={15} /> {feature}</li>)}</ul>
          <a className="primary-button" href="#/merchant-login">Activate your 30-day subscription <ArrowRight size={17} /></a>
          <div className="no-card"><ShieldCheck size={14} /> Secure onboarding. Cancel anytime.</div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

const pageContent = {
  product: {
    kicker: "OUR PRODUCT & TECHNOLOGY",
    title: "Cloud-to-Cloud Device Management Infrastructure",
    intro: "Salama Lock connects your retail workflow directly to smartphone manufacturer clouds over-the-air. Merchant Portal → Manufacturer Cloud → Smartphone (IMEI). No physical application setup required. Dedicated portals for finance teams, customers, field agents and back-office management bring device deployments, user accounts and smartphone sales into one centralized control center.",
    items: [
      ["Zero-Touch IMEI Enrollment", "Scan or type an IMEI in the admin portal. The device configures itself when it connects to the internet."],
      ["Firmware-Level & Cloud-Based Security", "Native manufacturer cloud connections place protection deep within the operating system."],
      ["Merchant Admin Portal", "Register IMEIs, track device status, manage customer profiles and monitor your entire device portfolio from one dashboard."],
      ["Field Agent Portal", "Register devices and enroll new IMEIs quickly from one dedicated portal."],
      ["Finance Portal", "Review customer ledgers, account balances, schedules and device status from one centralized dashboard."],
      ["Customer Portal", "Give customers clear device status and support information, with a branded restriction screen and instant remote unlock."]
    ]
  },
  pricing: {
    kicker: "TRANSPARENT PRICING MODEL",
    title: "Pricing that reflects your real operation.",
    intro: "Salama Lock pricing combines one-time onboarding, monthly running costs, active-device usage and a sustainable service margin. The figures below are illustrative; each merchant receives a quote based on their deployment requirements.",
    items: [
      ["Onboarding fee", "Setup Cost + Training Cost + Integration Cost + Desired Profit. Example: 10,000 + 5,000 + 10,000 + 15,000 = KES 40,000."],
      ["Monthly subscription", "(Active Phones × Cost per Phone) + Fixed Monthly Costs + Monthly Profit. For 200 phones: (200 × 50) + 5,000 + 10,000 = KES 25,000."],
      ["First-month payment", "Onboarding Fee + Monthly Subscription. Example: KES 40,000 + KES 25,000 = KES 65,000."],
      ["Profit calculation", "Total Revenue − Total Expenses. Example: KES 65,000 − KES 30,000 = KES 35,000."],
      ["Recommended formula", "P = S + M + (N × C) + R, where P is final price, S setup, M fixed monthly expenses, N active phones, C cost per phone and R desired profit."],
      ["ERP-led onboarding", "The ERP registers the retailer, creates the customer profile, captures KYC, selects the phone and financing plan, and records approval before device enrollment."]
    ]
  },
  "pricing-more": {
    kicker: "PRICING DETAILS",
    title: "Build a sustainable merchant quote.",
    intro: "Use the Salama Lock pricing framework to separate one-time deployment costs from recurring operating costs and active-device usage.",
    items: [
      ["Step 1 · Calculate onboarding", "Add setup, staff training, integration and the desired implementation margin. Example: KES 10,000 + 5,000 + 10,000 + 15,000 = KES 40,000."],
      ["Step 2 · Calculate monthly service", "Multiply active phones by the per-phone operating cost, then add fixed monthly expenses and monthly profit."],
      ["Step 3 · Calculate the first month", "Add the onboarding fee to the monthly subscription. Using the examples provided, the first-month total is KES 65,000."],
      ["Step 4 · Confirm profitability", "Subtract total expenses from total revenue so the quote covers delivery costs and remains commercially sustainable."],
      ["Full formula", "Customer Price = Setup Costs + Monthly Running Costs + Phone Usage Cost + Profit Margin. In shorthand: P = S + M + (N × C) + R."],
      ["Worked example", "P = 20,000 + 5,000 + (200 × 50) + 15,000 = KES 50,000 for the first month."],
      ["ERP registration", "Register the retailer or company and create the customer profile with name, ID, phone, address and next of kin."],
      ["ERP KYC and approval", "Capture ID, photo and agreement documents, select the phone and financing plan, then record the financing approval."]
    ]
  },
  platforms: {
    kicker: "CLOUD-TO-CLOUD",
    title: "Built to connect with the systems retailers use.",
    intro: "The platform links merchant tools, payment rails and manufacturer clouds through secure integrations.",
    items: [
      ["M-Pesa", "Connect your existing Till or Paybill while customer payments continue going directly to you."],
      ["Manufacturer cloud", "Authenticated over-the-air commands support secure system-level lock and unlock."],
      ["Android Enterprise", "The architecture is designed to extend across compatible manufacturers and device ecosystems."]
    ]
  },
  developers: {
    kicker: "SECURE INFRASTRUCTURE",
    title: "Reliable APIs, callbacks and audit trails.",
    intro: "Salama Lock APIs give approved partners secure endpoints for enrolling and managing devices. Every API request is authenticated with controlled credentials and role-based permissions. Versioned lock and unlock endpoints deliver authorized commands to connected device services. Payment callback APIs receive status events and synchronize device records automatically. Correlation identifiers and audit logs make every API operation traceable from request to response. Consistent response formats and documented error codes help integration teams build dependable connections.",
    items: [
      ["Payment callbacks", "Automated M-Pesa events reconcile installments and initiate device status changes."],
      ["Authenticated commands", "Lock and unlock requests are signed and authorized to prevent spoofed instructions."],
      ["Immutable logs", "Every payment, lock and unlock event is recorded for support and dispute resolution."]
    ]
  },
  about: {
    kicker: "ABOUT SALAMA LOCK",
    title: "Frictionless cloud deployment for independent retailers.",
    intro: "Salama Lock is a B2B SaaS technology platform—not a lender or phone seller. It gives independent retailers a secure, lightweight web system for running their own device installment operations without physical servers, complex app installations or manual status tracking.",
    items: [
      ["Our mission", "To empower independent African phone retailers with secure cloud infrastructure for managing device installments while keeping ownership of their customers, cash flow and business growth."],
      ["Our vision", "To become Africa’s trusted operating system for device financing—expanding responsible smartphone access while protecting the retailers who make it possible."],
      ["01 · Onboard your shop", "Register your business and activate dedicated Admin, Finance, Back Office, Agent and Customer portals with your own M-Pesa Till or Paybill workflow."],
      ["02 · Scan and enroll", "Use a phone or computer to scan or enter the device IMEI, add the customer schedule and connect the device securely to the cloud."],
      ["03 · Automate enforcement", "Payment callbacks update the customer ledger and trigger authorized over-the-air lock or unlock commands without manual tracking."],
      ["Firmware-level protection", "Manufacturer-cloud integrations place device controls beyond ordinary app removal, SIM swaps, safe mode and standard factory resets."],
      ["Direct merchant cash flow", "Customer payments go directly to the retailer’s own M-Pesa account. Salama Lock reads the confirmation needed to update device status."],
      ["Private, isolated operations", "Each retailer’s customers, devices, inventory and business records remain separated through role-based tenant controls and a minimal-data architecture."]
    ]
  },
  "about-more": {
    kicker: "MORE ABOUT SALAMA LOCK",
    title: "Sell more phones. Risk nothing.",
    intro: "Salama Lock is a premier B2B cloud infrastructure platform built for independent smartphone retailers and wholesalers across Kenya. We do not sell devices or issue consumer credit. We provide the connected software portals and cloud locking technology that help local businesses operate their own Lipa Mdogo Mdogo programs confidently.",
    items: [
      ["Our mission", "To give independent retailers the secure technology, operational control and confidence required to grow their device businesses."],
      ["The Salama manifesto", "We believe an independent shop on Luthuli Avenue or River Road deserves the same enterprise-grade security as a multi-million-shilling institution."],
      ["Why Salama Lock was built", "Local smartphone dealers should not have to surrender their customers or margins to large third-party networks. Salama Lock removes technical barriers and puts control back into the merchant’s hands."],
      ["Five connected portals", "Admin handles IMEI registration; Finance tracks ledgers and cash flow; Back Office manages stock; Agent supports field teams; and Customer provides a lightweight self-service experience."],
      ["01 · Onboard your shop suite", "Register your business profile, activate your isolated portal environment and connect your own M-Pesa Till or Paybill workflow."],
      ["02 · Scan and enroll", "Scan or type the device IMEI, add the customer schedule and let the phone connect securely to the cloud over cellular data or Wi-Fi."],
      ["03 · Automate device status", "Payment callbacks update the ledger and send authorized over-the-air status commands. If a scheduled deadline passes, the connected cloud can restrict the device until payment clears."],
      ["Firmware-level security", "Manufacturer-cloud connections are designed to resist ordinary bypass attempts such as SIM changes, safe mode and standard factory resets."],
      ["100% direct cash flow", "Buyer payments go directly to the retailer’s own M-Pesa Till or Paybill. Salama Lock reads the receipt confirmation needed to update the device record."],
      ["Tenant protection", "Each shop’s customers, inventory, device records and business data remain isolated from every other merchant on the platform."],
      ["Lightweight web architecture", "Secure browser-based portals reduce device storage requirements and give teams access from phones or computers without heavy native applications."],
      ["Our promise", "Merchants retain control of their retail margins, customer relationships and inventory while Salama Lock provides the infrastructure that supports safer growth."]
    ]
  },
  faq: {
    kicker: "FREQUENTLY ASKED QUESTIONS",
    title: "Clear answers for shop owners.",
    intro: "The essentials from the Salama Lock Merchant Operational Manual.",
    items: [
      ["What happens if my subscription expires?", "Your portal becomes read-only, but previously enrolled phones remain protected and continue unlocking after payment."],
      ["Can a customer bypass the lock?", "No. The system-level cloud lock checks in when the phone connects to a network or Wi-Fi."],
      ["Does Salama Lock take a commission?", "No. You pay only the flat monthly subscription and keep everything else you collect."]
    ]
  },
  privacy: {
    kicker: "PRIVACY POLICY",
    title: "Your business and customer data stay protected.",
    intro: "Salama Lock deliberately limits the information it processes to support device enrollment, payments and account administration.",
    items: [
      ["Minimal data", "The platform processes device identifiers, payment timestamps and balance records required to operate the service."],
      ["No personal content", "Salama Lock does not track or store customer files, messages, contacts or location information."],
      ["Limited retention", "Payment and device event logs are retained only as needed for operations, disputes and regulatory reporting."]
    ]
  },
  terms: {
    kicker: "MERCHANT TERMS",
    title: "Clear rules for responsible platform use.",
    intro: "These plain-language points summarize the merchant principles in the Salama Lock Business Blueprint.",
    items: [
      ["Acceptable use", "Merchants may use device locking only for legitimate defaults under their customer payment agreements."],
      ["Subscription", "The service is billed monthly per shop. A lapse makes the portal read-only until the subscription is renewed."],
      ["Dispute resolution", "Disputed payment or device events are reviewed against the platform audit log with merchant cooperation."]
    ]
  },
  "data-protection": {
    kicker: "DATA PROTECTION",
    title: "Privacy by design, with a minimal data footprint.",
    intro: "Salama Lock is designed around the principles of the Kenya Data Protection Act and conservative data handling.",
    items: [
      ["Encrypted communication", "Traffic between merchant portals, Salama Lock services and connected platforms is encrypted in transit."],
      ["Role-based access", "Merchant staff accounts receive only the permissions required for their assigned responsibilities."],
      ["Auditable events", "Payment, lock and unlock events are logged to support accountability and dispute resolution."]
    ]
  }
};

function InfoPage({ page }) {
  const content = pageContent[page];
  const [productVideoStarted, setProductVideoStarted] = useState(false);
  const [productVideoMuted, setProductVideoMuted] = useState(true);
  const productVideo = useRef(null);
  const [pricingVideoMuted, setPricingVideoMuted] = useState(true);
  const pricingVideo = useRef(null);

  useEffect(() => {
    if (page !== "product" || productVideoStarted) return undefined;
    const timer = window.setTimeout(() => setProductVideoStarted(true), 4500);
    return () => window.clearTimeout(timer);
  }, [page, productVideoStarted]);

  const toggleProductSound = () => {
    const nextMuted = !productVideoMuted;
    setProductVideoMuted(nextMuted);
    if (productVideo.current) {
      productVideo.current.muted = nextMuted;
      productVideo.current.play().catch(() => {});
    }
  };

  const togglePricingSound = () => {
    const nextMuted = !pricingVideoMuted;
    setPricingVideoMuted(nextMuted);
    if (pricingVideo.current) {
      pricingVideo.current.muted = nextMuted;
      pricingVideo.current.play().catch(() => {});
    }
  };

  return (
    <main className={`info-page ${page}-page`}>
      <SiteHeader />
      <section className={`info-hero ${page === "product" ? "product-visual" : ""}`}>
        {["product","pricing","platforms","developers","about"].includes(page) && <div className={`info-white-pattern ${page}-pattern`} aria-hidden="true" />}
        {page === "pricing" && (
          <>
            <video ref={pricingVideo} className="pricing-commercial" src="/videos/SalamaLock_Full_payments.mp4" autoPlay loop playsInline muted={pricingVideoMuted} preload="auto" />
            <button className="pricing-sound-button" type="button" onClick={togglePricingSound}>
              {pricingVideoMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              {pricingVideoMuted ? "Turn sound on" : "Sound on"}
            </button>
          </>
        )}
        {page === "product" && productVideoStarted && (
          <video
            ref={productVideo}
            className="product-commercial"
            src="/videos/SalamaLock_United.mp4"
            autoPlay
            playsInline
            muted={productVideoMuted}
            preload="auto"
            onEnded={() => setProductVideoStarted(false)}
          />
        )}
        {page === "product" && productVideoStarted && (
          <button className="product-sound-button" type="button" onClick={toggleProductSound}>
            {productVideoMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            {productVideoMuted ? "Turn sound on" : "Sound on"}
          </button>
        )}
        <div className="info-copy">
          <a className="back-home" href="#/"><ArrowRight size={15} /> Back to home</a>
          <span className="kicker">{content.kicker}</span>
          <h1>{content.title}</h1>
          <p>{content.intro}</p>
        </div>
        {page === "developers" && (
          <ProtectedLink className="api-doc-button developers-api-button" destination="/docs/api.html" authType="api">
            View APIs <ArrowRight size={16} />
          </ProtectedLink>
        )}
        {page === "pricing" && (
          <a className="api-doc-button pricing-details-button" href="#/pricing-more">
            More About Pricing <ArrowRight size={16} />
          </a>
        )}
        {page === "about" && (
          <a className="api-doc-button more-about-button" href="#/about-more">
            More About Us <ArrowRight size={16} />
          </a>
        )}
        {page === "developers" && (
          <img
            className="developers-architecture"
            src="/images/salama-system-architecture.png"
            alt="Salama Lock system architecture connecting the admin, finance, ERP, agent, customer and manufacturer cloud portals"
          />
        )}
        <div className="info-grid">
          {content.items.map(([title, text], index) => (
            <article key={title}><b>{String(index + 1).padStart(2, "0")}</b><h2>{title}</h2><p>{text}</p></article>
          ))}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

const pricingTiers = merchantPricingPlans.map((plan) => [
  plan.phones,
  plan.onboarding.replace("KES ", ""),
  plan.monthly.replace("KES ", ""),
  plan.firstMonth.replace("KES ", "")
]);

function PricingFormulaPage() {
  return (
    <main className="pricing-formula-page">
      <SiteHeader />
      <div className="pricing-sheet-toolbar">
        <a className="back-home" href="#/pricing"><ArrowRight size={15} /> Back to pricing</a>
        <a className="pricing-pdf-download" href="/downloads/salama-lock-pricing-formula-sheet.pdf" download>
          <Download size={17} /> Download PDF
        </a>
      </div>
      <section className="pricing-formula-sheet">
        <header className="sheet-heading">
          <Logo />
          <div><h1>PRICING &amp; FORMULA SHEET</h1><p>Subscription pricing tiers, cost-recovery formulas, and onboarding workflow at a glance.</p></div>
        </header>

        <div className="sheet-section-title">PRICING TABLE <small>(by Active Phones)</small></div>
        <div className="sheet-table-wrap">
          <table><thead><tr><th>Active Phones</th><th>Onboarding Fee (KES)</th><th>Monthly Subscription (KES)</th><th>First Month Total (KES)</th></tr></thead>
            <tbody>{pricingTiers.map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>

        <div className="sheet-section-title">PRICING FORMULAS</div>
        <div className="sheet-table-wrap formula-table">
          <table><thead><tr><th>Formula</th><th>Equation</th><th>Worked Example</th></tr></thead><tbody>
            <tr><td>1. Onboarding Fee</td><td>Setup + Training + Integration + Profit</td><td>10,000 + 5,000 + 10,000 + 15,000 = <b>KES 40,000</b></td></tr>
            <tr><td>2. Monthly Subscription</td><td>(Phones × Cost/Phone) + Fixed Costs + Profit</td><td>(200 × 50) + 5,000 + 10,000 = <b>KES 25,000</b></td></tr>
            <tr><td>3. First-Month Total</td><td>Onboarding Fee + Monthly Subscription</td><td>40,000 + 25,000 = <b>KES 65,000</b></td></tr>
            <tr><td>4. Full Price Formula</td><td>P = S + M + (N × C) + R</td><td>20,000 + 5,000 + (200 × 50) + 15,000 = <b>KES 50,000</b></td></tr>
          </tbody></table>
        </div>
        <p className="formula-key"><b>Key:</b> P = Final Price · S = Setup/Onboarding Cost · M = Monthly Fixed Costs · N = Active Phones · C = Cost per Phone · R = Desired Profit</p>

        <div className="sheet-cover-grid">
          <article><h2>ONE-TIME ONBOARDING FEE COVERS</h2><ul><li>Device onboarding and IMEI registry</li><li>ERP setup and onboarding workflow</li><li>User accounts for Admin, Finance, Agent, Customer and Super Admin</li><li>API integration and M-Pesa callbacks</li><li>Initial configuration, staff training and go-live support</li></ul></article>
          <article><h2>MONTHLY SUBSCRIPTION COVERS</h2><ul><li>Cloud hosting and database storage</li><li>Device monitoring and security updates</li><li>M-Pesa callbacks and messaging</li><li>Technical support and software updates</li><li>Profit for Salama Lock</li></ul></article>
        </div>

        <div className="sheet-section-title">ONBOARDING &amp; SYSTEM FLOW</div>
        <div className="sheet-flow">
          <span><b>ERP</b><small>Customer &amp; Financing</small></span><i>→</i>
          <span><b>Salama Lock Cloud</b><small>IMEI Onboard</small></span><i>→</i>
          <span><b>Manufacturer Cloud</b><small>Knox / Android</small></span><i>→</i>
          <span><b>Locked Device</b><small>Unlock after status update</small></span>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

const learningVideos = [
  {
    src: "/videos/SalamaLock_Combined_Promo.mp4",
    kicker: "PLATFORM OVERVIEW",
    title: "Meet Salama Lock",
    text: "See how the platform brings merchant operations, device protection, payments and customer workflows into one secure system.",
    points: ["Merchant workspace overview", "Secure device financing", "Connected operational tools"]
  },
  {
    src: "/videos/SalamaLock_Full_payments.mp4",
    kicker: "PAYMENTS",
    title: "Understand the payment workflow",
    text: "Learn how customer payments move through the merchant’s own M-PESA collection setup and update account activity.",
    points: ["M-PESA payment prompts", "Payment confirmation", "Account and device updates"]
  },
  {
    src: "/videos/SalamaLock_United.mp4",
    kicker: "CONNECTED WORKSPACE",
    title: "Manage every workflow together",
    text: "Explore how Admin, Finance and the mobile apps work together while keeping each merchant’s customers and records separate.",
    points: ["Admin and Finance controls", "Agent customer onboarding", "Merchant-specific customer access"]
  }
];
const learningSteps = [
  ["1","Create the merchant account","Register the business, verify the account and select the correct active-phone subscription."],
  ["2","Complete onboarding","Pay the one-time onboarding fee, configure the merchant workspace and add the M-PESA collection details."],
  ["3","Run the business","Use Admin and Finance portals, onboard customers through the Agent app and monitor activity from one workspace."]
];

function HowItWorksPage() {
  return <main className="learning-page">
    <SiteHeader />
    <section className="learning-hero">
      <div className="learning-hero-decor" aria-hidden="true">
        {Array.from({length: 32},(_,index)=><i className={index % 5 === 0 ? "decor-circle" : "decor-star"} key={index}>{index % 5 === 0 ? "" : "★"}</i>)}
      </div>
      <a href="#/"><ArrowRight size={15}/> Back to homepage</a>
      <span className="kicker">SALAMA LOCK LEARNING CENTRE</span>
      <h1>Watch. Read. Learn the system.</h1>
      <p>Short videos and practical explanations to help merchants understand onboarding, payments, device management and daily workspace operations.</p>
    </section>
    <section className="learning-video-grid">
      {learningVideos.map((video, index) => <article key={video.src}>
        <div className="learning-video-wrap"><video controls playsInline preload={index === 0 ? "metadata" : "none"} src={video.src}/><span>{String(index + 1).padStart(2, "0")}</span></div>
        <div className="learning-video-copy"><span>{video.kicker}</span><h2>{video.title}</h2><p>{video.text}</p><ul>{video.points.map((point) => <li key={point}><Check size={15}/>{point}</li>)}</ul></div>
      </article>)}
    </section>
    <section className="learning-wave-section">
      <div className="learning-wave-heading"><span className="kicker">QUICK START</span><h2>From registration to daily operations.</h2><p>Follow the journey from account setup to managing the whole business.</p></div>
      <div className="learning-wave-window">
        <div className="learning-wave-track">
          {[...learningSteps,...learningSteps].map(([number,title,text],index)=><article aria-hidden={index >= learningSteps.length} className={`wave-step wave-step-${index % 3}`} key={`${number}-${index}`}><b>{number}</b><h3>{title}</h3><p>{text}</p></article>)}
        </div>
      </div>
    </section>
    <SiteFooter />
  </main>;
}

export default function App() {
  const getPage = () => window.location.hash.replace("#/", "") || "home";
  const [page, setPage] = useState(getPage);

  useEffect(() => {
    const apiPrefetch = document.createElement("link");
    apiPrefetch.rel = "prefetch";
    apiPrefetch.href = "/docs/api.html";
    apiPrefetch.as = "document";
    document.head.appendChild(apiPrefetch);
    const changePage = () => {
      setPage(getPage());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", changePage);
    return () => {
      window.removeEventListener("hashchange", changePage);
      apiPrefetch.remove();
    };
  }, []);

  if (page === "login" || page === "merchant-login") return <AuthPage mode="login" authType="merchant" />;
  if (page === "register" || page === "merchant-register") return <AuthPage mode="register" authType="merchant" />;
  if (page === "api-login") return <AuthPage mode="login" authType="api" />;
  if (page === "api-register") return <AuthPage mode="register" authType="api" />;
  if (page === "system-loading") return <SystemLoadingPage />;
  if (page === "merchant-plan-selection") return <MerchantPlanSelection />;
  if (page === "merchant-plan-payment") return <MerchantPlanPayment />;
  if (page === "merchant-plan-redirect") return <MerchantPlanRedirect />;
  if (page === "merchant") return <MerchantPlaceholder view="dashboard" />;
  if (page === "merchant-settings") return <MerchantPlaceholder view="settings" />;
  if (page === "merchant-subscription") return <MerchantPlaceholder view="subscription" />;
  if (page === "merchant-agent-app") return <MerchantPlaceholder view="agent-generator" />;
  if (page === "merchant-customer-app") return <MerchantPlaceholder view="customer-generator" />;
  if (page === "pricing-more") return <PricingFormulaPage />;
  if (page === "how-it-works") return <HowItWorksPage />;
  return pageContent[page] ? <InfoPage page={page} /> : <Home />;
}
