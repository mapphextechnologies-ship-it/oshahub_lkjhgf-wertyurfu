import { Link } from "react-router-dom";

export function StatCard({ icon: Icon, label, value, detail, tone = "default", to }) {
  const content = (
    <article className={`stat-card tone-${tone}`}>
      <div className="stat-card-top">
        {Icon ? <Icon size={20} strokeWidth={2.4} /> : null}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );

  if (!to) {
    return content;
  }

  return (
    <Link className="stat-card-link" to={to}>
      {content}
    </Link>
  );
}
