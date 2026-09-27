import DashboardLayout from "@/components/layout/DashboardLayout";
import { branches } from "@/lib/data";
import styles from "../workspace.module.css";

export default function BranchesPage() {
  return (
    <DashboardLayout title="Branches">
      <div className={styles.pageHeader}>
        <div><div className={styles.pageTitle}>Branches</div><div className={styles.pageSub}>Separate devices, managers, and recovery activity by branch.</div></div>
        <button className={styles.primaryBtn}>Add Branch</button>
      </div>
      <div className={styles.cardsGrid}>
        {branches.map((branch) => (
          <div className={styles.branchCard} key={branch.name}>
            <div className={styles.branchTop}>
              <div><div className={styles.branchName}>{branch.name}</div><div className={styles.branchMeta}>{branch.location} - Manager: {branch.manager}</div></div>
              <strong>{branch.devices} devices</strong>
            </div>
            <div className={styles.track}><div className={branch.locked > 10 ? styles.fillAmber : styles.fillGreen} /></div>
            <div className={styles.branchMeta}>{branch.locked} devices currently locked</div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}