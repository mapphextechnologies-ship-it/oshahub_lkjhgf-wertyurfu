"use client";

import Link from "next/link";
import { BellRing, Building2, CreditCard, Gauge, MapPin, MonitorSmartphone, ScrollText, Settings, ShieldCheck, Users } from "lucide-react";
import styles from "./Sidebar.module.css";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge },
  { label: "Devices", href: "/devices", icon: MonitorSmartphone },
  { label: "Users", href: "/users", icon: Users },
  { label: "Branches", href: "/branches", icon: MapPin },
  { label: "Policies", href: "/policies", icon: ShieldCheck },
  { label: "Billing", href: "/billing", icon: CreditCard },
  { label: "Audit Logs", href: "/audit-logs", icon: ScrollText },
  { label: "Notifications", href: "/notifications", icon: BellRing },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <Link className={styles.logo} href="/dashboard">
        <div className={styles.logoIcon}><Building2 size={17} /></div>
        <div>
          <div className={styles.logoName}>Salama Lock</div>
          <div className={styles.logoSub}>Organization</div>
        </div>
      </Link>

      <nav className={styles.nav}>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link className={styles.navItem} href={item.href} key={item.href}>
              <Icon className={styles.navIcon} size={16} strokeWidth={2.2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.footer}>
        <div className={styles.user}>
          <div className={styles.avatar}>NM</div>
          <div>
            <div className={styles.userName}>Nairobi Mobility</div>
            <div className={styles.userRole}>Business Plan</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
