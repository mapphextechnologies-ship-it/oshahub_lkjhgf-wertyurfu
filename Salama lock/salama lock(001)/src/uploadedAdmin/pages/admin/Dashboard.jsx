import {
  AlertTriangle,
  BadgeDollarSign,
  Bell,
  Bike,
  ClipboardCheck,
  ClipboardList,
  FileWarning,
  ShieldAlert,
  ReceiptText,
  Smartphone,
  UserCog,
  UserCheck,
  UserRoundCheck,
  UserRoundX,
  Users,
  WalletCards
} from "lucide-react";
import { createElement, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { StatCard } from "../../components/ui/StatCard.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { useAdminData } from "../../features/admin/AdminDataContext.jsx";
import { formatKes } from "../../lib/formatting/currency.js";

function formatDateTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function shortId(value) {
  const text = String(value || "").trim();
  if (!text) return "n/a";
  if (text.length <= 14) return text;
  return `${text.slice(0, 6)}...${text.slice(-6)}`;
}

function smsStatusLabel(status) {
  const value = String(status || "unknown").toLowerCase();
  const labels = {
    provider_accepted: "Provider Accepted",
    submitted: "Provider Accepted",
    queued: "Provider Accepted",
    sent: "Sent",
    delivered: "Delivered",
    failed: "Failed",
    rejected: "Rejected",
    expired: "Expired",
    blacklisted: "UserInBlacklist",
    invalid_phone_number: "InvalidPhoneNumber",
    unknown: "Waiting for delivery report"
  };
  return labels[value] || status || "Waiting for delivery report";
}

export default function Dashboard() {
  const {
    agents,
    applications,
    bikes,
    customers,
    notifications = [],
    smsDeliveryReports = [],
    payments = [],
    sendTestSms,
    lookupSmsStatus,
    users = []
  } = useAdminData();
  const [smsPhone, setSmsPhone] = useState("");
  const [smsSenderMode, setSmsSenderMode] = useState("configured");
  const [smsSearch, setSmsSearch] = useState("");
  const [smsStatusFilter, setSmsStatusFilter] = useState("");
  const [smsDateFilter, setSmsDateFilter] = useState("");
  const [smsDiagnosticResult, setSmsDiagnosticResult] = useState(null);
  const [smsDiagnosticError, setSmsDiagnosticError] = useState("");
  const [smsDiagnosticBusy, setSmsDiagnosticBusy] = useState(false);

  const pending = applications.filter((item) => item.status === "pending_screening").length;
  const approved = applications.filter((item) => item.status === "approved").length;
  const infoRequired = applications.filter((item) => item.status === "info_required").length;
  const duplicateFlags = applications.filter((item) => item.duplicateNationalId).length;
  const failedKinOtp = applications.filter((item) => !item.nextOfKinOtpVerified).length;
  const unclearDocuments = applications.filter((item) =>
    (item.documents || []).some((document) => document.status === "unclear")
  ).length;

  const activeAgents = agents.filter((item) => item.status === "active").length;
  const pendingAgents = agents.filter((item) => item.status === "pending_approval").length;
  const suspendedAgents = agents.filter((item) => item.status === "suspended").length;
  const activeUsers = users.filter((item) => item.status === "active").length;
  const adminUsers = users.filter((item) =>
    ["super_admin", "back_office_officer"].includes(item.role)
  ).length;
  const availableBikes = bikes.filter((item) => item.status === "available" && item.productType === "bike").length;
  const reservedBikes = bikes.filter((item) => item.status === "reserved" && item.productType === "bike").length;
  const assignedBikes = bikes.filter((item) => item.status === "assigned" && item.productType === "bike").length;
  const availablePhones = bikes.filter((item) => item.status === "available" && item.productType === "phone").length;
  const reservedPhones = bikes.filter((item) => item.status === "reserved" && item.productType === "phone").length;
  const assignedPhones = bikes.filter((item) => item.status === "assigned" && item.productType === "phone").length;

  const collectibleCustomers = customers.filter((customer) => customer.applicationStatus !== "rejected" && customer.repaymentStatus !== "rejected");
  const totalBalances = collectibleCustomers.reduce((sum, customer) => sum + customer.balance, 0);
  const unpaidCommissions = agents.reduce((sum, agent) => sum + agent.commissionBalance, 0);
  const totalCollected = payments
    .filter((payment) => payment.status === "success")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const pendingPayments = payments.filter((payment) => payment.status === "pending").length;
  const unmatchedPayments = payments.filter((payment) =>
    ["unmatched", "manual_review"].includes(payment.reconciliationStatus)
  ).length;
  const unreadNotifications = notifications.filter((notification) => notification.status === "unread").length;
  const smsAccepted = smsDeliveryReports.filter((item) => ["provider_accepted", "submitted", "queued"].includes(String(item.deliveryStatus || "").toLowerCase())).length;
  const smsSent = smsDeliveryReports.filter((item) => String(item.deliveryStatus || "").toLowerCase() === "sent").length;
  const smsDelivered = smsDeliveryReports.filter((item) => String(item.deliveryStatus || "").toLowerCase() === "delivered").length;
  const smsFailed = smsDeliveryReports.filter((item) => ["failed", "rejected", "expired", "blacklisted", "invalid_phone_number"].includes(String(item.deliveryStatus || "").toLowerCase())).length;
  const expectedCollections = totalBalances;

  const filteredSmsReports = useMemo(() => {
    const search = smsSearch.trim().toLowerCase();
    return smsDeliveryReports.filter((report) => {
      const status = String(report.deliveryStatus || "").toLowerCase();
      const created = String(report.createdAt || report.lastReportedAt || "").slice(0, 10);
      const matchesSearch = !search || [
        report.providerMessageId,
        report.messageId,
        report.recipientPhone,
        report.phone,
        report.requestId,
        report.purpose
      ].some((value) => String(value || "").toLowerCase().includes(search));
      const matchesStatus = !smsStatusFilter || status === smsStatusFilter;
      const matchesDate = !smsDateFilter || created === smsDateFilter;
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [smsDateFilter, smsDeliveryReports, smsSearch, smsStatusFilter]);

  async function runSmsDiagnostic() {
    setSmsDiagnosticBusy(true);
    setSmsDiagnosticError("");
    setSmsDiagnosticResult(null);
    try {
      const result = await sendTestSms({
        phone: smsPhone,
        senderMode: smsSenderMode,
        testType: "otp",
        waitSeconds: 2
      });
      setSmsDiagnosticResult(result);
      if (result?.result?.providerMessageId) {
        const status = await lookupSmsStatus(result.result.providerMessageId);
        setSmsDiagnosticResult({ ...result, lookup: status });
      }
    } catch (error) {
      setSmsDiagnosticError(error.message || "SMS diagnostic failed.");
    } finally {
      setSmsDiagnosticBusy(false);
    }
  }

  const screeningRows = applications
    .filter((item) => ["pending_screening", "info_required"].includes(item.status))
    .concat(applications.filter((item) => item.duplicateNationalId))
    .filter((item, index, list) => list.findIndex((record) => record.id === item.id) === index);

  const reviewColumns = [
    { key: "id", label: "Application" },
    {
      key: "customer",
      label: "Customer",
      render: (row) => customers.find((customer) => customer.id === row.customerId)?.name
    },
    {
      key: "risk",
      label: "Risk",
      render: (row) => (row.duplicateNationalId ? "Duplicate ID" : "Standard review")
    },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "action",
      label: "Action",
      render: (row) => <Link to={`/admin/applications/${row.id}`}>Open review</Link>
    }
  ];

  const smsColumns = [
    {
      key: "providerMessageId",
      label: "Message",
      render: (row) => shortId(row.providerMessageId)
    },
    {
      key: "purpose",
      label: "Purpose",
      render: (row) => row.purpose || "general"
    },
    {
      key: "recipientPhone",
      label: "Phone",
      render: (row) => row.recipientPhone || "n/a"
    },
    {
      key: "deliveryStatus",
      label: "Final status",
      render: (row) => <StatusBadge status={smsStatusLabel(row.deliveryStatus)} />
    },
    {
      key: "providerAckStatus",
      label: "Gateway ack",
      render: (row) => <StatusBadge status={String(row.providerAckStatus || "unknown").toLowerCase()} />
    },
    {
      key: "failureReason",
      label: "Reason",
      render: (row) => row.failureReason || smsStatusLabel(row.deliveryStatus)
    },
    {
      key: "networkCode",
      label: "Network",
      render: (row) => row.networkCode || "—"
    },
    {
      key: "lastReportedAt",
      label: "Updated",
      render: (row) => formatDateTime(row.lastReportedAt || row.updatedAt || row.createdAt)
    }
  ];

  return (
    <section className="page-stack dashboard-page">
      <div className="dashboard-header-band">
        <PageHeader
          eyebrow="Admin overview"
          title="Operational dashboard"
          description="Control customer screening, agent activity, bike inventory, finance visibility, reports, and audit risk from one SALAMA LOCK PAYGO admin view."
        />
      </div>

      <section className="dashboard-section">
        <div className="section-title">
          <p className="eyebrow">Overview</p>
          <h3>Control summary</h3>
        </div>
        <div className="stat-grid dashboard-summary-grid">
          <StatCard icon={ClipboardList} label="Pending screening" value={pending} detail="Needs review" tone="warning" to="/admin/applications" />
          <StatCard icon={FileWarning} label="Info required" value={infoRequired} detail="Returned to agent" to="/admin/applications" />
          <StatCard icon={ClipboardCheck} label="Approved" value={approved} detail="Activated cases" tone="success" to="/admin/customers" />
          <StatCard icon={ShieldAlert} label="Duplicate IDs" value={duplicateFlags} detail="Risk flags" tone="danger" to="/admin/applications" />
          <StatCard icon={Users} label="Staff active" value={activeUsers} detail={`${users.length} user records`} to="/admin/agents" />
          <StatCard icon={WalletCards} label="Outstanding" value={formatKes(totalBalances)} detail="Customer balance" to="/admin/customers" />
          <StatCard icon={Bell} label="Unread alerts" value={unreadNotifications} detail="Notifications" to="/admin/notifications" />
          <StatCard icon={Smartphone} label="SMS accepted" value={smsAccepted} detail="Reached Africa's Talking" tone="warning" />
          <StatCard icon={Smartphone} label="SMS delivered" value={smsDelivered} detail="Reached handset" tone="success" />
          <StatCard icon={Smartphone} label="SMS failed" value={smsFailed} detail="Rejected or failed" tone="danger" />
        </div>
      </section>

      <section className="dashboard-section">
        <div className="panel priority-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Screening operations</p>
              <h3>KYC approval queue</h3>
            </div>
            <Link to="/admin/applications">View all applications</Link>
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

          <DataTable columns={reviewColumns} rows={screeningRows} />
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-section">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Staff operations</p>
                <h3>Users and field agents</h3>
              </div>
              <Link to="/admin/agents">Manage agents</Link>
            </div>

            <div className="metric-list">
              <MetricRow icon={UserCog} label="Admin users" value={adminUsers} />
              <MetricRow icon={Users} label="Active users" value={activeUsers} />
              <MetricRow icon={UserRoundCheck} label="Active agents" value={activeAgents} />
              <MetricRow icon={UserCheck} label="Pending approval" value={pendingAgents} />
              <MetricRow icon={UserRoundX} label="Suspended agents" value={suspendedAgents} tone="danger" />
              <MetricRow icon={BadgeDollarSign} label="Commission balance" value={formatKes(unpaidCommissions)} />
            </div>
          </div>
        </section>

        <section className="dashboard-section">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Customer and inventory accounts</p>
                <h3>Phones and bikes portfolio</h3>
              </div>
              <div className="panel-header-actions">
                <Link to="/admin/phone-inventory">Phones</Link>
                <Link to="/admin/bike-inventory">Bikes</Link>
              </div>
            </div>

            <div className="metric-list">
              <MetricRow icon={Users} label="Customer records" value={customers.length} />
              <MetricRow icon={Smartphone} label="Available phones" value={availablePhones} />
              <MetricRow icon={Smartphone} label="Reserved phones" value={reservedPhones} />
              <MetricRow icon={Smartphone} label="Assigned phones" value={assignedPhones} />
              <MetricRow icon={Bike} label="Available bikes" value={availableBikes} />
              <MetricRow icon={Bike} label="Reserved bikes" value={reservedBikes} />
              <MetricRow icon={Bike} label="Assigned bikes" value={assignedBikes} />
            </div>
          </div>
        </section>
      </div>

      <section className="dashboard-section">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Finance snapshot</p>
              <h3>Collections and commission visibility</h3>
            </div>
          </div>

          <div className="finance-grid">
            <StatCard icon={WalletCards} label="Total collected" value={formatKes(totalCollected)} detail="Successful payments" to="/admin/finance" />
            <StatCard icon={WalletCards} label="Expected collections" value={formatKes(expectedCollections)} detail="Outstanding balance" to="/admin/finance" />
            <StatCard icon={ReceiptText} label="Pending payments" value={pendingPayments} detail="Payment records pending" tone="warning" to="/admin/finance" />
            <StatCard icon={AlertTriangle} label="Reconciliation flags" value={unmatchedPayments} detail="Unmatched/manual review" tone="warning" to="/admin/finance" />
            <StatCard icon={BadgeDollarSign} label="Unpaid commissions" value={formatKes(unpaidCommissions)} detail="Agent commission balance" to="/admin/finance" />
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">SMS delivery</p>
              <h3>Africa's Talking delivery reports</h3>
            </div>
          </div>

          <div className="operations-strip">
            <div>
              <strong>{smsAccepted}</strong>
              <span>Accepted by the gateway</span>
            </div>
            <div>
              <strong>{smsSent}</strong>
              <span>Marked sent by telco</span>
            </div>
            <div>
              <strong>{smsDelivered}</strong>
              <span>Reached the handset</span>
            </div>
            <div>
              <strong>{smsFailed}</strong>
              <span>Failed or rejected</span>
            </div>
          </div>

          <div className="sms-diagnostic-grid">
            <div className="sms-diagnostic-card">
              <p className="eyebrow">Diagnostic OTP</p>
              <div className="sms-diagnostic-fields">
                <label>
                  Safaricom or Airtel test number
                  <input
                    value={smsPhone}
                    onChange={(event) => setSmsPhone(event.target.value)}
                    placeholder="07XXXXXXXX or 01XXXXXXXX"
                  />
                </label>
                <label>
                  Sender mode
                  <select value={smsSenderMode} onChange={(event) => setSmsSenderMode(event.target.value)}>
                    <option value="configured">SALAMA LOCKPAYGO sender ID</option>
                    <option value="default">Default Africa's Talking sender</option>
                  </select>
                </label>
                <button className="button primary" type="button" onClick={runSmsDiagnostic} disabled={smsDiagnosticBusy || !smsPhone.trim()}>
                  {smsDiagnosticBusy ? "Testing..." : "Send diagnostic OTP"}
                </button>
              </div>
              <p className="muted-copy">Use this twice: once with a Safaricom number and once with an Airtel number, then compare final delivery reports.</p>
              {smsDiagnosticError ? <div className="alert danger">{smsDiagnosticError}</div> : null}
              {smsDiagnosticResult ? (
                <div className="sms-diagnostic-result">
                  <strong>{shortId(smsDiagnosticResult.result?.providerMessageId || smsDiagnosticResult.result?.sid)}</strong>
                  <span>{smsStatusLabel(smsDiagnosticResult.lookup?.status?.deliveryStatus || smsDiagnosticResult.finalStatus?.deliveryStatus || smsDiagnosticResult.result?.deliveryStatus)}</span>
                </div>
              ) : null}
            </div>
            <div className="sms-diagnostic-card">
              <p className="eyebrow">Search logs</p>
              <div className="sms-diagnostic-fields">
                <label>
                  Phone, messageId, requestId
                  <input value={smsSearch} onChange={(event) => setSmsSearch(event.target.value)} placeholder="Search SMS logs" />
                </label>
                <label>
                  Status
                  <select value={smsStatusFilter} onChange={(event) => setSmsStatusFilter(event.target.value)}>
                    <option value="">All statuses</option>
                    <option value="provider_accepted">Provider Accepted</option>
                    <option value="sent">Sent</option>
                    <option value="delivered">Delivered</option>
                    <option value="failed">Failed</option>
                    <option value="rejected">Rejected</option>
                    <option value="expired">Expired</option>
                    <option value="blacklisted">UserInBlacklist</option>
                    <option value="invalid_phone_number">InvalidPhoneNumber</option>
                  </select>
                </label>
                <label>
                  Date
                  <input type="date" value={smsDateFilter} onChange={(event) => setSmsDateFilter(event.target.value)} />
                </label>
              </div>
            </div>
          </div>

          <DataTable
            columns={smsColumns}
            rows={filteredSmsReports.slice(0, 12)}
            emptyMessage="No SMS delivery reports yet."
          />
        </div>
      </section>
    </section>
  );
}

function MetricRow({ icon, label, value, tone = "default" }) {
  return (
    <div className={`metric-row metric-${tone}`}>
      {createElement(icon, { size: 21, strokeWidth: 2.4 })}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
