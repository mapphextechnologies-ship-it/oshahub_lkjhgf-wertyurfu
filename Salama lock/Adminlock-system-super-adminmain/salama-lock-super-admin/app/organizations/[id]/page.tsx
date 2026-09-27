"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  auditLogs,
  devices,
  organizationActivities,
  organizationBranches,
  organizationPolicies,
  organizationSubscriptions,
  organizationUsers,
  organizations,
} from "@/lib/mockData";
import styles from "./orgDetail.module.css";

const tabs = ["Overview", "Devices", "Users", "Branches", "Policies", "Billing", "Audit Logs"];

const activityClass: Record<string, string> = {
  lock: styles.activityLock,
  user: styles.activityUser,
  policy: styles.activityPolicy,
  device: styles.activityDevice,
  branch: styles.activityBranch,
};

const statusClass: Record<string, string> = {
  Active: styles.statusActive,
  Pending: styles.statusPending,
  Suspended: styles.statusSuspended,
  Locked: styles.statusLocked,
  Offline: styles.statusOffline,
  Invited: styles.statusPending,
  Paid: styles.statusActive,
  Overdue: styles.statusSuspended,
};

function getMaxDevices(plan: string) {
  if (plan === "Enterprise") return 50000;
  if (plan === "Business") return 10000;
  if (plan === "Growth") return 1000;
  return 100;
}

