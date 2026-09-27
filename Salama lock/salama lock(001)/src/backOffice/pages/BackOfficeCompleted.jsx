import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable } from "../../uploadedAdmin/components/ui/DataTable.jsx";
import { PageHeader } from "../../uploadedAdmin/components/ui/PageHeader.jsx";
import { StatusBadge } from "../../uploadedAdmin/components/ui/StatusBadge.jsx";
import { useAdminData } from "../../uploadedAdmin/features/admin/AdminDataContext.jsx";
import { completedScreeningStatuses, getScreeningRows, matchesScreeningQuery } from "./backOfficeHelpers.js";

export default function BackOfficeCompleted() {
  const { agents, applications, bikes, customers, dataStatus } = useAdminData();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    return getScreeningRows({ agents, applications, bikes, customers, statuses: completedScreeningStatuses })
      .filter((row) => matchesScreeningQuery(row, query));
  }, [agents, applications, bikes, customers, query]);

  const columns = [
    { key: "id", label: "Case ID" },
    { key: "customer", label: "Customer", render: (row) => row.customer?.name || "Customer record" },
    { key: "agent", label: "Agent", render: (row) => row.agent?.name || "Agent record" },
    { key: "reviewedAt", label: "Completed", render: (row) => row.reviewedAt || "Recent decision" },
    { key: "status", label: "Screening result", render: (row) => <StatusBadge status={row.status} /> },
    { key: "open", label: "Open", render: (row) => <Link to={`/backoffice/applications/${row.id}`}>View</Link> }
  ];

  const completedCaseCount = getScreeningRows({ agents, applications, bikes, customers, statuses: completedScreeningStatuses }).length;
  const emptyMessage = dataStatus === "loading"
    ? "Loading completed cases..."
    : applications.length === 0
      ? "No customer applications were returned from the back-office API."
      : completedCaseCount === 0
        ? `Loaded ${applications.length} application${applications.length === 1 ? "" : "s"}, but none are approved or rejected yet. Check the Screening queue for open records.`
        : "No completed screening cases match this search.";

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Completed screening"
        title="Completed cases"
        description="Review cases that have already received a screening decision."
      />
      <div className="panel table-toolbar">
        <label>
          Search completed cases
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer, ID, agent..." />
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
