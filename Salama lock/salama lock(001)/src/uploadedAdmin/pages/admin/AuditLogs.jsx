import { useMemo, useState } from "react";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { useAdminData } from "../../features/admin/AdminDataContext.jsx";

export default function AuditLogs() {
  const { archiveAuditLogs, archivedAuditLogs = [], auditLogs } = useAdminData();
  const [query, setQuery] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [message, setMessage] = useState("");

  const visibleSource = showArchived ? archivedAuditLogs : auditLogs;
  const entityTypes = useMemo(
    () => Array.from(new Set(visibleSource.map((log) => log.entityType))).sort(),
    [visibleSource]
  );
  const filteredLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return visibleSource.filter((log) => {
      const matchesEntity = entityType === "all" || log.entityType === entityType;
      const searchable = [
        log.createdAt,
        log.actor,
        log.role,
        log.action,
        log.entityType,
        log.entityId
      ]
        .join(" ")
        .toLowerCase();
      return matchesEntity && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [entityType, query, visibleSource]);

  function clearVisibleLogs() {
    if (showArchived || filteredLogs.length === 0) {
      return;
    }

    archiveAuditLogs(filteredLogs.map((log) => log.id));
    setMessage(`${filteredLogs.length} visible audit records archived from the main view.`);
  }

  const columns = [
    { key: "createdAt", label: "Created" },
    { key: "actor", label: "Actor" },
    { key: "role", label: "Role" },
    { key: "action", label: "Action" },
    { key: "entityType", label: "Entity type" },
    { key: "entityId", label: "Entity ID" }
  ];

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Compliance"
        title="My audit logs"
        description="Trace actions and security events recorded for the currently signed-in admin account."
        actions={
          <div className="page-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => setShowArchived((current) => !current)}
            >
              {showArchived ? "Show active logs" : "Show archived"}
            </button>
            <button
              className="button primary"
              type="button"
              disabled={showArchived || filteredLogs.length === 0}
              onClick={clearVisibleLogs}
            >
              Archive visible logs
            </button>
          </div>
        }
      />

      {message ? <div className="alert soft">{message}</div> : null}

      <div className="panel table-toolbar">
        <label>
          Search audit logs
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search actor, action, or entity..."
          />
        </label>
        <label>
          Entity type
          <select value={entityType} onChange={(event) => setEntityType(event.target.value)}>
            <option value="all">All entity types</option>
            {entityTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <div className="toolbar-count">
          <span>{showArchived ? "Archived view" : "Active view"}</span>
          <strong>{filteredLogs.length}</strong>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={filteredLogs}
        emptyMessage={showArchived ? "No archived audit records for this admin." : "No audit records match this admin view."}
      />
    </section>
  );
}
