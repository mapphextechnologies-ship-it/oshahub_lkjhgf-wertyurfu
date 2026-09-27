import { Link } from "react-router-dom";

export default function PortalPlaceholder({ title }) {
  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <h1>{title}</h1>
        <p>This portal is planned in the system architecture. The current build is focused on Admin.</p>
        <Link className="button primary" to="/admin/overview">
          Open Admin
        </Link>
      </section>
    </main>
  );
}