export default function OrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState("Overview");
  const [orgStatus, setOrgStatus] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<"Edit" | "Suspend" | "Message" | null>(null);
  const [message, setMessage] = useState("Your Salama Lock workspace has a platform notice. Please contact support for details.");
  const org = organizations.find((item) => item.id === params.id) ?? organizations[0];

  const maxDevices = getMaxDevices(org.plan);
  const activeDevices = Math.max(org.devices - 22, 0);
  const lockedDevices = Math.min(18, org.devices);
  const branches = organizationBranches.filter((branch) => branch.org === org.name);
  const users = organizationUsers.filter((user) => user.org === org.name);
  const policies = organizationPolicies.filter((policy) => policy.org === org.name);
  const orgDevices = devices.filter((device) => device.org === org.name);
  const subscription = organizationSubscriptions.find((item) => item.org === org.name);
  const logs = auditLogs.filter((log) => log.org === org.name);

  const progressClass = org.plan === "Enterprise" ? styles.progressEnterprise : org.plan === "Business" ? styles.progressBusiness : org.plan === "Growth" ? styles.progressGrowth : styles.progressStarter;

  return (
    <DashboardLayout title={org.name} showBack>
      <div className={styles.header}>
        <div>
          <div className={styles.orgName}>{org.name}</div>
          <div className={styles.orgMeta}>{org.industry} - {org.country} - Joined {org.joined}</div>
        </div>
        <div className={styles.headerActions}>
          <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setActionMode("Edit")}>Edit</button>
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => setActionMode("Suspend")}>Suspend</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setActionMode("Message")}>Send Message</button>
        </div>
      </div>

      {orgStatus && <div className={styles.notice}>{orgStatus}</div>}

      {actionMode && (
        <section className={styles.actionPanel}>
          <div>
            <div className={styles.cardTitle}>{actionMode} Organization</div>
            <div className={styles.actionSub}>{actionMode === "Edit" ? "Open editable organization settings when backend persistence is connected." : actionMode === "Suspend" ? "Suspend this organization and block new device commands until reviewed." : "Send a platform message to the organization owner."}</div>
          </div>
          {actionMode === "Message" && <textarea className={styles.actionTextarea} value={message} onChange={(event) => setMessage(event.target.value)} />}
          <div className={styles.headerActions}>
            <button className={`${styles.btn} ${actionMode === "Suspend" ? styles.btnDanger : styles.btnPrimary}`} onClick={() => { setOrgStatus(actionMode === "Suspend" ? `${org.name} marked for suspension review.` : actionMode === "Edit" ? `${org.name} edit workspace opened.` : `Message sent to ${org.contact}.`); setActionMode(null); }}>Confirm {actionMode}</button>
            <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setActionMode(null)}>Cancel</button>
          </div>
        </section>
      )}

      <div className={styles.stats}>
        {[
          { label: "Total Devices", value: org.devices, sub: `of ${maxDevices.toLocaleString()} max` },
          { label: "Active Devices", value: activeDevices, sub: "currently online" },
          { label: "Locked Devices", value: lockedDevices, sub: "enforcement active" },
          { label: "Users", value: users.length || branches.length * 3 + 2, sub: `across ${branches.length || 1} branches` },
        ].map((item) => (
          <div className={styles.stat} key={item.label}>
            <div className={styles.statLabel}>{item.label}</div>
            <div className={styles.statValue}>{item.value}</div>
            <div className={styles.statSub}>{item.sub}</div>
          </div>
        ))}
      </div>

      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
            key={tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Overview" && (
        <div className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Organization Info</div>
            {[
              { label: "Contact Person", value: org.contact },
              { label: "Email", value: org.email },
              { label: "Country", value: org.country },
              { label: "Industry", value: org.industry },
              {
                label: "Status", value: (
                  <span className={`${styles.statusBadge} ${statusClass[org.status]}`}>
                    <span className={styles.statusDot} />{org.status}
                  </span>
                )
              },
              { label: "Plan", value: <span className={styles.planHighlight}>{org.plan}</span> },
            ].map((row) => (
              <div className={styles.infoRow} key={row.label}>
                <span className={styles.infoLabel}>{row.label}</span>
                <span className={styles.infoValue}>{row.value}</span>
              </div>
            ))}
            <div className={styles.progressLabel}>Device Usage - {org.devices} / {maxDevices.toLocaleString()}</div>
            <div className={styles.progressBar}>
              <div className={`${styles.progressFill} ${progressClass}`} />
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>Recent Activity</div>
            {organizationActivities.map((activity) => (
              <div className={styles.activityItem} key={`${activity.action}-${activity.time}`}>
                <div className={`${styles.activityDot} ${activityClass[activity.type]}`} />
                <div>
                  <div className={styles.activityAction}>{activity.action}</div>
                  <div className={styles.activityDetail}>{activity.detail}</div>
                  <div className={styles.activityTime}>{activity.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "Devices" && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Registered Devices</div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Device</th>
                <th>Type</th>
                <th>OS</th>
                <th>Assigned To</th>
                <th>Status</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {orgDevices.map((device) => (
                <tr key={device.id}>
                  <td>
                    <div className={styles.itemTitle}>{device.name}</div>
                    <div className={styles.itemSub}>{device.imei}</div>
                  </td>
                  <td>{device.type}</td>
                  <td>{device.os} {device.osVersion}</td>
                  <td>{device.assignedTo}</td>
                  <td><span className={`${styles.statusBadge} ${statusClass[device.status]}`}><span className={styles.statusDot} />{device.status}</span></td>
                  <td className={styles.muted}>{device.lastSeen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "Users" && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Organization Users</div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Branch</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.email}>
                  <td className={styles.itemTitle}>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{user.branch}</td>
                  <td><span className={`${styles.statusBadge} ${statusClass[user.status]}`}><span className={styles.statusDot} />{user.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "Branches" && (
        <div className={styles.cardGrid}>
          {branches.map((branch) => (
            <div className={styles.smallCard} key={branch.name}>
              <div className={styles.itemTitle}>{branch.name}</div>
              <div className={styles.itemSub}>Manager: {branch.manager}</div>
              <div className={styles.metricRow}><span>Devices</span><strong>{branch.devices}</strong></div>
              <div className={styles.metricRow}><span>Users</span><strong>{branch.users}</strong></div>
              <span className={`${styles.statusBadge} ${statusClass[branch.status]}`}><span className={styles.statusDot} />{branch.status}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === "Policies" && (
        <div className={styles.cardGrid}>
          {policies.map((policy) => (
            <div className={styles.smallCard} key={policy.name}>
              <div className={styles.itemTitle}>{policy.name}</div>
              <div className={styles.itemSub}>{policy.rules}</div>
              <div className={styles.metricRow}><span>Assigned Devices</span><strong>{policy.devices}</strong></div>
              <span className={`${styles.statusBadge} ${statusClass[policy.status]}`}><span className={styles.statusDot} />{policy.status}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === "Billing" && subscription && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Billing & Subscription</div>
          {[
            { label: "Current Plan", value: subscription.plan },
            { label: "Device Usage", value: subscription.devices },
            { label: "Status", value: subscription.status },
            { label: "Next Renewal", value: subscription.renewal },
            { label: "Amount", value: subscription.amount },
          ].map((row) => (
            <div className={styles.infoRow} key={row.label}>
              <span className={styles.infoLabel}>{row.label}</span>
              <span className={styles.infoValue}>{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === "Audit Logs" && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Audit Logs</div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Action</th>
                <th>Actor</th>
                <th>Target</th>
                <th>Category</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className={styles.itemTitle}>{log.action}</td>
                  <td>{log.actor}</td>
                  <td>{log.target}</td>
                  <td>{log.category}</td>
                  <td className={styles.muted}>{log.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  );
}
