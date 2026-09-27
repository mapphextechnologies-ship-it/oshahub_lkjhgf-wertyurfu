"use client";

import { CheckCircle2, Crown, Eye, Headset, KeyRound, Plus, ShieldCheck, UserCog } from "lucide-react";
import { useEffect, useState } from "react";
import type { OrgUser } from "@/lib/types";
import styles from "../workspace.module.css";

const storageKey = "salama-org-users";

const statusClass: Record<OrgUser["status"], string> = {
  Active: styles.statusActive,
  Invited: styles.statusInvited,
  Suspended: styles.statusLocked,
};

const roleIcons = {
  "Organization Super Admin": Crown,
  "Branch Admin": ShieldCheck,
  "Recovery Agent": KeyRound,
  "Support Agent": Headset,
  Viewer: Eye,
};

const permissions: Record<string, string[]> = {
  "Organization Super Admin": ["All branches", "Add users", "Enroll devices", "Lock and unlock", "Billing"],
  "Branch Admin": ["Own branch", "Enroll devices", "Lock devices", "View branch logs"],
  "Recovery Agent": ["Assigned devices", "Lock devices", "Send messages", "View recovery queue"],
  "Support Agent": ["View devices", "Send messages", "Create support notes"],
  Viewer: ["Read only reports", "Read only devices"],
};

interface UserManagerProps {
  initialUsers: OrgUser[];
}

const emptyUser = {
  name: "",
  email: "",
  role: "Branch Admin",
  branch: "Nairobi CBD",
};

export default function UserManager({ initialUsers }: UserManagerProps) {
  const [users, setUsers] = useState<OrgUser[]>(initialUsers);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyUser);
  const [notice, setNotice] = useState("");


  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(users));
  }, [users]);

  function updateField(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function inviteUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const user: OrgUser = {
      id: `U-${Date.now().toString().slice(-4)}`,
      name: form.name,
      email: form.email,
      role: form.role,
      branch: form.role === "Organization Super Admin" ? "All Branches" : form.branch,
      devices: 0,
      status: "Invited",
    };
    setUsers((current) => [user, ...current]);
    setForm(emptyUser);
    setShowForm(false);
    setNotice(`${user.name} invited as ${user.role}.`);
  }

  return (
    <>
      <div className={styles.pageHeader}>
        <div><div className={styles.pageTitle}>Users</div><div className={styles.pageSub}>Register admins and control what each role can do inside this organization.</div></div>
        <button className={styles.primaryBtn} onClick={() => setShowForm((value) => !value)}><Plus size={15} /> {showForm ? "Close Form" : "Register Admin"}</button>
      </div>

      {notice && <div className={styles.notice}><CheckCircle2 size={16} /> {notice}</div>}

      {showForm && (
        <section className={styles.panel}>
          <div className={styles.panelTitle}><UserCog size={17} /> Register Organization Admin User</div>
          <form className={styles.formGrid} onSubmit={inviteUser}>
            <label>Full Name<input required value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="Jane Admin" /></label>
            <label>Email<input required type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} placeholder="jane@company.co.ke" /></label>
            <label>Role<select value={form.role} onChange={(event) => updateField("role", event.target.value)}>{Object.keys(permissions).map((role) => <option key={role}>{role}</option>)}</select></label>
            <label>Branch<select value={form.branch} onChange={(event) => updateField("branch", event.target.value)} disabled={form.role === "Organization Super Admin"}><option>Nairobi CBD</option><option>Thika</option><option>Mombasa</option><option>Nakuru</option></select></label>
            <div className={styles.fullField}>
              <div className={styles.panelSub}>Permissions for this role</div>
              <div className={styles.permissionList}>{permissions[form.role].map((item) => <span className={styles.permissionPill} key={item}>{item}</span>)}</div>
            </div>
            <div className={styles.formActions}><button className={styles.primaryBtn} type="submit">Send Invite</button><button className={styles.secondaryBtn} type="button" onClick={() => setShowForm(false)}>Cancel</button></div>
          </form>
        </section>
      )}

      <div className={styles.cardsGrid}>
        {Object.entries(permissions).map(([role, items]) => {
          const Icon = roleIcons[role as keyof typeof roleIcons];
          return (
            <div className={styles.policyCard} key={role}>
              <div className={styles.policyName}><Icon size={17} /> {role}</div>
              <div className={styles.permissionList}>{items.map((item) => <span className={styles.permissionPill} key={item}>{item}</span>)}</div>
            </div>
          );
        })}
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}><div className={styles.tableTitle}>Team Access</div></div>
        <table className={styles.table}>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branch Scope</th><th>Devices</th><th>Status</th></tr></thead>
          <tbody>{users.map((user) => <tr key={user.id}><td className={styles.strong}>{user.name}</td><td>{user.email}</td><td>{user.role}</td><td>{user.branch}</td><td>{user.devices}</td><td><span className={`${styles.status} ${statusClass[user.status]}`}>{user.status}</span></td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}