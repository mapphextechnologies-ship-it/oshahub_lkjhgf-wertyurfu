"use client";

import { CheckCircle2, LocateFixed, LockKeyhole, MessageSquareText, Power, RotateCcw, UnlockKeyhole } from "lucide-react";
import { useState } from "react";
import type { AuditEvent, OrgDevice } from "@/lib/types";
import styles from "../../workspace.module.css";

const logKey = "salama-org-command-log";

type Command = "Lock" | "Unlock" | "Locate" | "Message" | "Restart";

const commandIcons = {
  Lock: LockKeyhole,
  Unlock: UnlockKeyhole,
  Locate: LocateFixed,
  Message: MessageSquareText,
  Restart: RotateCcw,
};

interface DeviceCommandCenterProps {
  device: OrgDevice;
  events: AuditEvent[];
}

const commandCopy: Record<Command, string> = {
  Lock: "Lock this device and show the admin message on the phone.",
  Unlock: "Remove the active lock and allow the user to access the device.",
  Locate: "Request the latest device location from the agent app.",
  Message: "Send a visible admin message to the device user.",
  Restart: "Request a device restart when supported by the platform.",
};

export default function DeviceCommandCenter({ device, events }: DeviceCommandCenterProps) {
  const [status, setStatus] = useState(device.status);
  const [activeCommand, setActiveCommand] = useState<Command | null>(null);
  const [message, setMessage] = useState("Payment is overdue. Please contact your branch to restore access.");
  const [reason, setReason] = useState("Loan repayment overdue");
  const [notice, setNotice] = useState("");
  const [logs, setLogs] = useState<AuditEvent[]>(events);


  function record(command: Command) {
    const newEvent: AuditEvent = {
      action: `${command} command sent`,
      actor: "Irene Kamau",
      target: device.id,
      time: "Just now",
      severity: command === "Lock" ? "Critical" : command === "Unlock" ? "Warning" : "Info",
    };
    const savedLogs = [newEvent, ...logs].slice(0, 12);
    setLogs(savedLogs);
    window.localStorage.setItem(logKey, JSON.stringify(savedLogs));
  }

  function runCommand(command: Command) {
    if (command === "Lock") setStatus("Locked");
    if (command === "Unlock") setStatus("Online");
    if (command === "Locate") setNotice("Location request sent. Latest known area: Nairobi CBD, within 80m accuracy.");
    if (command === "Message") setNotice(`Message sent to ${device.user}: ${message}`);
    if (command === "Restart") setNotice("Restart command queued. Device will restart after next check-in.");
    if (command === "Lock") setNotice(`Device locked. Message shown: ${message}`);
    if (command === "Unlock") setNotice(`Device unlocked. Reason: ${reason}`);
    record(command);
    setActiveCommand(null);
  }

  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>{device.name}</div>
          <div className={styles.pageSub}>{device.id} - {device.user} - {device.branch}</div>
        </div>
        <div className={styles.actions}>
          <button className={styles.dangerBtn} onClick={() => setActiveCommand("Lock")}><LockKeyhole size={15} /> Lock Device</button>
          <button className={styles.primaryBtn} onClick={() => setActiveCommand("Unlock")}><UnlockKeyhole size={15} /> Unlock</button>
        </div>
      </div>

      {notice && <div className={styles.notice}><CheckCircle2 size={16} /> {notice}</div>}

      <div className={styles.commandGrid}>
        {(["Lock", "Unlock", "Locate", "Message", "Restart"] as Command[]).map((command) => {
          const Icon = commandIcons[command];
          return (
            <button className={styles.commandBtn} key={command} onClick={() => setActiveCommand(command)}>
              <Icon size={19} />
              <span>{command}</span>
            </button>
          );
        })}
      </div>

      {activeCommand && (
        <section className={styles.panel}>
          <div className={styles.panelTitle}>{activeCommand} Device</div>
          <div className={styles.panelSub}>{commandCopy[activeCommand]}</div>
          <div className={styles.formGridCompact}>
            <label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
            {(activeCommand === "Lock" || activeCommand === "Message") && <label className={styles.fullField}>Admin Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} /></label>}
          </div>
          <div className={styles.formActions}>
            <button className={activeCommand === "Lock" ? styles.dangerBtn : styles.primaryBtn} onClick={() => runCommand(activeCommand)}><Power size={15} /> Confirm {activeCommand}</button>
            <button className={styles.secondaryBtn} onClick={() => setActiveCommand(null)}>Cancel</button>
          </div>
        </section>
      )}

      <div className={styles.gridTwo}>
        <section className={styles.panel}>
          <div className={styles.panelTitle}>Device Profile</div>
          <div className={styles.healthList}>
            <div className={styles.itemTop}><span>Platform</span><strong>{device.platform}</strong></div>
            <div className={styles.itemTop}><span>Status</span><strong>{status}</strong></div>
            <div className={styles.itemTop}><span>Policy</span><strong>{device.policy}</strong></div>
            <div className={styles.itemTop}><span>Last Seen</span><strong>{device.lastSeen}</strong></div>
            <div className={styles.itemTop}><span>Access Level</span><strong>Organization Admin</strong></div>
          </div>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelTitle}>Command Audit Trail</div>
          <div className={styles.timeline}>
            {logs.map((event, index) => (
              <div className={styles.timelineItem} key={`${event.action}-${event.time}-${index}`}>
                <div className={styles.itemName}>{event.action}</div>
                <div className={styles.itemMeta}>{event.actor} - {event.target} - {event.time}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}