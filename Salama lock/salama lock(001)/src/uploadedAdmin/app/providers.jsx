import { AuthProvider } from "../features/auth/AuthContext.jsx";
import { AdminDataProvider } from "../features/admin/AdminDataContext.jsx";

export function AppProviders({ children }) {
  return (
    <AuthProvider>
      <AdminDataProvider>{children}</AdminDataProvider>
    </AuthProvider>
  );
}
