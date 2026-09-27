import DashboardLayout from "@/components/layout/DashboardLayout";
import { monthlyRevenue, payments } from "@/lib/mockData";
import styles from "./revenue.module.css";

const planBreakdown = [
  { label: "Business", value: "KES 132,000", className: styles.breakdownBusiness },
  { label: "Growth", value: "KES 93,500", className: styles.breakdownGrowth },
  { label: "Enterprise", value: "KES 38,500", className: styles.breakdownEnterprise },
  { label: "Starter", value: "KES 20,000", className: styles.breakdownStarter },
];

const revenueBarClass = [styles.revenueJan, styles.revenueFeb, styles.revenueMar, styles.revenueApr, styles.revenueMay, styles.revenueJun, styles.revenueJul];

const statusClass: Record<string, string> = {
  Paid: styles.statusPaid,
  Pending: styles.statusPending,
  Overdue: styles.statusOverdue,
};

const statItems = [
  { label: "Monthly Revenue", value: "KES 284K", change: "+18% vs last month" },
  { label: "Annual Projection", value: "KES 3.4M", change: "+22% vs last year" },
  { label: "Paid Invoices", value: "24", change: "This month" },
  { label: "Overdue", value: "1", change: "Needs attention", down: true },
];

export default function RevenuePage() {
  return (
    <DashboardLayout title="Revenue">
      <div className={styles.pageTitle}>Revenue</div>
      <div className={styles.pageSub}>Track platform earnings, payments, and subscription revenue.</div>

      <div className={styles.stats}>
        {statItems.map((item) => (
          <div className={styles.statCard} key={item.label}>
            <div className={styles.statLabel}>{item.label}</div>
            <div className={styles.statValue}>{item.value}</div>
            <div className={`${styles.statChange} ${item.down ? styles.statChangeDown : ""}`}>{item.change}</div>
          </div>
        ))}
      </div>

      <div className={styles.charts}>
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Monthly Revenue</div>
          <div className={styles.chartSub}>Total platform revenue over time (KES)</div>
          <div className={styles.revenueChart}>
            {monthlyRevenue.map((item, index) => (
              <div className={styles.revenueItem} key={item.month}>
                <div className={styles.revenueValue}>{Math.round(item.revenue / 1000)}K</div>
                <div className={`${styles.revenueBar} ${revenueBarClass[index]}`} />
                <div className={styles.revenueLabel}>{item.month}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Revenue by Plan</div>
          <div className={styles.chartSub}>This month&apos;s breakdown</div>
          <div className={styles.breakdownList}>
            {planBreakdown.map((plan) => (
              <div className={styles.breakdownItem} key={plan.label}>
                <div className={styles.breakdownTop}>
                  <span className={styles.breakdownLabel}>{plan.label}</span>
                  <span className={styles.breakdownValue}>{plan.value}</span>
                </div>
                <div className={styles.breakdownBar}>
                  <div className={`${styles.breakdownFill} ${plan.className}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div className={styles.tableTitle}>Payment History</div>
          <button className={styles.exportBtn}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Export
          </button>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Organization</th>
              <th>Plan</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={`${payment.org}-${payment.date}`}>
                <td className={styles.orgName}>{payment.org}</td>
                <td>{payment.plan}</td>
                <td className={styles.amount}>{payment.amount}</td>
                <td>{payment.method}</td>
                <td className={styles.muted}>{payment.date}</td>
                <td>
                  <span className={`${styles.statusBadge} ${statusClass[payment.status]}`}>
                    <span className={styles.statusDot} />
                    {payment.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
