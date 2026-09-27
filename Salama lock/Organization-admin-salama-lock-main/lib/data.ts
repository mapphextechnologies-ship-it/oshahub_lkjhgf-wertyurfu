import type { AuditEvent, Branch, OrgDevice, OrgUser, Policy } from "./types";

export const workspace = {
  name: "Nairobi Mobility Finance",
  plan: "Business",
  renewal: "Aug 24, 2026",
  seats: 46,
  deviceLimit: 500,
};

export const metrics = [
  { label: "Managed Devices", value: "318", change: "+22 this month" },
  { label: "Locked Devices", value: "37", change: "12 active recovery cases" },
  { label: "Active Users", value: "46", change: "5 branch managers" },
  { label: "Policy Compliance", value: "94%", change: "+3% this week" },
];

export const devices: OrgDevice[] = [
  { id: "SL-2048", name: "Samsung A24 - Lease 8842", user: "Brian Otieno", branch: "Nairobi CBD", platform: "Android", status: "Online", lastSeen: "2 min ago", policy: "Loan Default Recovery" },
  { id: "SL-2049", name: "Tecno Spark 10 - Lease 8843", user: "Mercy Wanjiku", branch: "Thika", platform: "Android", status: "Locked", lastSeen: "11 min ago", policy: "Loan Default Recovery" },
  { id: "SL-2050", name: "HP EliteBook - Staff", user: "Grace Njeri", branch: "Mombasa", platform: "Windows", status: "Online", lastSeen: "5 min ago", policy: "Staff Endpoint" },
  { id: "SL-2051", name: "iPhone 13 - Executive", user: "Allan Mwangi", branch: "Nakuru", platform: "iOS", status: "Warning", lastSeen: "24 min ago", policy: "Executive Device" },
  { id: "SL-2052", name: "Samsung A14 - Lease 8850", user: "Faith Achieng", branch: "Kisumu", platform: "Android", status: "Offline", lastSeen: "2 hours ago", policy: "Loan Default Recovery" },
];

export const users: OrgUser[] = [
  { id: "U-101", name: "Irene Kamau", email: "irene@nairobi-mf.co.ke", role: "Owner", branch: "Head Office", devices: 42, status: "Active" },
  { id: "U-102", name: "Samuel Kiplagat", email: "samuel@nairobi-mf.co.ke", role: "Branch Manager", branch: "Nakuru", devices: 61, status: "Active" },
  { id: "U-103", name: "Amina Said", email: "amina@nairobi-mf.co.ke", role: "Support Agent", branch: "Mombasa", devices: 38, status: "Active" },
  { id: "U-104", name: "Peter Maina", email: "peter@nairobi-mf.co.ke", role: "Recovery Agent", branch: "Thika", devices: 27, status: "Invited" },
];

export const branches: Branch[] = [
  { name: "Nairobi CBD", location: "Nairobi", manager: "Irene Kamau", devices: 118, locked: 11 },
  { name: "Thika", location: "Kiambu", manager: "Peter Maina", devices: 74, locked: 13 },
  { name: "Mombasa", location: "Mombasa", manager: "Amina Said", devices: 62, locked: 5 },
  { name: "Nakuru", location: "Nakuru", manager: "Samuel Kiplagat", devices: 64, locked: 8 },
];

export const policies: Policy[] = [
  { name: "Loan Default Recovery", scope: "Customer financed devices", devices: 244, status: "Active", updated: "Today" },
  { name: "Staff Endpoint", scope: "Internal staff laptops and phones", devices: 51, status: "Active", updated: "Yesterday" },
  { name: "Executive Device", scope: "Directors and senior staff", devices: 8, status: "Active", updated: "Jul 21" },
  { name: "Field Agent Pilot", scope: "New field team rollout", devices: 15, status: "Draft", updated: "Jul 18" },
];

export const auditEvents: AuditEvent[] = [
  { action: "Device locked", actor: "Peter Maina", target: "SL-2049", time: "10 min ago", severity: "Critical" },
  { action: "Policy updated", actor: "Irene Kamau", target: "Loan Default Recovery", time: "32 min ago", severity: "Warning" },
  { action: "User invited", actor: "Amina Said", target: "Peter Maina", time: "1 hour ago", severity: "Info" },
  { action: "Device checked in", actor: "System", target: "SL-2050", time: "2 hours ago", severity: "Info" },
];

export const invoices = [
  { id: "INV-2026-071", amount: "KES 42,000", period: "July 2026", status: "Paid", date: "Jul 1, 2026" },
  { id: "INV-2026-070", amount: "KES 42,000", period: "June 2026", status: "Paid", date: "Jun 1, 2026" },
  { id: "INV-2026-069", amount: "KES 39,500", period: "May 2026", status: "Paid", date: "May 1, 2026" },
];