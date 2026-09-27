import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileWarning,
  ShieldAlert
} from "lucide-react";
import { Link } from "react-router-dom";
import { DataTable } from "../../uploadedAdmin/components/ui/DataTable.jsx";
import { PageHeader } from "../../uploadedAdmin/components/ui/PageHeader.jsx";
import { StatCard } from "../../uploadedAdmin/components/ui/StatCard.jsx";
import { StatusBadge } from "../../uploadedAdmin/components/ui/StatusBadge.jsx";
import { useAdminData } from "../../uploadedAdmin/features/admin/AdminDataContext.jsx";
import { activeScreeningStatuses, completedScreeningStatuses, getScreeningRows } from "./backOfficeHelpers.js";

export default function BackOfficeOverview() {
  const { agents, applications, bikes, customers, notifications = [] } = useAdminData();
  const activeRows = getScreeningRows({ agents, applications, bikes, customers, statuses: activeScreeningStatuses });
  const completedRows = getScreeningRows({ agents, applications, bikes, customers, statuses: completedScreeningStatuses });
  const pending = applications.filter((item) => item.status === "pending_screening").length;
  const infoRequired = activeRows.filter((row) => row.status === "info_required").length;
  const pendingKyc = activeRows.filter((row) => row.status === "next_of_kin_pending").length;
  const duplicateFlags = activeRows.filter((row) => row.duplicateNationalId).length;
  const unclearDocuments = applications.filter((item) =>
    (item.documents || []).some((document) => ["unclear", "missing"].includes(document.status))
  ).length;
  const failedKinOtp = applications.filter((item) => !item.nextOfKinOtpVerified).length;
  const unreadNotifications = notifications.filter((notification) => notification.status === "unread").length;

  const columns = [
    { key: "id", label: "Case ID" },
    { key: "customer", label: "Customer", render: (row) => row.customer?.name || "Customer record" },
    { key: "agent", label: "Agent", render: (row) => row.agent?.name || "Agent record" },
    { key: "status", label: "Screening state", render: (row) => <StatusBadge status={row.status} /> },
    { key: "open", label: "Action", render: (row) => <Link to={`/backoffice/applications/${row.id}`}>Continue</Link> }
  ];

  return (
    <section className="page-stack dashboard-page">
      <div className="dashboard-header-band">
        <PageHeader
          eyebrow="Back Office overview"
          title="Operational screening desk"
          description="Control customer screening, document checks, next-of-kin verification, and approval handoff from the shared SALAMA LOCK PAYGO database."
        />
      </div>

      <section className="dashboard-section">
        <div className="section-title">
          <p className="eyebrow">Overview</p>
          <h3>Control summary</h3>
        </div>
        <div className="stat-grid dashboard-summary-grid">
          <StatCard icon={ClipboardList} label="Pending screening" value={pending} detail="Needs review" tone="warning" to="/backoffice/screening" />
          <StatCard icon={FileWarning} label="Info required" value={infoRequired} detail="Returned to agent" to="/backoffice/screening" />
          <StatCard icon={ClipboardCheck} label="Approved" value={completedRows.filter((row) => row.status === "approved").length} detail="Activated cases" tone="success" to="/backoffice/completed" />
          <StatCard icon={ShieldAlert} label="Duplicate IDs" value={duplicateFlags} detail="Risk flags" tone="danger" to="/backoffice/screening" />
          <StatCard icon={Bell} label="Unread alerts" value={unreadNotifications} detail="Notifications" to="/backoffice/notifications" />
        </div>
      </section>

      <section className="dashboard-section">
        <article className="panel priority-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Screening operations</p>
              <h3>KYC approval queue</h3>
            </div>
            <Link to="/backoffice/screening">View queue</Link>
          </div>

          <div className="operations-strip">
            <div>
              <strong>{pending}</strong>
              <span>Pending back-office review</span>
            </div>
            <div>
              <strong>{duplicateFlags}</strong>
              <span>Duplicate national ID flags</span>
            </div>
            <div>
              <strong>{unclearDocuments}</strong>
              <span>Document clarity issues</span>
            </div>
            <div>
              <strong>{failedKinOtp}</strong>
              <span>Next-of-kin OTP issues</span>
            </div>
          </div>

          <DataTable columns={columns} rows={activeRows.slice(0, 6)} emptyMessage="No active screening cases are waiting right now." />
        </article>
      </section>

      <div className="dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Review scope</p>
              <h3>What Back Office should handle</h3>
            </div>
            <Link to="/backoffice/screening">Review cases</Link>
          </div>
          <div className="metric-list">
            <MetricRow icon={ClipboardList} label="Open screening cases" value={activeRows.length} />
            <MetricRow icon={FileWarning} label="Cases returned for info" value={infoRequired} />
            <MetricRow icon={ShieldAlert} label="Duplicate ID checks" value={duplicateFlags} tone="danger" />
            <MetricRow icon={CheckCircle2} label="Completed decisions" value={completedRows.length} />
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Approval readiness</p>
              <h3>Risk and completion</h3>
            </div>
            <Link to="/backoffice/completed">Completed cases</Link>
          </div>
          <div className="metric-list">
            <MetricRow icon={AlertTriangle} label="Pending KYC" value={pendingKyc} tone="danger" />
            <MetricRow icon={FileWarning} label="Info requested" value={infoRequired} />
            <MetricRow icon={ShieldAlert} label="Duplicate ID flags" value={duplicateFlags} tone="danger" />
            <MetricRow icon={CheckCircle2} label="Completed decisions" value={completedRows.length} />
          </div>
        </article>
      </div>
    </section>
  );
}

function MetricRow({ icon: Icon, label, value, tone = "default" }) {
  return (
    <div className={`metric-row metric-${tone}`}>
      <Icon size={21} strokeWidth={2.4} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
