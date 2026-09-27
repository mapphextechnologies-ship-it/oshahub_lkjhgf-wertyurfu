"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { devices, organizations } from "@/lib/mockData";
import styles from "./GlobalSearch.module.css";

const pages = [
  { label: "Dashboard", detail: "Platform overview", href: "/dashboard", type: "Page" },
  { label: "Organizations", detail: "All organizations", href: "/organizations", type: "Page" },
  { label: "Platform Admins", detail: "Manage Salama Lock staff", href: "/admins", type: "Page" },
  { label: "Subscriptions", detail: "Plans and active subscriptions", href: "/subscriptions", type: "Page" },
  { label: "Revenue", detail: "Payments and revenue", href: "/revenue", type: "Page" },
  { label: "Devices", detail: "All platform devices", href: "/devices", type: "Page" },
  { label: "Audit Logs", detail: "Security events", href: "/audit-logs", type: "Page" },
  { label: "Notifications", detail: "Platform alerts", href: "/notifications", type: "Page" },
  { label: "Settings", detail: "Platform configuration", href: "/settings", type: "Page" },
];

const admins = [
  { label: "Super Admin", detail: "admin@salamalock.com", href: "/admins", type: "Admin" },
  { label: "Mary Wambui", detail: "Operations Admin", href: "/admins", type: "Admin" },
  { label: "Kevin Otieno", detail: "Support Agent", href: "/admins", type: "Admin" },
];

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const orgResults = organizations.map((org) => ({ label: org.name, detail: `${org.industry} - ${org.country}`, href: `/organizations/${org.id}`, type: "Organization" }));
    const deviceResults = devices.map((device) => ({ label: device.name, detail: `${device.org} - ${device.imei}`, href: `/devices/${device.id}`, type: "Device" }));
    const all = [...pages, ...orgResults, ...deviceResults, ...admins];
    const text = query.trim().toLowerCase();
    if (!text) return all.slice(0, 6);
    return all.filter((item) => `${item.label} ${item.detail} ${item.type}`.toLowerCase().includes(text)).slice(0, 8);
  }, [query]);

  return (
    <div className={styles.searchWrap}>
      <Search className={styles.searchIcon} size={15} />
      <input
        className={styles.searchInput}
        placeholder="Search platform"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {query && <button className={styles.clearBtn} onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
      {open && (
        <div className={styles.results}>
          {results.length ? results.map((item) => (
            <Link className={styles.resultItem} href={item.href} key={`${item.type}-${item.label}`} onClick={() => setOpen(false)}>
              <span className={styles.resultType}>{item.type}</span>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            </Link>
          )) : <div className={styles.empty}>No results found</div>}
        </div>
      )}
    </div>
  );
}