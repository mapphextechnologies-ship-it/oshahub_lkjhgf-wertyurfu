import { Navigate, useLocation } from "react-router-dom";
import { getPortalPathForRole, useAuth } from "./AuthContext.jsx";

export function ProtectedRoute({ allowedRoles, children }) {
  const location = useLocation();
  const { authStatus, isAuthenticated, user } = useAuth();

  if (authStatus === "loading") {
    return <main className="auth-screen"><section className="auth-panel">Loading secure session...</section></main>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={getPortalPathForRole(user.role)} replace />;
  }

  return children;
}
