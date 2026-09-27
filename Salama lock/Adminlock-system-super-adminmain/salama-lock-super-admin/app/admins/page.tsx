"use client";

import { CheckCircle2, Crown, Eye, KeyRound, Plus, ShieldCheck, UserCog } from "lucide-react";
import { useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import styles from "./admins.module.css";

const roles = {
  "Platform Owner": ["All platform settings", "Billing", "Organizations", "Commands"],
  "Operations Admin": ["Organizations", "Devices", "Commands", "Audit logs"],
  "Billing Admin": ["Subscriptions", "Revenue", "Invoices"],
  "Support Agent": ["Organizations", "Devices", "Notifications"],
  Viewer: ["Read-only dashboards", "Read-only reports"],
};

const roleIcons = {
  "Platform Owner": Crown,
  "Operations Admin": ShieldCheck,
  "Billing Admin": KeyRound,
  "Support Agent": UserCog,
  Viewer: Eye,
};

const initialAdmins = [
  { name: "Super Admin", email: "admin@salamalock.com", role: "Platform Owner", status: "Active" },
  { name: "Mary Wambui", email: "mary@salamalock.com", role: "Operations Admin", status: "Active" },
  { name: "Kevin Otieno", email: "kevin@salamalock.com", role: "Support Agent", status: "Invited" },
];

export default function AdminsPage() {
  const [admins, setAdmins] = useState(initialAdmins);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ name: "", email: "", role: "Operations Admin" });

  const totals = useMemo(() => ({ active: admins.filter((admin) => admin.status === "Active").length, invited: admins.filter((admin) => admin.status === "Invited").length }), [admins]);

  function updateField(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function inviteAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const admin = { ...form, status: "Invited" };
    setAdmins((current) => [admin, ...current]);
    setForm({ name: "", email: "", role: "Operations Admin" });
    setShowForm(false);
    setNotice(`${admin.name} invited as ${admin.role}.`);
  }

  return (
    <DashboardLayout title="Platform Admins" showNotif>
      <div className={styles.pageHeader}>
        <div><div className={styles.pageTitle}>Platform Admins</div><div className={styles.pageSub}>Invite Salama Lock staff and control what they can access.</div></div>
        <button className={styles.primaryBtn} onClick={() => setShowForm((value) => !value)}><Plus size={15} /> {showForm ? "Close Form" : "Invite Admin"}</button>
      </div>
      {notice && <div className={styles.notice}><CheckCircle2 size={16} /> {notice}</div>}
      <div className={styles.stats}><div className={styles.statCard}><span>Active</span><strong>{totals.active}</strong></div><div className={styles.statCard}><span>Invited</span><strong>{totals.invited}</strong></div><div className={styles.statCard}><span>Roles</span><strong>{Object.keys(roles).length}</strong></div></div>
      {showForm && <section className={styles.panel}><div className={styles.panelTitle}>Invite Platform Admin</div><form className={styles.formGrid} onSubmit={inviteAdmin}><label>Name<input required value={form.name} onChange={(event) => updateField("name", event.target.value)} /></label><label>Email<input required type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} /></label><label>Role<select value={form.role} onChange={(event) => updateField("role", event.target.value)}>{Object.keys(roles).map((role) => <option key={role}>{role}</option>)}</select></label><div className={styles.formActions}><button className={styles.primaryBtn} type="submit">Send Invite</button><button className={styles.secondaryBtn} type="button" onClick={() => setShowForm(false)}>Cancel</button></div></form></section>}
      <div className={styles.roleGrid}>{Object.entries(roles).map(([role, permissions]) => { const Icon = roleIcons[role as keyof typeof roleIcons]; return <div className={styles.roleCard} key={role}><div className={styles.roleName}><Icon size={17} /> {role}</div><div className={styles.permissionList}>{permissions.map((item) => <span className={styles.permissionPill} key={item}>{item}</span>)}</div></div>; })}</div>
      <div className={styles.tableCard}><div className={styles.tableTitle}>Admin Users</div><table className={styles.table}><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>{admins.map((admin) => <tr key={admin.email}><td>{admin.name}</td><td>{admin.email}</td><td>{admin.role}</td><td><span className={admin.status === "Active" ? styles.statusActive : styles.statusInvited}>{admin.status}</span></td></tr>)}</tbody></table></div>
    </DashboardLayout>
  );
}