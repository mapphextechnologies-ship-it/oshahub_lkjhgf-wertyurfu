import { Navigate, Route, Routes } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { BackOfficeLayout } from "../components/layout/BackOfficeLayout.jsx";
import BackOfficeApplicationDetail from "../pages/BackOfficeApplicationDetail.jsx";
import BackOfficeAuth from "../pages/BackOfficeAuth.jsx";
import BackOfficeCompleted from "../pages/BackOfficeCompleted.jsx";
import BackOfficeNotifications from "../pages/BackOfficeNotifications.jsx";
import BackOfficeOverview from "../pages/BackOfficeOverview.jsx";
import BackOfficeProfile from "../pages/BackOfficeProfile.jsx";
import BackOfficeSettings from "../pages/BackOfficeSettings.jsx";
import BackOfficeScreening from "../pages/BackOfficeScreening.jsx";
import { getPortalPathForRole, useAuth } from "../../uploadedAdmin/features/auth/AuthContext.jsx";
import ResetPassword from "../../uploadedAdmin/pages/auth/ResetPassword.jsx";

export default function BackOfficeApp() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/backoffice/overview" replace />} />
      <Route path="/backoffice/login" element={<BackOfficeAuth />} />
      <Route path="/backoffice/reset-password" element={<ResetPassword />} />
      <Route path="/admin/*" element={<Navigate to="/backoffice/overview" replace />} />

      <Route
        path="/backoffice"
        element={
          <BackOfficeProtectedRoute allowedRoles={["super_admin", "back_office_officer"]}>
            <BackOfficeLayout />
          </BackOfficeProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/backoffice/overview" replace />} />
        <Route path="overview" element={<BackOfficeOverview />} />
        <Route path="screening" element={<BackOfficeScreening />} />
        <Route path="applications/:applicationId" element={<BackOfficeApplicationDetail />} />
        <Route path="completed" element={<BackOfficeCompleted />} />
        <Route path="notifications" element={<BackOfficeNotifications />} />
        <Route path="settings" element={<BackOfficeSettings />} />
        <Route path="profile" element={<BackOfficeProfile />} />
      </Route>

      <Route path="*" element={<Navigate to="/backoffice/overview" replace />} />
    </Routes>
  );
}

function BackOfficeProtectedRoute({ allowedRoles, children }) {
  const location = useLocation();
  const { authStatus, isAuthenticated, user } = useAuth();

  if (authStatus === "loading") {
    return <main className="auth-screen"><section className="auth-panel">Loading secure session...</section></main>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/backoffice/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={getPortalPathForRole(user.role)} replace />;
  }

  return children;
}
