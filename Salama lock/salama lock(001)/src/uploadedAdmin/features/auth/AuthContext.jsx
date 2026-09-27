/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { adminApiRequest as apiRequest } from "../../../services/adminApiClient.js";
import {
  ADMIN_SESSION_EXPIRED_EVENT,
  clearAdminSession,
  getAdminToken,
  refreshAdminToken,
  setAdminSession
} from "../../../services/adminAuthSession.js";

export { getAdminToken };

const AuthContext = createContext(null);
const sessionTimeoutMs = 30 * 60 * 1000;

export function getPortalPathForRole(role) {
  if (role === "back_office_officer") return "/backoffice/overview";

  if (["super_admin", "admin"].includes(role)) {
    return "/admin/overview";
  }

  if (role === "finance_officer" || role === "finance") return "/finance";
  if (role === "agent") return "/agent";
  if (role === "customer") return "/customer";
  return "/login";
}

const adminPermissionsByRole = {
  super_admin: [
    "overview",
    "applications",
    "agents",
    "users",
    "customers",
    "bikes",
    "finance",
    "reports",
    "notifications",
    "audit",
    "settings",
    "profile"
  ],
  admin: [
    "overview",
    "applications",
    "agents",
    "users",
    "customers",
    "bikes",
    "finance",
    "reports",
    "notifications",
    "audit",
    "settings",
    "profile"
  ],
  back_office_officer: [
    "overview",
    "applications",
    "notifications",
    "settings",
    "profile"
  ],
  finance_officer: ["profile"]
};

function normalizeBackendUser(user = {}) {
  return {
    id: user.id || "",
    name: user.fullName || user.name || user.email || "",
    email: user.email || "",
    phone: user.phone || "",
    role: user.role === "admin" ? "super_admin" : user.role || "super_admin",
    photoUrl: user.photoUrl || "",
    logoUrl: user.logoUrl || ""
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authStatus, setAuthStatus] = useState(() => (getAdminToken() ? "loading" : "ready"));
  const [otpChallenge, setOtpChallenge] = useState(null);

  useEffect(() => {
    function handleSessionExpired() {
      setUser(null);
      setAuthStatus("ready");
    }

    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!getAdminToken()) {
        clearAdminSession();
        if (!cancelled) {
          setUser(null);
          setAuthStatus("ready");
        }
        return;
      }

      setAuthStatus("loading");
      try {
        const token = await refreshAdminToken();
        if (!token) throw new Error("Admin session expired.");
        const data = await apiRequest("/api/admin/auth/me");
        if (!cancelled) setUser(normalizeBackendUser(data.user));
      } catch {
        clearAdminSession();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setAuthStatus("ready");
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email, password) {
    if (!email || !password) {
      return { ok: false, message: "Email and password are required." };
    }

    try {
      setAuthStatus("loading");
      const data = await apiRequest("/api/admin/auth/login", {
        method: "POST",
        body: { email, password },
        requiresAuth: false
      });
      const normalizedUser = normalizeBackendUser(data.user);
      setAdminSession(data);
      setUser(normalizedUser);
      return { ok: true, user: normalizedUser };
    } catch (error) {
      clearAdminSession();
      setUser(null);
      return { ok: false, message: error.message };
    } finally {
      setAuthStatus("ready");
    }
  }

  async function logout() {
    clearAdminSession();
    setUser(null);
  }

  const logoutForTimeout = useCallback(() => {
    clearAdminSession();
    setUser(null);
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    let timeoutId;
    const resetTimeout = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(logoutForTimeout, sessionTimeoutMs);
    };
    const activityEvents = ["click", "keydown", "mousemove", "scroll", "touchstart"];

    resetTimeout();
    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetTimeout, { passive: true }));

    return () => {
      window.clearTimeout(timeoutId);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetTimeout));
    };
  }, [logoutForTimeout, user]);

  async function updateProfile(profile) {
    try {
      const data = await apiRequest("/api/admin/auth/profile", {
        method: "PATCH",
        body: profile
      });
      const normalizedUser = normalizeBackendUser(data.user);
      setUser(normalizedUser);
      return { ok: true, user: normalizedUser, message: "Profile saved." };
    } catch (error) {
      return {
        ok: false,
        message: error.message,
        retryAfterSeconds: error.retryAfterSeconds || null,
        resendAvailableAt: error.resendAvailableAt || null
      };
    }
  }

  async function updatePassword({ newPassword, confirmPassword }) {
    if (!newPassword || !confirmPassword) {
      return { ok: false, message: "Enter and confirm the new password." };
    }

    if (newPassword !== confirmPassword) {
      return { ok: false, message: "New password and confirmation do not match." };
    }

    return { ok: false, message: "Use password reset to change the admin password." };
  }

  async function requestPasswordReset(request) {
    const identifier = typeof request === "string"
      ? request.trim()
      : String(request?.email || request?.identifier || "").trim();
    const senderMode = typeof request === "object" && request
      ? String(request.senderMode || request.sender_mode || "").trim().toLowerCase() === "default"
        ? "default"
        : "configured"
      : "configured";

    if (!identifier.includes("@") || /\s/.test(identifier)) {
      return { ok: false, message: "Enter your email address." };
    }

    try {
      const data = await apiRequest("/api/auth/request-reset", {
        method: "POST",
        body: {
          email: identifier,
          sourcePortal: "admin",
          senderMode
        },
        requiresAuth: false
      });
      return { ok: true, ...data };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }

  async function verifyPasswordResetOtp({ identifier, email, otp }) {
    const trimmedIdentifier = String(identifier || email || "").trim();
    try {
      const data = await apiRequest("/api/auth/verify-otp", {
        method: "POST",
        body: {
          email: trimmedIdentifier,
          otp,
          sourcePortal: "admin"
        },
        requiresAuth: false
      });
      return { ok: true, ...data };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }

  async function resetPassword({ identifier, email, resetToken, password }) {
    const trimmedIdentifier = String(identifier || email || "").trim();
    try {
      const data = await apiRequest("/api/auth/reset-password", {
        method: "POST",
        body: {
          email: trimmedIdentifier,
          resetToken,
          password,
          sourcePortal: "admin"
        },
        requiresAuth: false
      });
      return { ok: true, ...data };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }

  function createOtpChallenge(label = "critical action") {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const challenge = {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000,
      label
    };
    setOtpChallenge(challenge);
    return challenge;
  }

  function verifyOtpChallenge(code) {
    if (!otpChallenge) {
      return { ok: false, message: "Request a new OTP code." };
    }

    if (Date.now() > otpChallenge.expiresAt) {
      setOtpChallenge(null);
      return { ok: false, message: "OTP expired. Request a new code." };
    }

    if (String(code).trim() !== otpChallenge.code) {
      return { ok: false, message: "OTP code is incorrect." };
    }

    setOtpChallenge(null);
    return { ok: true };
  }

  function canAccessAdmin(permission) {
    if (!permission) return true;
    const allowed = adminPermissionsByRole[user?.role] || [];
    return allowed.includes(permission);
  }

  const value = {
    authStatus,
    canAccessAdmin,
    createOtpChallenge,
    isAuthenticated: Boolean(user && getAdminToken()),
    login,
    logout,
    otpChallenge,
    requestPasswordReset,
    resetPassword,
    updatePassword,
    updateProfile,
    user,
    verifyOtpChallenge,
    verifyPasswordResetOtp
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
