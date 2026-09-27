import type {
  AuditLog,
  Device,
  Organization,
  OrganizationSubscription,
  Payment,
  PlatformNotification,
  SubscriptionPlan,
} from "./types";

export const organizations: Organization[] = [
  { id: "1", name: "Bumu PayGo", industry: "Finance", country: "Kenya", contact: "James Mwangi", email: "james@bumu.co.ke", devices: 120, plan: "Business", status: "Active", joined: "Jan 12, 2025" },
  { id: "2", name: "Nairobi Academy", industry: "Education", country: "Kenya", contact: "Sarah Otieno", email: "sarah@nairobiaca.ac.ke", devices: 85, plan: "Growth", status: "Active", joined: "Feb 3, 2025" },
  { id: "3", name: "LogiTrack Ltd", industry: "Logistics", country: "Uganda", contact: "Peter Ssali", email: "peter@logitrack.ug", devices: 200, plan: "Business", status: "Pending", joined: "Mar 18, 2025" },
  { id: "4", name: "MediCare Hospital", industry: "Health", country: "Tanzania", contact: "Dr. Amina Hassan", email: "amina@medicare.tz", devices: 60, plan: "Starter", status: "Active", joined: "Mar 22, 2025" },
  { id: "5", name: "SafariNet", industry: "Telecom", country: "Kenya", contact: "David Kamau", email: "david@safarinet.co.ke", devices: 310, plan: "Enterprise", status: "Suspended", joined: "Apr 1, 2025" },
  { id: "6", name: "GovTech Rwanda", industry: "Government", country: "Rwanda", contact: "Alice Uwase", email: "alice@govtech.rw", devices: 450, plan: "Enterprise", status: "Active", joined: "Apr 14, 2025" },
];

export const devices: Device[] = [
  { id: "1", name: "Samsung Galaxy A56", imei: "352099001761481", org: "Bumu PayGo", type: "Phone", os: "Android", osVersion: "15", assignedTo: "John Kamau", status: "Active", lastSeen: "2 min ago" },
  { id: "2", name: "Tecno Spark 20", imei: "490154203237518", org: "Bumu PayGo", type: "Phone", os: "Android", osVersion: "14", assignedTo: "Grace Wanjiku", status: "Locked", lastSeen: "1 hour ago" },
  { id: "3", name: "HP EliteBook 840", imei: "SN-HP840-2025", org: "GovTech Rwanda", type: "Laptop", os: "Windows", osVersion: "11", assignedTo: "Alice Uwase", status: "Active", lastSeen: "5 min ago" },
  { id: "4", name: "iPad Air 5", imei: "DLXWK2ABCD12", org: "Nairobi Academy", type: "Tablet", os: "iPadOS", osVersion: "17", assignedTo: "Student Pool", status: "Active", lastSeen: "10 min ago" },
  { id: "5", name: "Infinix Hot 40", imei: "867530041234567", org: "LogiTrack Ltd", type: "Phone", os: "Android", osVersion: "13", assignedTo: "Peter Ssali", status: "Offline", lastSeen: "3 days ago" },
  { id: "6", name: "Dell Latitude 5540", imei: "SN-DELL-5540-07", org: "MediCare Hospital", type: "Laptop", os: "Windows", osVersion: "11", assignedTo: "Dr. Amina Hassan", status: "Active", lastSeen: "Just now" },
  { id: "7", name: "Samsung Galaxy A16", imei: "352099009876543", org: "SafariNet", type: "Phone", os: "Android", osVersion: "14", assignedTo: "David Kamau", status: "Suspended", lastSeen: "2 days ago" },
  { id: "8", name: "Lenovo ThinkPad X1", imei: "SN-LNV-X1-2024", org: "GovTech Rwanda", type: "Laptop", os: "Linux", osVersion: "Ubuntu 24", assignedTo: "Tech Team", status: "Active", lastSeen: "1 min ago" },
];

