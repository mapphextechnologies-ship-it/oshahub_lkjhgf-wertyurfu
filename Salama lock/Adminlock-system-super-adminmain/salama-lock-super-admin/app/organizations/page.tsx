"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { organizations } from "@/lib/mockData";
import styles from "./organizations.module.css";

const statusClass: Record<string, string> = {
  Active: styles.statusActive,
  Pending: styles.statusPending,
  Suspended: styles.statusSuspended,
};

const planClass: Record<string, string> = {
  Starter: styles.planStarter,
  Growth: styles.planGrowth,
  Business: styles.planBusiness,
  Enterprise: styles.planEnterprise,
};

export default function OrganizationsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const filtered = organizations.filter((org) => {
    const searchText = `${org.name} ${org.industry}`.toLowerCase();
    const matchSearch = searchText.includes(search.toLowerCase());
    const matchStatus = statusFilter === "All" || org.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <DashboardLayout title="Organizations">
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Organizations</div>
          <div className={styles.pageSub}>Manage all registered organizations on the platform.</div>
        </div>
        <button className={styles.addBtn} onClick={() => router.push("/organizations/create")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Organization
        </button>
      </div>

      <div className={styles.filters}>
        <input
          className={styles.search}
          placeholder="Search by name or industry..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {["All", "Active", "Pending", "Suspended"].map((status) => (
          <button
            key={status}
            className={`${styles.filterBtn} ${statusFilter === status ? styles.filterBtnActive : ""}`}
            onClick={() => setStatusFilter(status)}
          >
            {status}
          </button>
        ))}
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableMeta}>{filtered.length} organization{filtered.length !== 1 ? "s" : ""} found</div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Organization</th>
              <th>Industry</th>
              <th>Country</th>
              <th>Devices</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((org) => (
              <tr key={org.id} onClick={() => router.push(`/organizations/${org.id}`)}>
                <td>
                  <div className={styles.orgName}>{org.name}</div>
                  <div className={styles.orgEmail}>{org.email}</div>
                </td>
                <td>{org.industry}</td>
                <td>{org.country}</td>
                <td>{org.devices}</td>
                <td>
                  <span className={`${styles.planBadge} ${planClass[org.plan]}`}>
                    {org.plan}
                  </span>
                </td>
                <td>
                  <span className={`${styles.statusBadge} ${statusClass[org.status]}`}>
                    <span className={styles.statusDot} />
                    {org.status}
                  </span>
                </td>
                <td className={styles.muted}>{org.joined}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className={styles.actionBtn} onClick={() => router.push(`/organizations/${org.id}`)}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
