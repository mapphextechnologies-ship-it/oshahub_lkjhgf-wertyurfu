export interface OrgDevice {
  id: string;
  name: string;
  user: string;
  branch: string;
  platform: string;
  status: "Online" | "Locked" | "Offline" | "Warning";
  lastSeen: string;
  policy: string;
}

export interface OrgUser {
  id: string;
  name: string;
  email: string;
  role: string;
  branch: string;
  devices: number;
  status: "Active" | "Invited" | "Suspended";
}

export interface Branch {
  name: string;
  location: string;
  manager: string;
  devices: number;
  locked: number;
}

export interface Policy {
  name: string;
  scope: string;
  devices: number;
  status: "Active" | "Draft";
  updated: string;
}

export interface AuditEvent {
  action: string;
  actor: string;
  target: string;
  time: string;
  severity: "Info" | "Warning" | "Critical";
}