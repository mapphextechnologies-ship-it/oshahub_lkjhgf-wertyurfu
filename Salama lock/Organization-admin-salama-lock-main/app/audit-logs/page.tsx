import DashboardLayout from "@/components/layout/DashboardLayout";
import { auditEvents } from "@/lib/data";
import styles from "../workspace.module.css";

const severityClass: Record<string, string> = {
  Info: styles.statusInfo,
  Warning: styles.statusWarning,
  Critical: styles.statusCritical,
};

export default function AuditLogsPage() {
  return (
    <DashboardLayout title="Audit Logs">
      <div className={styles.pageHeader}>
        <div><div className={styles.pageTitle}>Audit Logs</div><div className={styles.pageSub}>Every sensitive admin action is recorded for review.</div></div>
        <button className={styles.secondaryBtn}>Export Logs</button>
      </div>
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}><div className={styles.tableTitle}>Security Events</div></div>
        <table className={styles.table}>
          <thead><tr><th>Action</th><th>Actor</th><th>Target</th><th>Time</th><th>Severity</th></tr></thead>
          <tbody>{auditEvents.map((event) => <tr key={`${event.action}-${event.time}`}><td className={styles.strong}>{event.action}</td><td>{event.actor}</td><td>{event.target}</td><td className={styles.muted}>{event.time}</td><td><span className={`${styles.status} ${severityClass[event.severity]}`}>{event.severity}</span></td></tr>)}</tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}