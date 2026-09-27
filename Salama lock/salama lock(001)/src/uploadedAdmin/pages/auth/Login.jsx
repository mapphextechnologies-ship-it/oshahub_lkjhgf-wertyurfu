import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getPortalPathForRole, useAuth } from "../../features/auth/AuthContext.jsx";
import { SalamaLockLogoDark } from "@/assets/index.js";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [form, setForm] = useState({
    email: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const returnToDashboard = new URLSearchParams(window.location.search).get("returnTo")
    || import.meta.env.VITE_MERCHANT_DASHBOARD_URL
    || "http://localhost:5173/#/merchant";

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const result = await login(form.email, form.password);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    const targetPath = result.user?.role ? getPortalPathForRole(result.user.role) : "/admin/overview";
    const requestedPath = location.state?.from?.pathname;
    const shouldUseRequestedPath =
      requestedPath && (!requestedPath.startsWith("/admin") || targetPath.startsWith("/admin"));
    navigate(shouldUseRequestedPath ? requestedPath : targetPath, { replace: true });
  }

  return (
    <main className="auth-screen">
      <section className="auth-brand-panel">
        <img className="auth-hero-logo" src={SalamaLockLogoDark} alt="Salama Lock" />
        <div>
          <span className="auth-kicker">SECURE ADMIN ACCESS</span>
          <h2>Control every device.<br/><em>Protect every sale.</em></h2>
          <p>This administrator identity is used only for your Salama Lock business profile and admin workspace.</p>
        </div>
        <small>SECURE • CONNECTED • BUILT FOR AFRICA</small>
      </section>
      <section className="auth-form-panel">
        <div className="auth-panel">
          <div className="portal-form-top">
            <span className="portal-login-kicker">ADMIN SIGN IN</span>
            <a className="portal-back-dashboard" href={returnToDashboard}>← <span>Back to dashboard</span></a>
          </div>
          <h1>Sign in to your admin portal.</h1>
          <p>Use your username or email and password to continue.</p>
          <div className="admin-social-auth">
            <button type="button"><GoogleBrandIcon/> Continue with Google</button>
            <button type="button"><MicrosoftBrandIcon/> Continue with Microsoft</button>
          </div>
          <div className="admin-auth-divider"><span>OR CONTINUE WITH CREDENTIALS</span></div>

          <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Email address
            <input
              required
              type="email"
              placeholder="name@business.com"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="button primary" type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
          </form>

          <div className="auth-links">
            <Link to="/reset-password">Reset password</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function GoogleBrandIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.12-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.63.39 3.17 1.04 4.55l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.94c1.47 0 2.78.5 3.82 1.49l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"/></svg>;
}

function MicrosoftBrandIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="#F25022" d="M2 2h9.5v9.5H2z"/><path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z"/><path fill="#00A4EF" d="M2 12.5h9.5V22H2z"/><path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z"/></svg>;
}
