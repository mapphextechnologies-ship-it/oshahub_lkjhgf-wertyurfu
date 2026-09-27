"use client";

import Link from "next/link";
import { CheckCircle2, FileUp, LockKeyhole, Plus, Smartphone, Wifi } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { OrgDevice } from "@/lib/types";
import styles from "../workspace.module.css";

const storageKey = "salama-org-devices";

const statusClass: Record<OrgDevice["status"], string> = {
  Online: styles.statusOnline,
  Locked: styles.statusLocked,
  Offline: styles.statusOffline,
  Warning: styles.statusWarning,
};

interface DeviceManagerProps {
  initialDevices: OrgDevice[];
}

const emptyDevice = {
  imei: "",
  serial: "",
  model: "",
  user: "",
  contact: "",
  branch: "Nairobi CBD",
  platform: "Android",
  policy: "Loan Default Recovery",
  account: "",
  adminMessage: "Payment is overdue. Please contact support to restore access.",
};

export default function DeviceManager({ initialDevices }: DeviceManagerProps) {
  const [devices, setDevices] = useState<OrgDevice[]>(initialDevices);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyDevice);
  const [notice, setNotice] = useState("");


  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(devices));
  }, [devices]);

  const totals = useMemo(() => ({
    total: devices.length,
    locked: devices.filter((device) => device.status === "Locked").length,
    online: devices.filter((device) => device.status === "Online").length,
  }), [devices]);

  function updateField(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function enrollDevice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const idSeed = form.imei || form.serial || `${Date.now()}`;
    const newDevice: OrgDevice = {
      id: `SL-${idSeed.slice(-4).toUpperCase()}`,
      name: `${form.model} - ${form.account || "New Enrollment"}`,
      user: form.user,
      branch: form.branch,
      platform: form.platform,
      status: "Online",
      lastSeen: "Just now",
      policy: form.policy,
    };
    setDevices((current) => [newDevice, ...current]);
    setForm(emptyDevice);
    setShowForm(false);
    setNotice(`${newDevice.name} enrolled and ready for lock commands.`);
  }

  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Devices</div>
          <div className={styles.pageSub}>Monitor financed devices and staff endpoints assigned to this organization.</div>
        </div>
        <div className={styles.actions}>
          <button className={styles.secondaryBtn} onClick={() => setNotice("CSV import queue prepared. Connect backend upload API next.")}><FileUp size={15} /> Import CSV</button>
          <button className={styles.primaryBtn} onClick={() => setShowForm((value) => !value)}><Plus size={15} /> {showForm ? "Close Form" : "Enroll Device"}</button>
        </div>
      </div>

      {notice && <div className={styles.notice}><CheckCircle2 size={16} /> {notice}</div>}

      <div className={styles.statsCompact}>
        <div className={styles.statCard}><div className={styles.statTopLine}><Smartphone size={17} /><div className={styles.statLabel}>Total</div></div><div className={styles.statValue}>{totals.total}</div></div>
        <div className={styles.statCard}><div className={styles.statTopLine}><Wifi size={17} /><div className={styles.statLabel}>Online</div></div><div className={styles.statValue}>{totals.online}</div></div>
        <div className={styles.statCard}><div className={styles.statTopLine}><LockKeyhole size={17} /><div className={styles.statLabel}>Locked</div></div><div className={styles.statValue}>{totals.locked}</div></div>
      </div>

      {showForm && (
        <section className={styles.panel}>
          <div className={styles.panelTitle}>Register Device For Locking</div>
          <form className={styles.formGrid} onSubmit={enrollDevice}>
            <label>IMEI<input required value={form.imei} onChange={(event) => updateField("imei", event.target.value)} placeholder="356938035643809" /></label>
            <label>Serial Number<input required value={form.serial} onChange={(event) => updateField("serial", event.target.value)} placeholder="R58T90AB21P" /></label>
            <label>Device Model<input required value={form.model} onChange={(event) => updateField("model", event.target.value)} placeholder="Samsung A24" /></label>
            <label>Customer/User Name<input required value={form.user} onChange={(event) => updateField("user", event.target.value)} placeholder="Customer full name" /></label>
            <label>Customer Phone/Email<input required value={form.contact} onChange={(event) => updateField("contact", event.target.value)} placeholder="+254... or email" /></label>
            <label>Loan/Account Ref<input required value={form.account} onChange={(event) => updateField("account", event.target.value)} placeholder="Lease 8890" /></label>
            <label>Branch<select value={form.branch} onChange={(event) => updateField("branch", event.target.value)}><option>Nairobi CBD</option><option>Thika</option><option>Mombasa</option><option>Nakuru</option></select></label>
            <label>Platform<select value={form.platform} onChange={(event) => updateField("platform", event.target.value)}><option>Android</option><option>iOS</option><option>Windows</option><option>Linux</option></select></label>
            <label>Lock Policy<select value={form.policy} onChange={(event) => updateField("policy", event.target.value)}><option>Loan Default Recovery</option><option>Staff Endpoint</option><option>Executive Device</option><option>Field Agent Pilot</option></select></label>
            <label className={styles.fullField}>Default Admin Message<textarea value={form.adminMessage} onChange={(event) => updateField("adminMessage", event.target.value)} /></label>
            <div className={styles.formActions}><button className={styles.primaryBtn} type="submit">Save Device</button><button className={styles.secondaryBtn} type="button" onClick={() => setShowForm(false)}>Cancel</button></div>
          </form>
        </section>
      )}

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}><div className={styles.tableTitle}>Managed Devices</div></div>
        <table className={styles.table}>
          <thead><tr><th>Device</th><th>User</th><th>Branch</th><th>Platform</th><th>Policy</th><th>Status</th><th>Last Seen</th></tr></thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.id}>
                <td className={styles.strong}><Link href={`/devices/${device.id}`}>{device.name}</Link></td>
                <td>{device.user}</td><td>{device.branch}</td><td>{device.platform}</td><td>{device.policy}</td>
                <td><span className={`${styles.status} ${statusClass[device.status]}`}>{device.status}</span></td>
                <td className={styles.muted}>{device.lastSeen}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}