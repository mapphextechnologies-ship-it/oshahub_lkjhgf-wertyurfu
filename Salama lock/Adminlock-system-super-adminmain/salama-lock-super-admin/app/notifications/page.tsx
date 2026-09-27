"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { notifications } from "@/lib/mockData";
import styles from "./notifications.module.css";

const typeClass: Record<string, string> = {
  Alert: styles.typeAlert,
  Billing: styles.typeBilling,
  Organization: styles.typeOrganization,
  System: styles.typeSystem,
  Device: styles.typeDevice,
};

const stats = [
  { label: "Unread", value: "3", sub: "needs attention" },
  { label: "Alerts", value: "14", sub: "last 7 days" },
  { label: "Billing Notices", value: "8", sub: "this month" },
  { label: "System Updates", value: "5", sub: "platform messages" },
];

export default function NotificationsPage() {
  const [filter, setFilter] = useState("All");
  const [items, setItems] = useState(notifications);
  const [notice, setNotice] = useState("");

  const filtered = items.filter((item) => filter === "All" || item.status === filter || item.type === filter);

  function markAllRead() {
    setItems((current) => current.map((item) => ({ ...item, status: "Read" })));
    setNotice("All notifications marked as read.");
  }

  return (
    <DashboardLayout title="Notifications">
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Notifications</div>
          <div className={styles.pageSub}>Monitor platform alerts, billing notices, device risks, and system messages.</div>
        </div>
        <button className={styles.primaryBtn} onClick={markAllRead}><CheckCircle2 size={15} /> Mark All Read</button>
      </div>

      {notice && <div className={styles.notice}>{notice}</div>}

      <div className={styles.stats}>
        {stats.map((item) => (
          <div className={styles.statCard} key={item.label}>
            <div className={styles.statLabel}>{item.label}</div>
            <div className={styles.statValue}>{item.value}</div>
            <div className={styles.statSub}>{item.sub}</div>
          </div>
        ))}
      </div>

      <div className={styles.filters}>
        {["All", "Unread", "Alert", "Billing", "Organization", "Device", "System"].map((item) => (
          <button
            className={`${styles.filterBtn} ${filter === item ? styles.filterBtnActive : ""}`}
            key={item}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {filtered.map((item) => (
          <div className={`${styles.item} ${item.status === "Unread" ? styles.unread : ""}`} key={item.id}>
            <div className={`${styles.typeDot} ${typeClass[item.type]}`} />
            <div className={styles.itemBody}>
              <div className={styles.itemTop}>
                <div className={styles.itemTitle}>{item.title}</div>
                <div className={styles.time}>{item.time}</div>
              </div>
              <div className={styles.message}>{item.message}</div>
              <div className={styles.meta}>
                <span className={`${styles.badge} ${typeClass[item.type]}`}>{item.type}</span>
                <span className={styles.status}>{item.status}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
