"use client";

import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { auditLogs } from "@/lib/mockData";
import styles from "./auditLogs.module.css";

const severityClass: Record<string, string> = {
  Low: styles.severityLow,
  Medium: styles.severityMedium,
  High: styles.severityHigh,
};

const stats = [
  { label: "Events Today", value: "186", sub: "all organizations" },
  { label: "High Severity", value: "9", sub: "needs review" },
  { label: "Commands Issued", value: "42", sub: "lock, unlock, policy" },
  { label: "Admin Actions", value: "73", sub: "users and settings" },
];

export default function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const filtered = auditLogs.filter((log) => {
    const text = `${log.org} ${log.actor} ${log.action} ${log.target}`.toLowerCase();
    return text.includes(search.toLowerCase()) && (category === "All" || log.category === category);
  });

  return (
    <DashboardLayout title="Audit Logs">
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Audit Logs</div>
          <div className={styles.pageSub}>Trace every important platform, organization, user, and device action.</div>
        </div>
        <button className={styles.exportBtn}>Export Logs</button>
      </div>

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
        <input className={styles.search} placeholder="Search logs..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={styles.select} value={category} onChange={(e) => setCategory(e.target.value)}>
          {["All", "Command", "Policy", "User", "Organization", "Device", "Billing"].map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableMeta}>{filtered.length} log entries found</div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Event</th>
              <th>Organization</th>
              <th>Actor</th>
              <th>Target</th>
              <th>Severity</th>
              <th>Time</th>
              <th>IP Address</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((log) => (
              <tr key={log.id}>
                <td>
                  <div className={styles.actionName}>{log.action}</div>
                  <div className={styles.muted}>{log.id} - {log.category}</div>
                </td>
                <td>{log.org}</td>
                <td>{log.actor}</td>
                <td>{log.target}</td>
                <td>
                  <span className={`${styles.badge} ${severityClass[log.severity]}`}>
                    {log.severity}
                  </span>
                </td>
                <td className={styles.muted}>{log.time}</td>
                <td className={styles.muted}>{log.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
