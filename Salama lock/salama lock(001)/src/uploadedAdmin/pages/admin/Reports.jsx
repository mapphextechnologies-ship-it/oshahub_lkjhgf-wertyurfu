import {
  BadgeDollarSign,
  Bike,
  CalendarDays,
  ClipboardList,
  Download,
  FileCheck2,
  History,
  ShieldAlert,
  Users,
  WalletCards
} from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { StatCard } from "../../components/ui/StatCard.jsx";
import { useAdminData } from "../../features/admin/AdminDataContext.jsx";
import { downloadCsv } from "../../lib/export/csv.js";
import { formatKes } from "../../lib/formatting/currency.js";
import {
  buildAgentRows,
  buildApplicationRows,
  buildAuditRows,
  buildBikeRows,
  buildCustomerRows,
  buildFinanceSplitRows,
  buildNotificationRows,
  buildPaymentRows,
  buildUserRows
} from "../../lib/export/reportRows.js";

const reportingPeriods = [
  { key: "weekly", label: "Weekly", days: 7, filename: "weekly" },
  { key: "monthly", label: "Monthly", months: 1, filename: "monthly" },
  { key: "yearly", label: "Yearly", years: 1, filename: "yearly" },
  { key: "all", label: "Full", filename: "full" }
];

function parseRecordDate(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function periodStart(period) {
  const start = new Date();

  if (period.days) {
    start.setDate(start.getDate() - period.days);
  }

  if (period.months) {
    start.setMonth(start.getMonth() - period.months);
  }

  if (period.years) {
    start.setFullYear(start.getFullYear() - period.years);
  }

  start.setHours(0, 0, 0, 0);
  return start;
}

function filterByPeriod(items, period, dateField) {
  if (period.key === "all" || !dateField) {
    return items;
  }

  const start = periodStart(period);
  return items.filter((item) => {
    const date = parseRecordDate(item[dateField]);
    return date ? date >= start : true;
  });
}

function makeFilename(slug, period) {
  const today = new Date().toISOString().slice(0, 10);
  return `SALAMA LOCK-${slug}-${period.filename}-${today}.csv`;
}

function isOutstandingCustomer(customer = {}) {
  return String(customer.applicationStatus || "").toLowerCase() !== "rejected" &&
    String(customer.repaymentStatus || "").toLowerCase() !== "rejected";
}

export default function Reports() {
  const {
    agents,
    applications,
    auditLogs,
    bikes,
    customers,
    notifications = [],
    payments = [],
    users = []
  } = useAdminData();

  const pendingScreening = applications.filter((item) => item.status === "pending_screening").length;
  const approvedApplications = applications.filter((item) => item.status === "approved").length;
  const duplicateFlags = applications.filter((item) => item.duplicateNationalId).length;
  const totalDeposits = applications.reduce((sum, application) => sum + application.depositAmount, 0);
  const totalBalances = customers.filter(isOutstandingCustomer).reduce((sum, customer) => sum + customer.balance, 0);
  const totalCollected = payments
    .filter((payment) => payment.status === "success")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const commissionBalance = agents.reduce((sum, agent) => sum + agent.commissionBalance, 0);
  const availableBikes = bikes.filter((bike) => bike.status === "available").length;

  function buildManagementRows(period) {
    const scopedApplications = filterByPeriod(applications, period, "submittedAt");
    const scopedPayments = filterByPeriod(payments, period, "paidAt");
    const scopedAuditLogs = filterByPeriod(auditLogs, period, "createdAt");

    return [
      {
        "Report Period": period.label,
        "Generated At": new Date().toLocaleString(),
        "Applications Submitted": scopedApplications.length,
        "Applications Approved": scopedApplications.filter((item) => item.status === "approved").length,
        "Applications Pending": scopedApplications.filter((item) => item.status === "pending_screening").length,
        "Info Required": scopedApplications.filter((item) => item.status === "info_required").length,
        "Rejected Applications": scopedApplications.filter((item) => item.status === "rejected").length,
        "Duplicate ID Flags": scopedApplications.filter((item) => item.duplicateNationalId).length,
        "Total Deposits": scopedApplications.reduce((sum, item) => sum + item.depositAmount, 0),
        "Successful Collections": scopedPayments
          .filter((payment) => payment.status === "success")
          .reduce((sum, payment) => sum + payment.amount, 0),
        "Pending Payments": scopedPayments.filter((payment) => payment.status === "pending").length,
        "Reconciliation Flags": scopedPayments.filter((payment) =>
          ["unmatched", "manual_review"].includes(payment.reconciliationStatus)
        ).length,
        "Audit Events": scopedAuditLogs.length,
        "Active Agents": agents.filter((agent) => agent.status === "active").length,
        "Available Bikes": availableBikes,
        "Customer Balance Book": customers.filter(isOutstandingCustomer).reduce((sum, customer) => sum + customer.balance, 0),
        "Commission Liability": commissionBalance
      }
    ];
  }

  const records = [
    {
      slug: "management-summary",
      label: "Management summary",
      owner: "Directors",
      icon: FileCheck2,
      description: "One-line KPI pack for weekly, monthly, or annual management review.",
      getRows: (period) => buildManagementRows(period)
    },
    {
      slug: "applications",
      label: "Applications and KYC",
      owner: "Back office",
      icon: ClipboardList,
      description: "Customer KYC, screening, agent, bike, OTP, duplicate ID, and decision columns.",
      getRows: (period) =>
        buildApplicationRows({
          agents,
          applications: filterByPeriod(applications, period, "submittedAt"),
          bikes,
          customers
        })
    },
    {
      slug: "customers",
      label: "Customers",
      owner: "Operations",
      icon: Users,
      description: "Customer profile, assigned agent, bike account, repayment state, and balance book.",
      getRows: (period) =>
        buildCustomerRows({
          agents,
          bikes,
          customers: filterByPeriod(customers, period, "createdAt")
        })
    },
    {
      slug: "finance-payments",
      label: "Finance and payments",
      owner: "Finance",
      icon: WalletCards,
      description: "Receipt, amount, customer, agent, status, and reconciliation state.",
      getRows: (period) =>
        buildPaymentRows({
          agents,
          customers,
          payments: filterByPeriod(payments, period, "paidAt")
        })
    },
    {
      slug: "finance-split",
      label: "Phone and bike collections",
      owner: "Finance",
      icon: WalletCards,
      description: "Grouped payment collections with separate phone and bike totals for review.",
      getRows: (period) =>
        buildFinanceSplitRows({
          payments: filterByPeriod(payments, period, "paidAt")
        })
    },
    {
      slug: "agents",
      label: "Agent performance",
      owner: "Regional leads",
      icon: BadgeDollarSign,
      description: "Agent profile, region, active status, onboarded customers, and commission exposure.",
      getRows: () => buildAgentRows(agents)
    },
    {
      slug: "bikes",
      label: "Bike inventory",
      owner: "Inventory",
      icon: Bike,
      description: "Model, serial, chassis, inventory status, customer assignment, and agent assignment.",
      getRows: (period) =>
        buildBikeRows({
          agents,
          bikes: filterByPeriod(bikes, period, "createdAt"),
          customers
        })
    },
    {
      slug: "users",
      label: "Staff",
      owner: "System admin",
      icon: Users,
      description: "User access, roles, phone numbers, and account status for access reviews.",
      getRows: () => buildUserRows(users)
    },
    {
      slug: "notifications",
      label: "Notifications",
      owner: "Customer care",
      icon: CalendarDays,
      description: "SMS and in-app notification title, message, channel, status, and created date.",
      getRows: (period) =>
        buildNotificationRows(filterByPeriod(notifications, period, "createdAt"))
    },
    {
      slug: "audit-logs",
      label: "Audit logs",
      owner: "Compliance",
      icon: History,
      description: "Actor, role, action, entity, and timestamp for accountability checks.",
      getRows: (period) => buildAuditRows(filterByPeriod(auditLogs, period, "createdAt"))
    }
  ];

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Reports"
        title="Report center"
        description="Download weekly, monthly, yearly, and full CSV packs for management review, reconciliation, inventory control, and compliance."
      />

      <div className="stat-grid compact">
        <StatCard icon={ClipboardList} label="Pending screening" value={pendingScreening} detail="Current queue" />
        <StatCard icon={FileCheck2} label="Approved cases" value={approvedApplications} detail="Total approved" />
        <StatCard icon={ShieldAlert} label="Duplicate flags" value={duplicateFlags} detail="KYC risk checks" />
        <StatCard icon={WalletCards} label="Collected" value={formatKes(totalCollected)} detail="Successful receipts" />
        <StatCard icon={BadgeDollarSign} label="Deposits booked" value={formatKes(totalDeposits)} detail="Application deposits" />
        <StatCard icon={Bike} label="Available bikes" value={availableBikes} detail="Ready for assignment" />
      </div>

      <article className="panel report-schedule-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Reporting cadence</p>
            <h3>Standard management downloads</h3>
          </div>
          <CalendarDays size={23} />
        </div>
        <div className="report-cadence-grid">
          <div>
            <strong>Weekly</strong>
            <span>Monday operations meeting, KYC queue, field collections, exceptions.</span>
          </div>
          <div>
            <strong>Monthly</strong>
            <span>Finance reconciliation, commissions, inventory movement, portfolio quality.</span>
          </div>
          <div>
            <strong>Yearly</strong>
            <span>Annual compliance pack, growth review, customer book, audit archive.</span>
          </div>
        </div>
      </article>

      <div className="report-download-grid">
        {records.map((record) => (
          <ReportCard key={record.slug} record={record} />
        ))}
      </div>
    </section>
  );
}

function ReportCard({ record }) {
  const Icon = record.icon;

  return (
    <div className="report-download-card">
      <div className="report-card-top">
        <span className="report-icon">
          <Icon size={22} strokeWidth={2.1} />
        </span>
        <span className="report-owner">{record.owner}</span>
      </div>

      <div>
        <strong>{record.label}</strong>
        <span>{record.description}</span>
      </div>

      <div className="period-downloads">
        {reportingPeriods.map((period) => {
          const rows = record.getRows(period);

          return (
            <button
              className="button secondary report-download-button"
              type="button"
              disabled={!rows.length}
              key={period.key}
              onClick={() => downloadCsv(makeFilename(record.slug, period), rows)}
            >
              <Download size={16} />
              <div>
                <b>{period.label}</b>
                <small>{rows.length} rows</small>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