export const subscriptionPlans: SubscriptionPlan[] = [
  { name: "Starter", price: "KES 2,500", cycle: "/ month", devices: 100, features: ["Basic Lock & Unlock", "Device Registration", "Email Alerts", "Basic Reports"], orgs: 8 },
  { name: "Growth", price: "KES 8,500", cycle: "/ month", devices: 1000, features: ["Everything in Starter", "Branch Management", "Policy Engine", "Advanced Reports", "SMS Alerts"], orgs: 11 },
  { name: "Business", price: "KES 22,000", cycle: "/ month", devices: 10000, features: ["Everything in Growth", "API Access", "Multi-branch", "Priority Support", "Audit Logs"], orgs: 6 },
  { name: "Enterprise", price: "Custom", cycle: "", devices: -1, features: ["Everything in Business", "Unlimited Devices", "Dedicated Support", "Custom Integrations", "SLA Agreement"], orgs: 2 },
];

export const organizationSubscriptions: OrganizationSubscription[] = [
  { org: "Bumu PayGo", plan: "Business", status: "Active", devices: "120 / 10,000", renewal: "Aug 12, 2025", amount: "KES 22,000" },
  { org: "Nairobi Academy", plan: "Growth", status: "Active", devices: "85 / 1,000", renewal: "Sep 3, 2025", amount: "KES 8,500" },
  { org: "LogiTrack Ltd", plan: "Business", status: "Pending", devices: "200 / 10,000", renewal: "N/A", amount: "KES 22,000" },
  { org: "MediCare Hospital", plan: "Starter", status: "Active", devices: "60 / 100", renewal: "Jul 22, 2025", amount: "KES 2,500" },
  { org: "SafariNet", plan: "Enterprise", status: "Suspended", devices: "310 / Unlimited", renewal: "N/A", amount: "Custom" },
  { org: "GovTech Rwanda", plan: "Enterprise", status: "Active", devices: "450 / Unlimited", renewal: "Apr 14, 2026", amount: "Custom" },
];

export const auditLogs: AuditLog[] = [
  { id: "AL-1008", time: "Today, 10:45", org: "Bumu PayGo", actor: "Grace Wanjiku", action: "Device locked", target: "Samsung Galaxy A16", category: "Command", severity: "High", ip: "102.68.21.44" },
  { id: "AL-1007", time: "Today, 09:22", org: "GovTech Rwanda", actor: "Alice Uwase", action: "Policy updated", target: "Windows Compliance Policy", category: "Policy", severity: "Medium", ip: "197.243.10.18" },
  { id: "AL-1006", time: "Yesterday, 17:04", org: "Nairobi Academy", actor: "Sarah Otieno", action: "User invited", target: "Branch Manager", category: "User", severity: "Low", ip: "41.90.184.71" },
  { id: "AL-1005", time: "Yesterday, 14:38", org: "SafariNet", actor: "Super Admin", action: "Organization suspended", target: "SafariNet", category: "Organization", severity: "High", ip: "196.201.214.10" },
  { id: "AL-1004", time: "Jul 21, 11:18", org: "MediCare Hospital", actor: "Dr. Amina Hassan", action: "Device registered", target: "Dell Latitude 5540", category: "Device", severity: "Low", ip: "41.59.90.12" },
  { id: "AL-1003", time: "Jul 20, 08:10", org: "LogiTrack Ltd", actor: "Peter Ssali", action: "Payment marked pending", target: "Business subscription", category: "Billing", severity: "Medium", ip: "154.72.197.3" },
];

export const notifications: PlatformNotification[] = [
  { id: "N-001", title: "High lock activity detected", message: "Bumu PayGo locked 18 devices in the last 24 hours.", type: "Alert", status: "Unread", time: "10 min ago" },
  { id: "N-002", title: "Subscription renewal due", message: "MediCare Hospital renews its Starter plan tomorrow.", type: "Billing", status: "Unread", time: "1 hour ago" },
  { id: "N-003", title: "New organization awaiting approval", message: "LogiTrack Ltd completed registration and needs review.", type: "Organization", status: "Read", time: "5 hours ago" },
  { id: "N-004", title: "Device agent update available", message: "Android agent 1.4.0 is ready for controlled rollout.", type: "System", status: "Read", time: "Yesterday" },
  { id: "N-005", title: "Offline device threshold exceeded", message: "SafariNet has 42 devices offline for more than 48 hours.", type: "Device", status: "Unread", time: "Yesterday" },
  { id: "N-006", title: "Enterprise plan activated", message: "GovTech Rwanda is now active on Enterprise.", type: "Billing", status: "Read", time: "Jul 20" },
];

