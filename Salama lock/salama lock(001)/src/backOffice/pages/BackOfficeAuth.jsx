import { useState } from "react";
import { ArrowLeft, LogIn, UserPlus } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../uploadedAdmin/features/auth/AuthContext.jsx";
import { adminPortalService } from "../../services/adminPortalService.js";
import { SalamaLockLogo } from "@/assets/index.js";

export default function BackOfficeAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    setupCode: ""
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      const result = await login(form.email.trim(), form.password);
      if (!result.ok) {
        setError(result.message || "Unable to sign in.");
        return;
      }

      const requestedPath = location.state?.from?.pathname;
      const nextPath = requestedPath && requestedPath.startsWith("/backoffice")
        ? requestedPath
        : "/backoffice/overview";
      navigate(nextPath, { replace: true });
    } catch (error) {
      setError(error.message || "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      setSubmitting(false);
      return;
    }

    try {
      await adminPortalService.register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        setupCode: form.setupCode.trim(),
        role: "back_office_officer"
      });
      setMessage("Registration complete. Sign in with your new Back Office credentials.");
      setMode("login");
      setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
    } catch (error) {
      setError(error.message || "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className="auth-screen" style={authStyles.screen}>
      <section className="auth-panel auth-panel-stacked" style={authStyles.panel}>
        <button type="button" className="auth-back-link" style={authStyles.backButton} onClick={() => { window.location.href = "/"; }}>
          <ArrowLeft size={16} />
          Back to site
        </button>
        <div className="brand auth-brand" style={authStyles.brand}>
          <img className="auth-logo" style={authStyles.logo} src={SalamaLockLogo} alt="SalamaLock logo" />
          <div>
            <strong style={authStyles.brandTitle}>SALAMA LOCK PAYGO</strong>
            <span style={authStyles.brandSubtitle}>Back Office account access</span>
          </div>
        </div>

        <h1 style={authStyles.title}>{mode === "login" ? "Back Office sign in" : "Back Office registration"}</h1>
        <p style={authStyles.copy}>
          {mode === "login"
            ? "Use your approved Back Office email to access screening workflows."
            : "Create a Back Office profile for the shared CRM."}
        </p>

        <form className="form-grid" style={authStyles.form} onSubmit={mode === "login" ? handleLogin : handleRegister}>
          {mode === "register" ? (
            <>
              <label style={authStyles.label}>
                Full name
                <input
                  required
                  style={authStyles.input}
                  autoComplete="name"
                  value={form.fullName}
                  onChange={(event) => updateField("fullName", event.target.value)}
                />
              </label>
              <label style={authStyles.label}>
                Phone number
                <input
                  required
                  style={authStyles.input}
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                />
              </label>
              <label style={authStyles.label}>
                Setup code
                <input
                  style={authStyles.input}
                  value={form.setupCode}
                  onChange={(event) => updateField("setupCode", event.target.value)}
                  placeholder="Optional"
                />
              </label>
            </>
          ) : null}

          <label style={authStyles.label}>
            Email address
            <input
              required
              style={authStyles.input}
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
            />
          </label>
          <label style={authStyles.label}>
            Password
            <input
              required
              style={authStyles.input}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
            />
          </label>
          {mode === "register" ? (
            <label style={authStyles.label}>
              Confirm password
              <input
                required
                style={authStyles.input}
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(event) => updateField("confirmPassword", event.target.value)}
              />
            </label>
          ) : null}

          {error ? <p className="form-error" style={authStyles.error}>{error}</p> : null}
          {message ? <div className="alert soft" style={authStyles.notice}>{message}</div> : null}

          <button className="button primary" style={authStyles.submitButton} type="submit" disabled={submitting}>
            {mode === "login" ? <LogIn size={18} /> : <UserPlus size={18} />}
            {submitting
              ? mode === "login"
                ? "Signing in..."
                : "Registering..."
              : mode === "login"
                ? "Sign in"
                : "Register"}
          </button>
        </form>

        <div className="auth-links auth-links-center" style={authStyles.links}>
          {mode === "login" ? (
            <>
              <Link style={authStyles.link} to="/backoffice/reset-password">Reset password</Link>
              <button type="button" className="link-button" style={authStyles.linkButton} onClick={() => { setError(""); setMessage(""); setMode("register"); }}>
                Create Back Office account
              </button>
            </>
          ) : (
            <button type="button" className="link-button" style={authStyles.linkButton} onClick={() => { setError(""); setMessage(""); setMode("login"); }}>
              Already have an account? Sign in
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

const authStyles = {
  screen: {
    boxSizing: "border-box",
    minHeight: "100dvh",
    width: "100%",
    display: "grid",
    placeItems: "center",
    padding: 18,
    background: "linear-gradient(135deg, rgba(7, 87, 200, 0.12), rgba(22, 132, 91, 0.08)), #f7faff",
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: "#0f172a"
  },
  panel: {
    boxSizing: "border-box",
    width: "min(100%, 540px)",
    maxWidth: "calc(100vw - 32px)",
    display: "grid",
    gap: 10,
    border: "1px solid #d8e2f0",
    borderRadius: 10,
    background: "#ffffff",
    padding: 16,
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)"
  },
  backButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    width: "fit-content",
    minHeight: 32,
    border: 0,
    background: "transparent",
    color: "#0757c8",
    padding: 0,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer"
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
    marginBottom: 4
  },
  logo: {
    width: 42,
    height: 42,
    minWidth: 42,
    borderRadius: 8,
    objectFit: "cover",
    border: "1px solid #0757c8"
  },
  brandTitle: {
    display: "block",
    color: "#0f172a",
    fontSize: 19,
    fontWeight: 600,
    lineHeight: "24px"
  },
  brandSubtitle: {
    display: "block",
    color: "#64748b",
    fontSize: 13,
    marginTop: 2
  },
  title: {
    margin: 0,
    color: "#0f172a",
    fontSize: 24,
    lineHeight: "30px",
    fontWeight: 600
  },
  copy: {
    margin: 0,
    color: "#64748b",
    fontSize: 14,
    lineHeight: "20px"
  },
  form: {
    boxSizing: "border-box",
    display: "grid",
    gap: 10,
    marginTop: 4
  },
  label: {
    boxSizing: "border-box",
    display: "grid",
    gap: 6,
    color: "#64748b",
    fontSize: 12,
    fontWeight: 600
  },
  input: {
    boxSizing: "border-box",
    width: "100%",
    maxWidth: "100%",
    minHeight: 40,
    border: "1px solid #d8e2f0",
    borderRadius: 8,
    background: "#ffffff",
    color: "#0f172a",
    padding: "0 12px",
    fontSize: 14,
    outline: "none"
  },
  submitButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    minHeight: 42,
    border: 0,
    borderRadius: 8,
    background: "#0757c8",
    color: "#ffffff",
    padding: "0 14px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer"
  },
  error: {
    margin: 0,
    color: "#c63737",
    fontSize: 13,
    fontWeight: 600
  },
  notice: {
    border: "1px solid rgba(7, 87, 200, 0.16)",
    borderRadius: 8,
    background: "#eaf2ff",
    color: "#0757c8",
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 500
  },
  links: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: 2
  },
  link: {
    color: "#0757c8",
    fontSize: 14,
    fontWeight: 500,
    textDecoration: "none"
  },
  linkButton: {
    minHeight: 32,
    border: 0,
    background: "transparent",
    color: "#0757c8",
    padding: 0,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer"
  }
};
