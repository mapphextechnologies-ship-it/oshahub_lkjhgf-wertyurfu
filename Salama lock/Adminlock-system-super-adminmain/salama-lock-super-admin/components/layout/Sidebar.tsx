import Link from "next/link";
import { BellRing, Building2, CreditCard, Gauge, LockKeyhole, MonitorSmartphone, ReceiptText, ScrollText, Settings, UsersRound } from "lucide-react";
import styles from "./Sidebar.module.css";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge },
  { label: "Organizations", href: "/organizations", icon: Building2 },
  { label: "Platform Admins", href: "/admins", icon: UsersRound },
  { label: "Subscriptions", href: "/subscriptions", icon: CreditCard },
  { label: "Revenue", href: "/revenue", icon: ReceiptText },
  { label: "Devices", href: "/devices", icon: MonitorSmartphone },
  { label: "Audit Logs", href: "/audit-logs", icon: ScrollText },
  { label: "Notifications", href: "/notifications", icon: BellRing },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <Link className={styles.logo} href="/dashboard">
        <div className={styles.logoIcon}><LockKeyhole size={17} /></div>
        <div>
          <div className={styles.logoName}>Salama Lock</div>
          <div className={styles.logoSub}>Super Admin</div>
        </div>
      </Link>

      <nav className={styles.nav}>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} className={styles.navItem} href={item.href}>
              <Icon className={styles.navIcon} size={16} strokeWidth={2.2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.footer}>
        <div className={styles.user}>
          <div className={styles.avatar}>SA</div>
          <div>
            <div className={styles.userName}>Super Admin</div>
            <div className={styles.userRole}>admin@salamalock.com</div>
          </div>
        </div>
      </div>
    </aside>
  );
}