export const payments: Payment[] = [
  { org: "Bumu PayGo", plan: "Business", amount: "KES 22,000", method: "M-Pesa", date: "Jul 12, 2025", status: "Paid" },
  { org: "GovTech Rwanda", plan: "Enterprise", amount: "Custom", method: "Bank Transfer", date: "Jul 10, 2025", status: "Paid" },
  { org: "Nairobi Academy", plan: "Growth", amount: "KES 8,500", method: "M-Pesa", date: "Jul 8, 2025", status: "Paid" },
  { org: "LogiTrack Ltd", plan: "Business", amount: "KES 22,000", method: "Card", date: "Jul 5, 2025", status: "Pending" },
  { org: "MediCare Hospital", plan: "Starter", amount: "KES 2,500", method: "M-Pesa", date: "Jul 3, 2025", status: "Paid" },
  { org: "SafariNet", plan: "Enterprise", amount: "Custom", method: "Bank Transfer", date: "Jun 28, 2025", status: "Overdue" },
];

export const monthlyRevenue = [
  { month: "Jan", revenue: 42000 },
  { month: "Feb", revenue: 67000 },
  { month: "Mar", revenue: 95000 },
  { month: "Apr", revenue: 128000 },
  { month: "May", revenue: 174000 },
  { month: "Jun", revenue: 221000 },
  { month: "Jul", revenue: 284000 },
];

export const deviceGrowth = [
  { month: "Jan", devices: 120, orgs: 4 },
  { month: "Feb", devices: 210, orgs: 6 },
  { month: "Mar", devices: 380, orgs: 9 },
  { month: "Apr", devices: 520, orgs: 13 },
  { month: "May", devices: 740, orgs: 18 },
  { month: "Jun", devices: 910, orgs: 22 },
  { month: "Jul", devices: 1080, orgs: 27 },
];

export const platformBreakdown = [
  { name: "Android", value: 640 },
  { name: "Windows", value: 210 },
  { name: "iOS", value: 130 },
  { name: "Linux", value: 80 },
  { name: "Other", value: 40 },
];

export const securitySettings = [
  { label: "Require MFA for Super Admins", value: "Enabled", status: "Good" },
  { label: "Session Timeout", value: "30 minutes", status: "Good" },
  { label: "Failed Login Lockout", value: "5 attempts", status: "Good" },
  { label: "API Key Rotation", value: "Every 90 days", status: "Review" },
];

export const platformSettings = [
  { label: "Default Currency", value: "KES" },
  { label: "Default Region", value: "East Africa" },
  { label: "Device Heartbeat Window", value: "15 minutes" },
  { label: "Command Retry Policy", value: "Retry for 24 hours" },
];

export const integrations = [
  { name: "M-Pesa Billing", description: "Collect subscription payments and reconcile invoices.", state: "Configured" },
  { name: "Email Alerts", description: "Send security, billing, and onboarding emails.", state: "Configured" },
  { name: "SMS Gateway", description: "Send payment reminders and lock notices.", state: "Pending" },
  { name: "Cloud Storage", description: "Store organization logos, exports, and reports.", state: "Configured" },
];

export const organizationActivities = [
  { action: "Device locked", detail: "Samsung Galaxy A16 - Payment overdue", time: "2 hours ago", type: "lock" },
  { action: "User added", detail: "Finance Manager - Grace Wanjiku", time: "5 hours ago", type: "user" },
  { action: "Policy updated", detail: "Finance Lock Policy v2", time: "1 day ago", type: "policy" },
  { action: "Device registered", detail: "Tecno Spark 20 - IMEI 352099001761481", time: "2 days ago", type: "device" },
  { action: "Branch created", detail: "Mombasa Branch", time: "3 days ago", type: "branch" },
];

