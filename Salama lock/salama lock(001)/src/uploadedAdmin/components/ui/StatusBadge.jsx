export function StatusBadge({ status }) {
  const value = String(status || "unknown");
  const label = value.replaceAll("_", " ");
  const className = value.replace(/[^a-zA-Z0-9_-]/g, "-");

  return <span className={`status-badge status-${className}`}>{label}</span>;
}
