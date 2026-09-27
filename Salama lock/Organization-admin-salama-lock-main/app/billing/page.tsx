import DashboardLayout from "@/components/layout/DashboardLayout";
import { invoices, workspace } from "@/lib/data";
import styles from "../workspace.module.css";

export default function BillingPage() {
  return (
    <DashboardLayout title="Billing">
      <div className={styles.pageHeader}>
        <div><div className={styles.pageTitle}>Billing</div><div className={styles.pageSub}>Plan, invoices, device limits, and renewal status for this workspace.</div></div>
        <button className={styles.secondaryBtn}>Download Statement</button>
      </div>
      <div className={styles.stats}>
        <div className={styles.statCard}><div className={styles.statLabel}>Current Plan</div><div className={styles.statValue}>{workspace.plan}</div><div className={styles.statChange}>Renews {workspace.renewal}</div></div>
        <div className={styles.statCard}><div className={styles.statLabel}>Device Limit</div><div className={styles.statValue}>{workspace.deviceLimit}</div><div className={styles.statChange}>318 currently enrolled</div></div>
        <div className={styles.statCard}><div className={styles.statLabel}>Admin Seats</div><div className={styles.statValue}>{workspace.seats}</div><div className={styles.statChange}>Included in plan</div></div>
        <div className={styles.statCard}><div className={styles.statLabel}>Monthly Bill</div><div className={styles.statValue}>KES 42K</div><div className={styles.statChange}>Paid this month</div></div>
      </div>
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}><div className={styles.tableTitle}>Invoices</div></div>
        <table className={styles.table}>
          <thead><tr><th>Invoice</th><th>Period</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>{invoices.map((invoice) => <tr key={invoice.id}><td className={styles.strong}>{invoice.id}</td><td>{invoice.period}</td><td>{invoice.amount}</td><td><span className={`${styles.status} ${styles.statusPaid}`}>{invoice.status}</span></td><td className={styles.muted}>{invoice.date}</td></tr>)}</tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}