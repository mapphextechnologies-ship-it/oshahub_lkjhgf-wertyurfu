import DashboardLayout from "@/components/layout/DashboardLayout";
import { integrations, platformSettings, securitySettings } from "@/lib/mockData";
import styles from "./settings.module.css";

export default function SettingsPage() {
  return (
    <DashboardLayout title="Settings">
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Platform Settings</div>
          <div className={styles.pageSub}>Control global security, billing, integrations, and device command defaults.</div>
        </div>
        <button className={styles.primaryBtn}>Save Changes</button>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardTitle}>Security</div>
          <div className={styles.cardSub}>Rules that protect the Super Admin portal.</div>
          <div className={styles.rows}>
            {securitySettings.map((item) => (
              <div className={styles.row} key={item.label}>
                <div>
                  <div className={styles.rowLabel}>{item.label}</div>
                  <div className={styles.rowValue}>{item.value}</div>
                </div>
                <span className={`${styles.status} ${item.status === "Review" ? styles.statusWarn : styles.statusGood}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardTitle}>Platform Defaults</div>
          <div className={styles.cardSub}>Defaults applied when new organizations are created.</div>
          <div className={styles.rows}>
            {platformSettings.map((item) => (
              <div className={styles.row} key={item.label}>
                <div className={styles.rowLabel}>{item.label}</div>
                <div className={styles.rowValue}>{item.value}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className={styles.card}>
        <div className={styles.cardTitle}>Integrations</div>
        <div className={styles.cardSub}>Services that connect Salama Lock to billing, alerts, storage, and external systems.</div>
        <div className={styles.integrationGrid}>
          {integrations.map((item) => (
            <div className={styles.integration} key={item.name}>
              <div>
                <div className={styles.integrationName}>{item.name}</div>
                <div className={styles.integrationDesc}>{item.description}</div>
              </div>
              <span className={`${styles.status} ${item.state === "Pending" ? styles.statusWarn : styles.statusGood}`}>{item.state}</span>
            </div>
          ))}
        </div>
      </section>
    </DashboardLayout>
  );
}
