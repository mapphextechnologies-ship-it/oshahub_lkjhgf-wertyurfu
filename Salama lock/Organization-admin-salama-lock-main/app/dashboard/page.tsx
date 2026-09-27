import DashboardLayout from "@/components/layout/DashboardLayout";
import { auditEvents, branches, metrics, policies, workspace } from "@/lib/data";
import styles from "../workspace.module.css";

const health = [
  { label: "Policy compliance", meta: "298 of 318 devices compliant", fill: styles.fillGreen },
  { label: "Payment recovery queue", meta: "37 devices locked or pending recovery", fill: styles.fillAmber },
  { label: "Offline risk", meta: "12 devices offline for more than 24 hours", fill: styles.fillRed },
];

export default function DashboardPage() {
  return (
    <DashboardLayout title="Dashboard">
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>{workspace.name}</div>
          <div className={styles.pageSub}>Daily command view for devices, users, branches, and policy health.</div>
        </div>
        <div className={styles.actions}>
          <button className={styles.secondaryBtn}>Export Report</button>
          <button className={styles.primaryBtn}>Enroll Device</button>
        </div>
      </div>

      <div className={styles.stats}>
        {metrics.map((item) => (
          <div className={styles.statCard} key={item.label}>
            <div className={styles.statLabel}>{item.label}</div>
            <div className={styles.statValue}>{item.value}</div>
            <div className={styles.statChange}>{item.change}</div>
          </div>
        ))}
      </div>

      <div className={styles.gridTwo}>
        <section className={styles.panel}>
          <div className={styles.panelTitle}>Workspace Health</div>
          <div className={styles.panelSub}>Fast view of areas that need action.</div>
          <div className={styles.healthList}>
            {health.map((item) => (
              <div className={styles.healthItem} key={item.label}>
                <div className={styles.itemTop}>
                  <div className={styles.itemName}>{item.label}</div>
                  <div className={styles.itemMeta}>{item.meta}</div>
                </div>
                <div className={styles.track}><div className={item.fill} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelTitle}>Recent Activity</div>
          <div className={styles.timeline}>
            {auditEvents.map((event) => (
              <div className={styles.timelineItem} key={`${event.action}-${event.time}`}>
                <div className={styles.itemTop}>
                  <div className={styles.itemName}>{event.action}</div>
                  <span className={`${styles.status} ${styles[`status${event.severity}`]}`}>{event.severity}</span>
                </div>
                <div className={styles.itemMeta}>{event.actor} on {event.target} - {event.time}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.cardsGrid}>
        {branches.slice(0, 2).map((branch) => (
          <div className={styles.branchCard} key={branch.name}>
            <div className={styles.branchTop}>
              <div>
                <div className={styles.branchName}>{branch.name}</div>
                <div className={styles.branchMeta}>{branch.manager} - {branch.location}</div>
              </div>
              <strong>{branch.devices} devices</strong>
            </div>
          </div>
        ))}
        {policies.slice(0, 2).map((policy) => (
          <div className={styles.policyCard} key={policy.name}>
            <div className={styles.policyTop}>
              <div>
                <div className={styles.policyName}>{policy.name}</div>
                <div className={styles.policyMeta}>{policy.scope}</div>
              </div>
              <strong>{policy.devices} devices</strong>
            </div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}