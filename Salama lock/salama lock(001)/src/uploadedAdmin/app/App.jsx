import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "../components/layout/AdminLayout.jsx";
import { AdminPermissionRoute } from "../features/auth/AdminPermissionRoute.jsx";
import { ProtectedRoute } from "../features/auth/ProtectedRoute.jsx";
import Login from "../pages/auth/Login.jsx";
import ResetPassword from "../pages/auth/ResetPassword.jsx";
import AgentDetail from "../pages/admin/AgentDetail.jsx";
import Agents from "../pages/admin/Agents.jsx";
import ApplicationDetail from "../pages/admin/ApplicationDetail.jsx";
import Applications from "../pages/admin/Applications.jsx";
import AuditLogs from "../pages/admin/AuditLogs.jsx";
import CustomerDetail from "../pages/admin/CustomerDetail.jsx";
import Customers from "../pages/admin/Customers.jsx";
import PhoneCustomers from "../pages/admin/PhoneCustomers.jsx";
import PhoneInventory from "../pages/admin/PhoneInventory.jsx";
import Dashboard from "../pages/admin/Dashboard.jsx";
import Finance from "../pages/admin/Finance.jsx";
import Notifications from "../pages/admin/Notifications.jsx";
import Profile from "../pages/admin/Profile.jsx";
import Reports from "../pages/admin/Reports.jsx";
import Settings from "../pages/admin/Settings.jsx";
import Users from "../pages/admin/Users.jsx";
import PortalPlaceholder from "../pages/shared/PortalPlaceholder.jsx";

function withAdminPermission(permission, element) {
  return <AdminPermissionRoute permission={permission}>{element}</AdminPermissionRoute>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin/overview" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["super_admin", "back_office_officer"]}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/overview" replace />} />
        <Route path="overview" element={withAdminPermission("overview", <Dashboard />)} />
        <Route path="dashboard" element={<Navigate to="/admin/overview" replace />} />
        <Route path="applications" element={withAdminPermission("applications", <Applications />)} />
        <Route path="applications/:applicationId" element={withAdminPermission("applications", <ApplicationDetail />)} />
        <Route path="agents" element={withAdminPermission("agents", <Agents />)} />
        <Route path="agents/:agentId" element={withAdminPermission("agents", <AgentDetail />)} />
        <Route path="users" element={withAdminPermission("users", <Users />)} />
        <Route path="customers" element={withAdminPermission("customers", <Customers />)} />
        <Route path="phone-customers" element={withAdminPermission("customers", <PhoneCustomers />)} />
        <Route path="customers/:customerId" element={withAdminPermission("customers", <CustomerDetail />)} />
        <Route path="bikes" element={withAdminPermission("bikes", <Navigate to="/admin/phone-inventory" replace />)} />
        <Route path="phone-inventory" element={withAdminPermission("bikes", <PhoneInventory />)} />
        <Route path="finance" element={withAdminPermission("finance", <Finance />)} />
        <Route path="reports" element={withAdminPermission("reports", <Reports />)} />
        <Route path="notifications" element={withAdminPermission("notifications", <Notifications />)} />
        <Route path="profile" element={withAdminPermission("profile", <Profile />)} />
        <Route path="audit-logs" element={withAdminPermission("audit", <AuditLogs />)} />
        <Route path="settings" element={withAdminPermission("settings", <Settings />)} />
      </Route>

      <Route path="/finance" element={<PortalPlaceholder title="Finance Portal" />} />
      <Route path="/agent" element={<PortalPlaceholder title="Agent Portal" />} />
      <Route path="/customer" element={<PortalPlaceholder title="Customer Portal" />} />
      <Route path="*" element={<Navigate to="/admin/overview" replace />} />
    </Routes>
  );
}
