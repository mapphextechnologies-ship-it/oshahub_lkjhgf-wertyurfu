import {
  Bell,
  ChartNoAxesCombined,
  CreditCard,
  FileText,
  HandCoins,
  RefreshCcw,
  Settings,
  Smartphone,
  Bike,
  Users
} from 'lucide-react';

export const navItems = [
  { key: 'dashboard', label: 'Home', icon: ChartNoAxesCombined, group: 'Overview' },
  { key: 'payments', label: 'Payments', icon: CreditCard, group: 'Collections' },
  { key: 'phones', label: 'Phones', icon: Smartphone, group: 'Inventory' },
  { key: 'bikes', label: 'Bikes', icon: Bike, group: 'Inventory' },
  { key: 'commissions', label: 'Commissions', icon: HandCoins, group: 'Collections' },
  { key: 'customers', label: 'Riders', icon: Users, group: 'Accounts' },
  { key: 'reports', label: 'Reports', icon: FileText, group: 'Review' },
  { key: 'reconciliation', label: 'Reconcile', icon: RefreshCcw, group: 'Review' },
  { key: 'settings', label: 'Settings', icon: Settings, group: 'Account' },
  { key: 'notifications', label: 'Alerts', icon: Bell, group: 'Account' }
];

export const navGroups = ['Overview', 'Collections', 'Inventory', 'Accounts', 'Review', 'Account'];
