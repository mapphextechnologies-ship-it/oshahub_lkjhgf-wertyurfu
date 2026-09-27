import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { OtpActionButton } from "../../components/ui/OtpActionButton.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { useAdminData } from "../../features/admin/AdminDataContext.jsx";
import { getApplicationApprovalBlockers } from "../../lib/admin/applicationChecks.js";
import { findAgent, findBike, findCustomer } from "../../lib/admin/lookups.js";
import { formatKes } from "../../lib/formatting/currency.js";

export default function Applications() {
  const { agents, applications, bikes, customers, updateApplicationStatus } = useAdminData();
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [submittingId, setSubmittingId] = useState("");

  const visibleApplications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return applications.filter((application) => {
      const customer = findCustomer(customers, application.customerId);
      const agent = findAgent(agents, application.agentId);
      const bike = findBike(bikes, application.bikeId);
      const searchable = [
        application.id,
        application.status,
        application.installmentPlan,
        customer?.name,
        customer?.nationalId,
        customer?.phone,
        agent?.name,
        bike?.serialNumber
      ]
        .join(" ")
        .toLowerCase();
      const matchesStatus = statusFilter === "all" || application.status === statusFilter;
      return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [agents, applications, bikes, customers, query, statusFilter]);

  async function quickDecision(application, status) {
    if (status === "approved") {
      const blockers = getApplicationApprovalBlockers(application);
      if (blockers.length > 0) {
        setMessage(`Cannot approve ${application.id}: ${blockers[0]}`);
        return;
      }
    }

    const notes = {
      approved: "Approved from screening queue quick action.",
      info_required: "More information requested from screening queue.",
      rejected: "Rejected from screening queue quick action."
    };
    setSubmittingId(application.id);
    try {
      await updateApplicationStatus(application.id, status, notes[status]);
      setMessage(`Application ${application.id} ${status.replaceAll("_", " ")}.`);
    } catch (error) {
      setMessage(error.message || `Could not update application ${application.id}.`);
    } finally {
      setSubmittingId("");
    }
  }

  const columns = [
    { key: "id", label: "Application ID" },
    {
      key: "customer",
      label: "Customer",
      render: (row) => findCustomer(customers, row.customerId)?.name
    },
    {
      key: "nationalId",
      label: "National ID",
      render: (row) => findCustomer(customers, row.customerId)?.nationalId
    },
    {
      key: "agent",
      label: "Agent",
      render: (row) => findAgent(agents, row.agentId)?.name
    },
    {
      key: "bike",
      label: "Bike serial",
      render: (row) => findBike(bikes, row.bikeId)?.serialNumber || "Not assigned"
    },
    {
      key: "depositAmount",
      label: "Deposit",
      render: (row) => formatKes(row.depositAmount)
    },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "open",
      label: "Actions",
      render: (row) => (
        <div className="table-actions">
          <Link to={`/admin/applications/${row.id}`}>Open</Link>
          {["pending_screening", "info_required"].includes(row.status) ? (
            <>
              <OtpActionButton className="button secondary" disabled={Boolean(submittingId)} label={`approve ${row.id}`} onVerified={() => quickDecision(row, "approved")}>
                {submittingId === row.id ? "Working..." : "Approve"}
              </OtpActionButton>
              <OtpActionButton className="button warning" disabled={Boolean(submittingId)} label={`request information for ${row.id}`} onVerified={() => quickDecision(row, "info_required")}>
                Info
              </OtpActionButton>
              <OtpActionButton className="button danger" disabled={Boolean(submittingId)} label={`reject ${row.id}`} onVerified={() => quickDecision(row, "rejected")}>
                Reject
              </OtpActionButton>
            </>
          ) : null}
        </div>
      )
    }
  ];

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Screening and approval"
        title="Customer applications"
        description="Review submitted customer KYC records, bike assignment, OTP status, and duplicate ID flags."
      />
      {message ? <div className="alert soft">{message}</div> : null}
      <div className="panel table-toolbar">
        <label>
          Search applications
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer, ID, agent, bike..." />
        </label>
        <label>
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending_screening">Pending screening</option>
            <option value="info_required">Info required</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <div className="toolbar-count">
          <span>Visible</span>
          <strong>{visibleApplications.length}</strong>
        </div>
      </div>
      <DataTable columns={columns} rows={visibleApplications} emptyMessage="No applications match this view." />
    </section>
  );
}
