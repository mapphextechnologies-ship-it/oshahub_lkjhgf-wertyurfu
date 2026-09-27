"use client";

import { LocateFixed, LockKeyhole, MessageSquareText, Power, RotateCcw, PauseCircle, UnlockKeyhole } from "lucide-react";
import { useState } from "react";
import type { Device } from "@/lib/types";
import styles from "./deviceDetail.module.css";

type CommandName = "Lock" | "Unlock" | "Suspend" | "Locate" | "Message" | "Restart";

interface CommandCenterProps {
  device: Device;
  commands: { name: string; description: string; level: string }[];
  levelClass: Record<string, string>;
}

const commandIcons: Record<CommandName, React.ComponentType<{ size?: number }>> = {
  Lock: LockKeyhole,
  Unlock: UnlockKeyhole,
  Suspend: PauseCircle,
  Locate: LocateFixed,
  Message: MessageSquareText,
  Restart: RotateCcw,
};

export default function CommandCenter({ device, commands, levelClass }: CommandCenterProps) {
  const [status, setStatus] = useState(device.status);
  const [selectedCommand, setSelectedCommand] = useState<CommandName | null>(null);
  const [message, setMessage] = useState("Your device is restricted by Salama Lock. Contact your organization admin for support.");
  const [reason, setReason] = useState("Platform admin review");
  const [notice, setNotice] = useState("");
  const [logs, setLogs] = useState([
    { title: "Command center ready", detail: `${device.name} can receive supported platform commands.`, time: "Now" },
  ]);

  function runCommand(command: CommandName) {
    if (command === "Lock") setStatus("Locked");
    if (command === "Unlock") setStatus("Active");
    if (command === "Suspend") setStatus("Suspended");

    const detail = command === "Message" || command === "Lock"
      ? `Message: ${message}`
      : command === "Locate"
        ? "Latest supported location requested."
        : `Reason: ${reason}`;

    setNotice(`${command} command queued for ${device.name}.`);
    setLogs((current) => [{ title: `${command} command queued`, detail, time: "Just now" }, ...current].slice(0, 6));
    setSelectedCommand(null);
  }

  return (
    <>
      {notice && <div className={styles.notice}><Power size={15} /> {notice}</div>}
      <div className={styles.commandPanel}>
        <div>
          <div className={styles.sectionTitle}>Command Center</div>
          <div className={styles.sectionSub}>Queue supported actions for this device. Commands are logged before delivery to the backend command service.</div>
        </div>
        <div className={styles.commandGrid}>
          {commands.map((command) => {
            const name = command.name as CommandName;
            const Icon = commandIcons[name];
            return (
              <button className={styles.commandButton} key={command.name} onClick={() => setSelectedCommand(name)}>
                <span className={styles.commandHeader}><Icon size={18} /> <span className={styles.commandName}>{command.name}</span></span>
                <span className={styles.commandDesc}>{command.description}</span>
                <span className={`${styles.levelBadge} ${levelClass[command.level]}`}>{command.level}</span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedCommand && (
        <section className={styles.card}>
          <div className={styles.cardTitle}>Confirm {selectedCommand}</div>
          <div className={styles.confirmGrid}>
            <label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
            {(selectedCommand === "Lock" || selectedCommand === "Message") && (
              <label className={styles.fullField}>Admin Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} /></label>
            )}
          </div>
          <div className={styles.confirmActions}>
            <button className={selectedCommand === "Lock" || selectedCommand === "Suspend" ? styles.dangerAction : styles.primaryAction} onClick={() => runCommand(selectedCommand)}>
              <Power size={15} /> Confirm {selectedCommand}
            </button>
            <button className={styles.secondaryAction} onClick={() => setSelectedCommand(null)}>Cancel</button>
          </div>
        </section>
      )}

      <section className={styles.card}>
        <div className={styles.cardTitle}>Command Results</div>
        <div className={styles.timeline}>
          <div className={styles.infoRow}><span className={styles.infoLabel}>Current Status</span><span className={styles.infoValue}>{status}</span></div>
          {logs.map((log) => (
            <div className={styles.timelineItem} key={`${log.title}-${log.time}`}>
              <div className={`${styles.timelineDot} ${styles.eventInfo}`} />
              <div>
                <div className={styles.timelineTitle}>{log.title}</div>
                <div className={styles.timelineDetail}>{log.detail}</div>
                <div className={styles.timelineTime}>{log.time}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}