import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { useAdminData } from "../../features/admin/AdminDataContext.jsx";
import { findAgent } from "../../lib/admin/lookups.js";
import { formatKes } from "../../lib/formatting/currency.js";

export default function AgentDetail() {
  const { agentId } = useParams();
  const { agents, customers, updateAgentStatus } = useAdminData();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const agent = findAgent(agents, agentId);

  if (!agent) {
    return (
      <section className="page-stack">
        <PageHeader title="Agent not found" />
        <Link to="/admin/agents">Back to agents</Link>
      </section>
    );
  }

  const portfolio = customers.filter((customer) => customer.agentId === agent.id);
  const staffRole = agent.role?.replaceAll("_", " ") || "Field agent";

  async function changeStatus(status) {
    setSubmitting(true);
    try {
      await updateAgentStatus(agent.id, status);
      setMessage(`${agent.name} ${status.replaceAll("_", " ")}.`);
    } catch (error) {
      setMessage(error.message || "Could not update agent status.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow={agent.code}
        title={agent.name}
        description={`${staffRole} - ${agent.region} - ${agent.phone} - ${agent.email}`}
        actions={
          <div className="page-actions">
            <Link className="button secondary" to="/admin/agents">Back to agents</Link>
            <StatusBadge status={agent.status} />
          </div>
        }
      />

      {message ? <div className="alert soft">{message}</div> : null}

      <div className="detail-grid">
        <article className="panel">
          <h3>Agent controls</h3>
          <dl className="detail-list agent-summary">
            <div><dt>Staff role</dt><dd>{staffRole}</dd></div>
            <div><dt>ID number</dt><dd>{agent.nationalId || "Not recorded"}</dd></div>
            <div><dt>Region</dt><dd>{agent.region}</dd></div>
          </dl>
          <div className="decision-actions">
            <button className="button success" type="button" disabled={submitting} onClick={() => changeStatus("active")}>
              {submitting ? "Working..." : "Set active"}
            </button>
            <button className="button warning" type="button" disabled={submitting} onClick={() => changeStatus("suspended")}>
              Suspend
            </button>
            <button className="button danger" type="button" disabled={submitting} onClick={() => changeStatus("deactivated")}>
              Deactivate
            </button>
          </div>
        </article>

        <article className="panel">
          <h3>Commission summary</h3>
          <dl className="detail-list">
            <div><dt>Total customers</dt><dd>{agent.totalCustomers}</dd></div>
            <div><dt>Commission balance</dt><dd>{formatKes(agent.commissionBalance)}</dd></div>
          </dl>
        </article>
      </div>

      <article className="panel">
        <h3>Customer portfolio</h3>
        <DataTable
          columns={[
            { key: "name", label: "Customer" },
            { key: "nationalId", label: "National ID" },
            { key: "phone", label: "Phone" },
            { key: "applicationStatus", label: "Application", render: (row) => <StatusBadge status={row.applicationStatus} /> },
            { key: "balance", label: "Balance", render: (row) => formatKes(row.balance) }
          ]}
          rows={portfolio}
        />
      </article>
    </section>
  );
}
