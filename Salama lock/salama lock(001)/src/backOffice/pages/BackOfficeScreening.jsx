import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable } from "../../uploadedAdmin/components/ui/DataTable.jsx";
import { OtpActionButton } from "../../uploadedAdmin/components/ui/OtpActionButton.jsx";
import { PageHeader } from "../../uploadedAdmin/components/ui/PageHeader.jsx";
import { StatusBadge } from "../../uploadedAdmin/components/ui/StatusBadge.jsx";
import { useAdminData } from "../../uploadedAdmin/features/admin/AdminDataContext.jsx";
import { getApplicationApprovalBlockers } from "../../uploadedAdmin/lib/admin/applicationChecks.js";
import { formatKes } from "../../uploadedAdmin/lib/formatting/currency.js";
import { activeScreeningStatuses, getScreeningRows, matchesScreeningQuery } from "./backOfficeHelpers.js";

export default function BackOfficeScreening() {
  const { agents, applications, bikes, customers, dataStatus, updateApplicationStatus } = useAdminData();
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [submittingId, setSubmittingId] = useState("");

  const rows = useMemo(() => {
    return getScreeningRows({ agents, applications, bikes, customers, statuses: activeScreeningStatuses })
      .filter((row) => stateFilter === "all" || row.status === stateFilter)
      .filter((row) => matchesScreeningQuery(row, query));
  }, [agents, applications, bikes, customers, query, stateFilter]);

  async function saveDecision(application, status) {
    if (status === "approved") {
      const blockers = getApplicationApprovalBlockers(application);
      if (blockers.length > 0) {
        setMessage(`This case cannot be approved yet: ${blockers[0]}`);
        return;
      }
    }

    const notes = {
      approved: "Approved from back-office screening.",
      info_required: "More information requested from back-office screening.",
      rejected: "Rejected from back-office screening."
    };

    setSubmittingId(application.id);
    try {
      await updateApplicationStatus(application.id, status, notes[status]);
      setMessage(`Case ${application.id} updated to ${status.replaceAll("_", " ")}.`);
    } catch (error) {
      setMessage(error.message || `Could not update case ${application.id}.`);
    } finally {
      setSubmittingId("");
    }
  }

  const columns = [
    { key: "id", label: "Case ID" },
    { key: "customer", label: "Customer", render: (row) => row.customer?.name || "Customer record" },
    { key: "nationalId", label: "National ID", render: (row) => row.customer?.nationalId || "Not captured" },
    { key: "agent", label: "Agent", render: (row) => row.agent?.name || "Agent record" },
    { key: "product", label: "Product", render: (row) => row.bike?.serialNumber || "Product pending" },
    { key: "depositAmount", label: "Deposit", render: (row) => formatKes(row.depositAmount) },
    {
      key: "nextOfKin",
      label: "Next-of-kin",
      render: (row) => <StatusBadge status={row.nextOfKinOtpVerified ? "verified" : "pending"} />
    },
    { key: "status", label: "Screening state", render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div className="table-actions">
          <Link to={`/backoffice/applications/${row.id}`}>Open</Link>
          <OtpActionButton className="button secondary" disabled={Boolean(submittingId)} label={`approve ${row.id}`} onVerified={() => saveDecision(row, "approved")}>
            {submittingId === row.id ? "Working..." : "Approve"}
          </OtpActionButton>
          <OtpActionButton className="button warning" disabled={Boolean(submittingId)} label={`request information for ${row.id}`} onVerified={() => saveDecision(row, "info_required")}>
            Request info
          </OtpActionButton>
          <OtpActionButton className="button danger" disabled={Boolean(submittingId)} label={`reject ${row.id}`} onVerified={() => saveDecision(row, "rejected")}>
            Reject
          </OtpActionButton>
        </div>
      )
    }
  ];

  const openCaseCount = getScreeningRows({ agents, applications, bikes, customers, statuses: activeScreeningStatuses }).length;
  const emptyMessage = dataStatus === "loading"
    ? "Loading screening cases..."
    : applications.length === 0
      ? "No customer applications were returned from the back-office API."
      : openCaseCount === 0
        ? `Loaded ${applications.length} application${applications.length === 1 ? "" : "s"}, but none are in an open screening state. Check Completed cases for approved or rejected records.`
        : "No screening cases match this search or state filter.";

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Customer screening"
        title="Screening queue"
        description="Review submitted customer records, next-of-kin verification, and screening decisions."
      />
      {message ? <div className="alert soft">{message}</div> : null}
      <div className="panel table-toolbar">
        <label>
          Search screening
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer, ID, agent, product..." />
        </label>
        <label>
          State
          <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
            <option value="all">All open states</option>
            <option value="next_of_kin_pending">Next-of-kin pending</option>
            <option value="pending_screening">Pending screening</option>
            <option value="info_required">Info requested</option>
          </select>
        </label>
        <div className="toolbar-count">
          <span>Visible</span>
          <strong>{rows.length}</strong>
        </div>
      </div>
      <DataTable columns={columns} rows={rows} emptyMessage={emptyMessage} />
    </section>
  );
}
