import DashboardLayout from "@/components/layout/DashboardLayout";
import styles from "../workspace.module.css";

const notifications = [
  { title: "Payment recovery queue increased", meta: "Thika branch has 13 locked devices pending follow-up.", level: "Warning" },
  { title: "Policy compliance improved", meta: "Loan Default Recovery reached 94% compliance.", level: "Info" },
  { title: "Device SL-2049 locked", meta: "Lock command completed 10 minutes ago.", level: "Critical" },
];

export default function NotificationsPage() {
  return (
    <DashboardLayout title="Notifications" showNotif={false}>
      <div className={styles.pageHeader}>
        <div><div className={styles.pageTitle}>Notifications</div><div className={styles.pageSub}>Important workspace alerts and command outcomes.</div></div>
        <button className={styles.secondaryBtn}>Mark All Read</button>
      </div>
      <div className={styles.timeline}>
        {notifications.map((item) => <div className={styles.timelineItem} key={item.title}><div className={styles.itemTop}><div className={styles.itemName}>{item.title}</div><strong>{item.level}</strong></div><div className={styles.itemMeta}>{item.meta}</div></div>)}
      </div>
    </DashboardLayout>
  );
}