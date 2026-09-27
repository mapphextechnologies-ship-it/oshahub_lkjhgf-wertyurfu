import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthContext.jsx";
import { SalamaLockLogo } from "@/assets/index.js";

export default function ResetPassword() {
  const location = useLocation();
  const { requestPasswordReset, verifyPasswordResetOtp, resetPassword } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [senderMode, setSenderMode] = useState("configured");
  const [linkedPhoneMasked, setLinkedPhoneMasked] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const loginPath = location.pathname.startsWith("/backoffice") ? "/backoffice/login" : "/login";
  const resendSeconds = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));

  useEffect(() => {
    if (!resendAvailableAt || resendSeconds <= 0) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [resendAvailableAt, resendSeconds]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!otpSent) {
      await sendOtp();
      return;
    }

    if (!otpVerified) {
      await confirmOtp();
      return;
    }

    await changePassword();
  }

  async function sendOtp() {
    const value = identifier.trim();
    if (!value) {
      setMessage("Enter your email address.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestPasswordReset({ email: value, senderMode });
      if (!result.ok) {
        const retryMs = result.resendAvailableAt
          ? new Date(result.resendAvailableAt).getTime()
          : result.retryAfterSeconds
            ? Date.now() + Number(result.retryAfterSeconds) * 1000
            : 0;
        if (retryMs) {
          setResendAvailableAt(retryMs);
          setNow(Date.now());
        }
        setOtpSent(false);
        setOtpVerified(false);
        setResetToken("");
        setLinkedPhoneMasked("");
        setMessage(result.message || "OTP delivery failed.");
        return;
      }

      setOtpSent(true);
      setOtpVerified(false);
      setOtp("");
      setResetToken("");
      setNewPassword("");
      setConfirmPassword("");
      setLinkedPhoneMasked(result.linkedPhoneMasked || "");
      setResendAvailableAt(result.resendAvailableAt ? new Date(result.resendAvailableAt).getTime() : Date.now() + 60 * 1000);
      setNow(Date.now());
      setMessage(result.linkedPhoneMasked
        ? `OTP sent to the phone number linked to your account (${result.linkedPhoneMasked}).`
        : result.message || "OTP sent to the phone number linked to your account.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmOtp() {
    const value = identifier.trim();
    if (!/^\d{6}$/.test(otp.trim())) {
      setMessage("Enter the 6-digit OTP.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await verifyPasswordResetOtp({ email: value, otp: otp.trim() });
      const nextResetToken = result.resetToken || result.token || "";
      if (!result.ok || !nextResetToken) {
        throw new Error(result.message || "Could not create a reset token.");
      }

      setResetToken(nextResetToken);
      setOtpVerified(true);
      setMessage(result.message || "OTP verified. Enter your new password.");
    } catch (error) {
      setOtpVerified(false);
      setResetToken("");
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function changePassword() {
    const value = identifier.trim();
    if (!newPassword || newPassword !== confirmPassword) {
      setMessage("Password and confirmation must match.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await resetPassword({
        email: value,
        resetToken,
        password: newPassword
      });
      if (!result.ok) {
        throw new Error(result.message || "Password update failed.");
      }

      setMessage(result.message || "Password updated. You can sign in now.");
      window.setTimeout(() => window.location.assign(loginPath), 900);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  function backToOtp() {
    setOtp("");
    setOtpVerified(false);
    setResetToken("");
    setNewPassword("");
    setConfirmPassword("");
    setLinkedPhoneMasked("");
    setMessage("");
  }

  function backToIdentifier() {
    setOtpSent(false);
    setOtpVerified(false);
    setOtp("");
    setResetToken("");
    setNewPassword("");
    setConfirmPassword("");
    setLinkedPhoneMasked("");
    setMessage("");
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="brand auth-brand">
          <img className="auth-logo" src={SalamaLockLogo} alt="SalamaLock logo" />
          <div>
            <strong>SALAMA LOCK PAYGO</strong>
            <span>Admin CRM</span>
          </div>
        </div>
        <h1>Password reset</h1>
        <p>Enter your personal email. The OTP will be sent to the phone number linked to your account.</p>
        <form className="form-grid" onSubmit={handleSubmit}>
          {!otpSent ? (
            <>
              <label>
                Personal email
                <input
                  required
                  type="text"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="Enter personal email"
                />
              </label>
              <label>
                Sender mode
                <select value={senderMode} onChange={(event) => setSenderMode(event.target.value)}>
                  <option value="configured">Configured sender ID SALAMA LOCKPAYGO</option>
                  <option value="default">Default Africa's Talking sender</option>
                </select>
              </label>
              {message ? <p className="form-error neutral-message">{message}</p> : null}
              <button className="button primary" type="submit" disabled={submitting}>
                {submitting ? "Sending..." : "Send OTP"}
              </button>
            </>
          ) : !otpVerified ? (
            <>
              <p className="neutral-message">
                {linkedPhoneMasked
                  ? `OTP sent to the phone number linked to your account (${linkedPhoneMasked}).`
                  : 'OTP sent to the phone number linked to your account.'}
              </p>
              <label>
                OTP
                <input
                  required
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  placeholder="Enter 6-digit OTP"
                />
              </label>
              {message ? <p className="form-error neutral-message">{message}</p> : null}
              <div className="button-row">
                <button className="button secondary" type="button" onClick={backToIdentifier}>
                  Change account
                </button>
                <button className="button secondary" type="button" onClick={sendOtp} disabled={submitting || resendSeconds > 0}>
                  {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend OTP"}
                </button>
                <button className="button primary" type="submit" disabled={submitting}>
                  {submitting ? "Verifying..." : "Verify OTP"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="neutral-message">OTP verified. Set your new password.</p>
              <label>
                New password
                <input
                  required
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Enter new password"
                />
              </label>
              <label>
                Confirm password
                <input
                  required
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm new password"
                />
              </label>
              {message ? <p className="form-error neutral-message">{message}</p> : null}
              <div className="button-row">
                <button className="button secondary" type="button" onClick={backToOtp}>
                  Back to OTP
                </button>
                <button className="button primary" type="submit" disabled={submitting}>
                  {submitting ? "Updating..." : "Update password"}
                </button>
              </div>
            </>
          )}
        </form>
        <div className="auth-links">
          <Link to={loginPath}>Back to login</Link>
        </div>
      </section>
    </main>
  );
}
