import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

export function AdminPermissionRoute({ permission, children }) {
  const { canAccessAdmin } = useAuth();

  if (canAccessAdmin(permission)) {
    return children;
  }

  return (
    <section className="page-stack">
      <div className="panel access-denied-panel">
        <p className="eyebrow">Access denied</p>
        <h2>This admin area is outside your current role.</h2>
        <p>Use an authorized account or return to the operational overview.</p>
        <Link className="button primary" to="/admin/overview">
          Back to overview
        </Link>
      </div>
    </section>
  );
}
