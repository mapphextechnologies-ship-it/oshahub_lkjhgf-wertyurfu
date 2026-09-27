export type OrganizationStatus = "Active" | "Pending" | "Suspended";
export type SubscriptionPlanName = "Starter" | "Growth" | "Business" | "Enterprise";
export type DeviceStatus = "Active" | "Locked" | "Offline" | "Suspended";
export type AuditSeverity = "Low" | "Medium" | "High";
export type NotificationType = "Alert" | "Billing" | "Organization" | "System" | "Device";
export type NotificationStatus = "Read" | "Unread";
export type PaymentStatus = "Paid" | "Pending" | "Overdue";

export interface Organization {
  id: string;
  name: string;
  industry: string;
  country: string;
  contact: string;
  email: string;
  devices: number;
  plan: SubscriptionPlanName;
  status: OrganizationStatus;
  joined: string;
}

export interface Device {
  id: string;
  name: string;
  imei: string;
  org: string;
  type: "Phone" | "Laptop" | "Tablet";
  os: string;
  osVersion: string;
  assignedTo: string;
  status: DeviceStatus;
  lastSeen: string;
}

export interface SubscriptionPlan {
  name: SubscriptionPlanName;
  price: string;
  cycle: string;
  devices: number;
  features: string[];
  orgs: number;
}

export interface OrganizationSubscription {
  org: string;
  plan: SubscriptionPlanName;
  status: OrganizationStatus;
  devices: string;
  renewal: string;
  amount: string;
}

export interface AuditLog {
  id: string;
  time: string;
  org: string;
  actor: string;
  action: string;
  target: string;
  category: string;
  severity: AuditSeverity;
  ip: string;
}

export interface PlatformNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  status: NotificationStatus;
  time: string;
}

export interface Payment {
  org: string;
  plan: SubscriptionPlanName;
  amount: string;
  method: string;
  date: string;
  status: PaymentStatus;
}
