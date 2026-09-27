import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { deviceGrowth, organizations, platformBreakdown } from "@/lib/mockData";
import styles from "./dashboard.module.css";

const statusClass: Record<string, string> = {
  Active: styles.statusActive,
  Pending: styles.statusPending,
  Suspended: styles.statusSuspended,
};

const statItems = [
  { label: "Total Organizations", value: "27", change: "+3 this month", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
  { label: "Total Devices", value: "1,100", change: "+84 this month", icon: "M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" },
  { label: "Locked Devices", value: "142", change: "+12 today", icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" },
  { label: "Monthly Revenue", value: "KES 284K", change: "+18% vs last month", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
];

const growthBarClass = [styles.growthJan, styles.growthFeb, styles.growthMar, styles.growthApr, styles.growthMay, styles.growthJun, styles.growthJul];
const platformBarClass = [styles.platformAndroid, styles.platformWindows, styles.platformIos, styles.platformLinux, styles.platformOther];

export default function DashboardPage() {
  const recentOrganizations = organizations.slice(0, 5);

  return (
    <DashboardLayout title="Dashboard" showNotif>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>Overview</div>
        <div className={styles.pageSub}>Welcome back. Here is what is happening across the platform.</div>
      </div>

      <div className={styles.stats}>
        {statItems.map((item) => (
          <div className={styles.statCard} key={item.label}>
            <div className={styles.statTop}>
              <span className={styles.statLabel}>{item.label}</span>
              <div className={styles.statIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
              </div>
            </div>
            <div className={styles.statValue}>{item.value}</div>
            <div className={styles.statChange}>{item.change}</div>
          </div>
        ))}
      </div>

      <div className={styles.charts}>
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Device Growth</div>
          <div className={styles.chartSub}>Total registered devices over time</div>
          <div className={styles.growthChart}>
            {deviceGrowth.map((item, index) => (
              <div className={styles.growthItem} key={item.month}>
                <div className={styles.growthValue}>{item.devices}</div>
                <div className={`${styles.growthBar} ${growthBarClass[index]}`} />
                <div className={styles.growthLabel}>{item.month}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>Devices by Platform</div>
          <div className={styles.chartSub}>Current distribution</div>
          <div className={styles.platformList}>
            {platformBreakdown.map((item, index) => (
              <div className={styles.platformItem} key={item.name}>
                <div className={styles.platformTop}>
                  <span>{item.name}</span>
                  <strong>{item.value}</strong>
                </div>
                <div className={styles.platformTrack}>
                  <div className={`${styles.platformFill} ${platformBarClass[index]}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div className={styles.tableTitle}>Recently Registered Organizations</div>
          <Link className={styles.viewAll} href="/organizations">View All</Link>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Organization</th>
              <th>Industry</th>
              <th>Devices</th>
              <th>Status</th>
              <th>Registered</th>
            </tr>
          </thead>
          <tbody>
            {recentOrganizations.map((org) => (
              <tr key={org.name}>
                <td className={styles.orgName}>{org.name}</td>
                <td>{org.industry}</td>
                <td>{org.devices}</td>
                <td>
                  <span className={`${styles.statusBadge} ${statusClass[org.status]}`}>
                    <span className={styles.statusDot} />
                    {org.status}
                  </span>
                </td>
                <td className={styles.muted}>{org.joined}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
