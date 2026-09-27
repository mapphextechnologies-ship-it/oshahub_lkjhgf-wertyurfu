import DashboardLayout from "@/components/layout/DashboardLayout";
import { policies } from "@/lib/data";
import styles from "../workspace.module.css";

const statusClass: Record<string, string> = { Active: styles.statusActive, Draft: styles.statusDraft };

export default function PoliciesPage() {
  return (
    <DashboardLayout title="Policies">
      <div className={styles.pageHeader}>
        <div><div className={styles.pageTitle}>Policies</div><div className={styles.pageSub}>Define lock rules, grace periods, compliance checks, and recovery behavior.</div></div>
        <button className={styles.primaryBtn}>Create Policy</button>
      </div>
      <div className={styles.cardsGrid}>
        {policies.map((policy) => (
          <div className={styles.policyCard} key={policy.name}>
            <div className={styles.policyTop}>
              <div><div className={styles.policyName}>{policy.name}</div><div className={styles.policyMeta}>{policy.scope}</div></div>
              <span className={`${styles.status} ${statusClass[policy.status]}`}>{policy.status}</span>
            </div>
            <div className={styles.policyMeta}>{policy.devices} devices - Updated {policy.updated}</div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}