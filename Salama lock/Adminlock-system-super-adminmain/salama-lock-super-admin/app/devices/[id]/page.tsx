"use client";

import { useParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { deviceCommands, deviceEvents, devices } from "@/lib/mockData";
import CommandCenter from "./CommandCenter";
import styles from "./deviceDetail.module.css";

const statusClass: Record<string, string> = {
  Active: styles.statusActive,
  Locked: styles.statusLocked,
  Offline: styles.statusOffline,
  Suspended: styles.statusSuspended,
};

const levelClass: Record<string, string> = {
  Normal: styles.levelNormal,
  Medium: styles.levelMedium,
  High: styles.levelHigh,
};

const eventClass: Record<string, string> = {
  info: styles.eventInfo,
  policy: styles.eventPolicy,
  lock: styles.eventLock,
  message: styles.eventMessage,
  warning: styles.eventWarning,
};

function getDeviceHealth(status: string) {
  if (status === "Active") return "Healthy";
  if (status === "Locked") return "Locked by policy";
  if (status === "Suspended") return "Suspended";
  return "Needs attention";
}

export default function DeviceDetailPage() {
  const params = useParams<{ id: string }>();
  const device = devices.find((item) => item.id === params.id) ?? devices[0];
  const events = deviceEvents.filter((event) => event.deviceId === device.id);
  const policyName = device.org === "Bumu PayGo" ? "Finance Lock Policy" : device.type === "Laptop" ? "Endpoint Compliance Policy" : "Standard Device Policy";
  const enrollment = device.os === "Android" ? "Android Agent 1.4.0" : `${device.os} Agent Preview`;

  return (
    <DashboardLayout title={device.name} showBack>
      <div className={styles.header}>
        <div>
          <div className={styles.deviceName}>{device.name}</div>
          <div className={styles.deviceMeta}>{device.org} - {device.type} - {device.os} {device.osVersion}</div>
        </div>
        <span className={`${styles.statusBadge} ${statusClass[device.status]}`}>
          <span className={styles.statusDot} />
          {device.status}
        </span>
      </div>

      <div className={styles.stats}>
        {[
          { label: "Health", value: getDeviceHealth(device.status), sub: "current device state" },
          { label: "Last Seen", value: device.lastSeen, sub: "latest agent heartbeat" },
          { label: "Assigned To", value: device.assignedTo, sub: "current user or pool" },
          { label: "Policy", value: policyName, sub: "active enforcement profile" },
        ].map((item) => (
          <div className={styles.statCard} key={item.label}>
            <div className={styles.statLabel}>{item.label}</div>
            <div className={styles.statValue}>{item.value}</div>
            <div className={styles.statSub}>{item.sub}</div>
          </div>
        ))}
      </div>

      <CommandCenter device={device} commands={deviceCommands} levelClass={levelClass} />

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardTitle}>Device Profile</div>
          {[
            { label: "Device Name", value: device.name },
            { label: "IMEI / Serial", value: device.imei },
            { label: "Organization", value: device.org },
            { label: "Device Type", value: device.type },
            { label: "Operating System", value: `${device.os} ${device.osVersion}` },
            { label: "Agent", value: enrollment },
          ].map((row) => (
            <div className={styles.infoRow} key={row.label}>
              <span className={styles.infoLabel}>{row.label}</span>
              <span className={styles.infoValue}>{row.value}</span>
            </div>
          ))}
        </section>

        <section className={styles.card}>
          <div className={styles.cardTitle}>Policy & Compliance</div>
          {[
            { label: "Policy", value: policyName },
            { label: "Encryption", value: device.type === "Laptop" ? "Required" : "Recommended" },
            { label: "Heartbeat", value: device.status === "Offline" ? "Missed" : "On schedule" },
            { label: "Factory Reset Protection", value: device.os === "Android" ? "Enabled" : "Depends on platform" },
            { label: "Location", value: device.status === "Offline" ? "Unavailable" : "Last known supported" },
            { label: "Risk", value: device.status === "Active" ? "Low" : "Review needed" },
          ].map((row) => (
            <div className={styles.infoRow} key={row.label}>
              <span className={styles.infoLabel}>{row.label}</span>
              <span className={styles.infoValue}>{row.value}</span>
            </div>
          ))}
        </section>
      </div>

      <section className={styles.card}>
        <div className={styles.cardTitle}>Device Timeline</div>
        <div className={styles.timeline}>
          {events.length ? events.map((event) => (
            <div className={styles.timelineItem} key={`${event.event}-${event.time}`}>
              <div className={`${styles.timelineDot} ${eventClass[event.type]}`} />
              <div>
                <div className={styles.timelineTitle}>{event.event}</div>
                <div className={styles.timelineDetail}>{event.detail}</div>
                <div className={styles.timelineTime}>{event.time}</div>
              </div>
            </div>
          )) : (
            <div className={styles.emptyState}>No timeline events recorded for this device yet.</div>
          )}
        </div>
      </section>
    </DashboardLayout>
  );
}
