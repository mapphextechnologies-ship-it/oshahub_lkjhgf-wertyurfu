import DashboardLayout from "@/components/layout/DashboardLayout";
import { workspace } from "@/lib/data";
import styles from "../workspace.module.css";

const settings = [
  { label: "Workspace name", value: workspace.name },
  { label: "Default lock policy", value: "Loan Default Recovery" },
  { label: "Command approval", value: "Owner approval required for bulk lock" },
  { label: "Support escalation", value: "support@nairobi-mf.co.ke" },
];

export default function SettingsPage() {
  return (
    <DashboardLayout title="Settings">
      <div className={styles.pageHeader}>
        <div><div className={styles.pageTitle}>Settings</div><div className={styles.pageSub}>Organization workspace preferences and security defaults.</div></div>
        <button className={styles.primaryBtn}>Save Changes</button>
      </div>
      <section className={styles.panel}>
        <div className={styles.panelTitle}>Workspace Configuration</div>
        <div className={styles.healthList}>
          {settings.map((item) => <div className={styles.settingRow} key={item.label}><strong>{item.label}</strong><span className={styles.muted}>{item.value}</span></div>)}
        </div>
      </section>
    </DashboardLayout>
  );
}