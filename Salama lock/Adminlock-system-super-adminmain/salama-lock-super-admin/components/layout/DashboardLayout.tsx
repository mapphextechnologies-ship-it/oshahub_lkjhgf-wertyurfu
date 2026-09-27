import Link from "next/link";
import { Bell, ChevronLeft, UserRound } from "lucide-react";
import Sidebar from "./Sidebar";
import GlobalSearch from "./GlobalSearch";
import styles from "./DashboardLayout.module.css";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  showBack?: boolean;
  showNotif?: boolean;
}

export default function DashboardLayout({ children, title, showBack = false, showNotif = false }: DashboardLayoutProps) {
  return (
    <div className={styles.root}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.topbarLeft}>
            {showBack && (
              <Link className={styles.backBtn} href="/organizations">
                <ChevronLeft size={15} />
                Back
              </Link>
            )}
            <div className={styles.topbarTitle}>{title}</div>
          </div>
          <div className={styles.topbarRight}>
            <GlobalSearch />
            {showNotif && (
              <Link className={styles.notifBtn} href="/notifications" aria-label="Notifications">
                <Bell size={16} />
                <span className={styles.notifCount}>3</span>
              </Link>
            )}
            <div className={styles.topbarAvatar} title="Super Admin"><UserRound size={16} /></div>
          </div>
        </div>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}