export const organizationUsers = [
  { org: "Bumu PayGo", name: "Grace Wanjiku", email: "grace@bumu.co.ke", role: "Finance Manager", branch: "Nairobi", status: "Active" },
  { org: "Bumu PayGo", name: "John Kamau", email: "john@bumu.co.ke", role: "Device Agent", branch: "Mombasa", status: "Active" },
  { org: "Bumu PayGo", name: "Brian Otieno", email: "brian@bumu.co.ke", role: "Support", branch: "Kisumu", status: "Invited" },
  { org: "Nairobi Academy", name: "Sarah Otieno", email: "sarah@nairobiaca.ac.ke", role: "Owner", branch: "Main Campus", status: "Active" },
  { org: "GovTech Rwanda", name: "Alice Uwase", email: "alice@govtech.rw", role: "Owner", branch: "Kigali", status: "Active" },
];

export const organizationBranches = [
  { org: "Bumu PayGo", name: "Nairobi", manager: "Grace Wanjiku", devices: 64, users: 5, status: "Active" },
  { org: "Bumu PayGo", name: "Mombasa", manager: "John Kamau", devices: 31, users: 3, status: "Active" },
  { org: "Bumu PayGo", name: "Kisumu", manager: "Brian Otieno", devices: 25, users: 2, status: "Active" },
  { org: "Nairobi Academy", name: "Main Campus", manager: "Sarah Otieno", devices: 85, users: 8, status: "Active" },
  { org: "GovTech Rwanda", name: "Kigali", manager: "Alice Uwase", devices: 280, users: 11, status: "Active" },
];

export const organizationPolicies = [
  { org: "Bumu PayGo", name: "Finance Lock Policy", devices: 120, rules: "Lock on missed payment, payment reminder, SIM change alert", status: "Active" },
  { org: "Bumu PayGo", name: "Android Enrollment", devices: 120, rules: "Agent required, heartbeat required, root detection", status: "Active" },
  { org: "Nairobi Academy", name: "School Tablet Policy", devices: 85, rules: "App control, safe browsing, reset protection", status: "Active" },
  { org: "GovTech Rwanda", name: "Government Laptop Policy", devices: 450, rules: "Disk encryption, VPN required, USB restricted", status: "Active" },
];

export const deviceEvents = [
  { deviceId: "1", event: "Heartbeat received", detail: "Battery 84%, Wi-Fi connected", time: "2 min ago", type: "info" },
  { deviceId: "1", event: "Policy checked", detail: "Finance Lock Policy compliant", time: "18 min ago", type: "policy" },
  { deviceId: "2", event: "Lock command executed", detail: "Payment overdue lock applied", time: "1 hour ago", type: "lock" },
  { deviceId: "2", event: "Reminder shown", detail: "Customer payment reminder displayed", time: "3 hours ago", type: "message" },
  { deviceId: "3", event: "Device check-in", detail: "Windows agent online", time: "5 min ago", type: "info" },
  { deviceId: "5", event: "Device offline", detail: "No heartbeat for 72 hours", time: "3 days ago", type: "warning" },
  { deviceId: "7", event: "Device suspended", detail: "Organization suspended device control", time: "2 days ago", type: "lock" },
];

export const deviceCommands = [
  { name: "Lock", description: "Prevent user access until unlocked.", level: "High" },
  { name: "Unlock", description: "Restore access after payment or admin approval.", level: "Normal" },
  { name: "Suspend", description: "Pause service and mark device for review.", level: "Medium" },
  { name: "Locate", description: "Request latest supported location signal.", level: "Normal" },
  { name: "Message", description: "Show a notice on the device screen.", level: "Normal" },
  { name: "Restart", description: "Ask the agent to restart the device where supported.", level: "Medium" },
];
