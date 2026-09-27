"use client";

import Link from "next/link";
import { Bell, Search, UserRound } from "lucide-react";
import Sidebar from "./Sidebar";
import styles from "./DashboardLayout.module.css";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  showNotif?: boolean;
}

export default function DashboardLayout({ children, title, showNotif = true }: DashboardLayoutProps) {
  return (
    <div className={styles.root}>
      <Sidebar />
      <main className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <div className={styles.topbarTitle}>{title}</div>
            <div className={styles.topbarSub}>Nairobi Mobility Finance workspace</div>
          </div>
          <div className={styles.topbarRight}>
            <div className={styles.searchBox}>
              <Search size={15} />
              <span>Search devices, users, branches</span>
            </div>
            {showNotif && (
              <Link className={styles.notifBtn} href="/notifications" aria-label="Notifications">
                <Bell size={16} />
                <span className={styles.notifCount}>3</span>
              </Link>
            )}
            <div className={styles.topbarAvatar} title="Irene Kamau"><UserRound size={16} /></div>
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
