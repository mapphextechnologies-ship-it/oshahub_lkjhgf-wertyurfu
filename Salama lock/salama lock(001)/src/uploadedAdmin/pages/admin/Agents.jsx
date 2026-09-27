import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { useAdminData } from "../../features/admin/AdminDataContext.jsx";
import { formatKes } from "../../lib/formatting/currency.js";

const emptyAgent = {
  name: "",
  nationalId: "",
  phone: "",
  email: "",
  role: "field_agent",
  region: ""
};

export default function Agents() {
  const { addAgent, agents, deleteAgent, updateAgentStatus } = useAdminData();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyAgent);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pendingStatus, setPendingStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const visibleAgents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return agents.filter((agent) => {
      const searchable = [agent.code, agent.name, agent.nationalId, agent.phone, agent.email, agent.region, agent.role, agent.status]
        .join(" ")
        .toLowerCase();
      const matchesStatus = statusFilter === "all" || agent.status === statusFilter;
      return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [agents, query, statusFilter]);

  async function handleSubmit(event) {
    event.preventDefault();
    const normalizedNationalId = form.nationalId.trim();
    const normalizedPhone = form.phone.trim().toLowerCase();
    const normalizedEmail = form.email.trim().toLowerCase();
    const duplicateAgent = agents.find((agent) =>
      agent.nationalId === normalizedNationalId ||
      agent.phone?.trim().toLowerCase() === normalizedPhone ||
      agent.email?.trim().toLowerCase() === normalizedEmail
    );

    if (duplicateAgent) {
      setMessage(`Cannot create agent. ${duplicateAgent.name} already uses this ID, phone, or email.`);
      return;
    }

    setSubmitting(true);
    try {
      await addAgent(form);
      setMessage(`${form.name} created and marked pending approval.`);
      setForm(emptyAgent);
      setShowForm(false);
    } catch (error) {
      setMessage(error.message || "Could not create agent.");
    } finally {
      setSubmitting(false);
    }
  }

  async function changeAgentStatus(agent, status) {
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

  async function removeAgent(agent) {
    if (!window.confirm(`Delete ${agent.name}? This will detach their linked customer assignments.`)) {
      return;
    }

    setSubmitting(true);
    try {
      await deleteAgent(agent.id);
      setMessage(`${agent.name} deleted.`);
    } catch (error) {
      setMessage(error.message || "Could not delete agent.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmStatusChange() {
    if (pendingStatus) {
      await changeAgentStatus(pendingStatus.agent, pendingStatus.status);
      setPendingStatus(null);
    }
  }

  const columns = [
    { key: "code", label: "Agent code" },
    { key: "name", label: "Name" },
    { key: "role", label: "Role", render: (row) => row.role?.replaceAll("_", " ") || "Field agent" },
    { key: "nationalId", label: "ID number", render: (row) => row.nationalId || "Not recorded" },
    { key: "phone", label: "Phone" },
    { key: "region", label: "Region" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "totalCustomers", label: "Customers" },
    {
      key: "commissionBalance",
      label: "Commission",
      render: (row) => formatKes(row.commissionBalance)
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div className="table-actions">
          <Link to={`/admin/agents/${row.id}`}>View</Link>
          {row.status === "pending_approval" ? (
            <button type="button" disabled={submitting} onClick={() => setPendingStatus({ agent: row, status: "active" })}>
              Approve
            </button>
          ) : null}
          {row.status === "active" ? (
            <button type="button" disabled={submitting} onClick={() => setPendingStatus({ agent: row, status: "suspended" })}>
              Suspend
            </button>
          ) : null}
          <button type="button" disabled={submitting} onClick={() => removeAgent(row)}>
            Delete
          </button>
        </div>
      )
    }
  ];

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Agent management"
        title="Field agents"
        description="Approve, suspend, and monitor agents responsible for customer onboarding."
        actions={
          <button className="button primary" type="button" onClick={() => setShowForm((open) => !open)}>
            {showForm ? "Close form" : "Create agent"}
          </button>
        }
      />
      {message ? <div className="alert soft">{message}</div> : null}
      {showForm ? (
        <form className="panel inventory-form" onSubmit={handleSubmit}>
          <div className="settings-card-header">
            <div>
              <p className="eyebrow">Staff record</p>
              <h3>Create field agent</h3>
            </div>
          </div>

          <div className="settings-form">
            <label>
              Full name
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Jane Wambui"
              />
            </label>
            <label>
              ID number
              <input
                required
                inputMode="numeric"
                value={form.nationalId}
                onChange={(event) => setForm({ ...form, nationalId: event.target.value })}
                placeholder="12345678"
              />
            </label>
            <label>
              Staff role
              <select
                required
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value })}
              >
                <option value="field_agent">Field agent</option>
                <option value="senior_agent">Senior agent</option>
                <option value="regional_supervisor">Regional supervisor</option>
                <option value="back_office_officer">Back office officer</option>
              </select>
            </label>
            <label>
              Phone
              <input
                required
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="+254 700 000 000"
              />
            </label>
            <label>
              Email
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="agent@SALAMA LOCKpaygo.co.ke"
              />
            </label>
            <label>
              Region
              <input
                required
                value={form.region}
                onChange={(event) => setForm({ ...form, region: event.target.value })}
                placeholder="Kisumu"
              />
            </label>
          </div>

          <div className="page-actions">
            <button className="button primary" type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save agent"}</button>
            <button className="button secondary" type="button" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      <div className="panel table-toolbar">
        <label>
          Search agents
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, ID, region..." />
        </label>
        <label>
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending_approval">Pending approval</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deactivated">Deactivated</option>
          </select>
        </label>
        <div className="toolbar-count">
          <span>Visible</span>
          <strong>{visibleAgents.length}</strong>
        </div>
      </div>
      <DataTable columns={columns} rows={visibleAgents} emptyMessage="No agents match this view." />
      {pendingStatus ? (
        <ConfirmDialog
          title="Confirm agent status"
          message={`Set ${pendingStatus.agent.name} to ${pendingStatus.status.replaceAll("_", " ")}?`}
          confirmLabel="Apply status"
          tone={pendingStatus.status === "suspended" ? "warning" : "success"}
          onCancel={() => setPendingStatus(null)}
          onConfirm={confirmStatusChange}
        />
      ) : null}
    </section>
  );
}
