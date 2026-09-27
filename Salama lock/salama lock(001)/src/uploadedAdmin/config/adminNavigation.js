export const adminNavigationGroups = [
  {
    label: "Operations",
    items: [
      { label: "Overview", shortLabel: "O", icon: "LayoutDashboard", to: "/admin/overview", permission: "overview", end: true },
      { label: "Screening", shortLabel: "SC", icon: "ClipboardList", to: "/admin/applications", permission: "applications" },
      { label: "Staff", shortLabel: "ST", icon: "Users", to: "/admin/agents", permission: "agents" },
      { label: "Users", shortLabel: "US", icon: "UserCog", to: "/admin/users", permission: "users" },
      { label: "Customers", shortLabel: "CU", icon: "UserRound", to: "/admin/customers", permission: "customers" },
      { label: "Phone customers", shortLabel: "PC", icon: "UserRound", to: "/admin/phone-customers", permission: "customers" },
      { label: "Device inventory", shortLabel: "DI", icon: "Smartphone", to: "/admin/phone-inventory", permission: "bikes" }
    ]
  },
  {
    label: "Management",
    items: [
      { label: "Finance", shortLabel: "FI", icon: "WalletCards", to: "/admin/finance", permission: "finance" },
      { label: "Reports", shortLabel: "RP", icon: "Download", to: "/admin/reports", permission: "reports" },
      { label: "Notifications", shortLabel: "NO", icon: "Bell", to: "/admin/notifications", permission: "notifications" },
      { label: "Audit", shortLabel: "AU", icon: "History", to: "/admin/audit-logs", permission: "audit" },
      { label: "Profile", shortLabel: "PR", icon: "UserRound", to: "/admin/profile", permission: "profile" },
      { label: "Settings", shortLabel: "SE", icon: "Settings", to: "/admin/settings", permission: "settings" }
    ]
  }
];
