"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { devices } from "@/lib/mockData";
import styles from "./devices.module.css";

const statusClass: Record<string, string> = {
  Active: styles.statusActive,
  Locked: styles.statusLocked,
  Offline: styles.statusOffline,
  Suspended: styles.statusSuspended,
};

const statItems = [
  { label: "Total Devices", value: "1,100", sub: "across all orgs" },
  { label: "Active", value: "874", sub: "online now" },
  { label: "Locked", value: "142", sub: "enforcement active" },
  { label: "Offline", value: "68", sub: "not responding" },
  { label: "Suspended", value: "16", sub: "pending review" },
];

export default function DevicesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");

  const filtered = devices.filter((device) => {
    const searchText = `${device.name} ${device.org} ${device.imei}`.toLowerCase();
    const matchSearch = searchText.includes(search.toLowerCase());
    const matchStatus = statusFilter === "All" || device.status === statusFilter;
    const matchType = typeFilter === "All" || device.type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  return (
    <DashboardLayout title="Devices">
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Devices</div>
          <div className={styles.pageSub}>All registered devices across every organization on the platform.</div>
        </div>
      </div>

      <div className={styles.stats}>
        {statItems.map((item) => (
          <div className={styles.statCard} key={item.label}>
            <div className={styles.statLabel}>{item.label}</div>
            <div className={styles.statValue}>{item.value}</div>
            <div className={styles.statSub}>{item.sub}</div>
          </div>
        ))}
      </div>

      <div className={styles.filters}>
        <input
          className={styles.search}
          placeholder="Search by name, IMEI, or organization..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {["All", "Active", "Locked", "Offline", "Suspended"].map((status) => (
          <button
            key={status}
            className={`${styles.filterBtn} ${statusFilter === status ? styles.filterBtnActive : ""}`}
            onClick={() => setStatusFilter(status)}
          >
            {status}
          </button>
        ))}
        {["All", "Phone", "Laptop", "Tablet"].map((type) => (
          <button
            key={type}
            className={`${styles.filterBtn} ${typeFilter === type ? styles.filterBtnActive : ""}`}
            onClick={() => setTypeFilter(type)}
          >
            {type}
          </button>
        ))}
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableMeta}>{filtered.length} device{filtered.length !== 1 ? "s" : ""} found</div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Device</th>
              <th>Organization</th>
              <th>Type</th>
              <th>OS</th>
              <th>Assigned To</th>
              <th>Status</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((device) => (
              <tr key={device.id} className={styles.clickableRow} onClick={() => router.push(`/devices/${device.id}`)}>
                <td>
                  <div className={styles.deviceName}>{device.name}</div>
                  <div className={styles.deviceImei}>{device.imei}</div>
                </td>
                <td>{device.org}</td>
                <td>{device.type}</td>
                <td>
                  <span className={styles.osBadge}>{device.os} {device.osVersion}</span>
                </td>
                <td>{device.assignedTo}</td>
                <td>
                  <span className={`${styles.statusBadge} ${statusClass[device.status]}`}>
                    <span className={styles.statusDot} />
                    {device.status}
                  </span>
                </td>
                <td className={styles.muted}>{device.lastSeen}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
