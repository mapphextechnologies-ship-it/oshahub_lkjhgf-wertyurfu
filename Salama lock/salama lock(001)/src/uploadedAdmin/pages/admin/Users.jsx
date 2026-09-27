import { KeyRound, Pencil, ShieldCheck, UserPlus, Users as UsersIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { StatCard } from "../../components/ui/StatCard.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { useAdminData } from "../../features/admin/AdminDataContext.jsx";

const emptyUser = {
  name: "",
  email: "",
  phone: "",
  role: "back_office_officer"
};

const roles = [
  "super_admin",
  "admin",
  "back_office_officer",
  "finance_officer",
  "agent",
  "customer"
];

const statuses = ["pending", "active", "suspended", "inactive"];

function EditUserDialog({ user, onCancel, onSave }) {
  const [form, setForm] = useState({
    name: user.name || "",
    email: user.email || "",
    phone: user.phone || "",
    role: user.role || "finance_officer",
    status: user.status || "pending"
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    try {
      await onSave({
        ...form,
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim()
      });
    } catch (error) {
      setErrorMessage(error.message || "Could not update this user.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-panel user-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-user-title" onSubmit={handleSubmit}>
        <div>
          <h3 id="edit-user-title">Edit user</h3>
          <p>Changes to contact details are also saved to the linked customer, agent, or admin profile.</p>
        </div>
        <div className="settings-form">
          <label>
            Full name
            <input required value={form.name} onChange={(event) => updateField("name", event.target.value)} />
          </label>
          <label>
            Login email
            <input required type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} />
          </label>
          <label>
            Phone
            <input required value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
          </label>
          <label>
            Role
            <select value={form.role} onChange={(event) => updateField("role", event.target.value)}>
              {roles.map((role) => (
                <option key={role} value={role}>{role.replaceAll("_", " ")}</option>
              ))}
            </select>
          </label>
          <label>
            Account status
            <select value={form.status} onChange={(event) => updateField("status", event.target.value)}>
              {statuses.map((status) => (
                <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
              ))}
            </select>
          </label>
        </div>
        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
        <div className="page-actions">
          <button className="button secondary" type="button" disabled={submitting} onClick={onCancel}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Users() {
  const {
    addUser,
    resetUserCredentials,
    updateUser,
    updateUserRole,
    updateUserStatus,
    users = []
  } = useAdminData();
  const [form, setForm] = useState(emptyUser);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [confirmAction, setConfirmAction] = useState(null);
  const [editingUser, setEditingUser] = useState(null);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return users.filter((user) => {
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const searchable = [user.name, user.email, user.phone, user.role, user.status]
        .join(" ")
        .toLowerCase();
      return matchesRole && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [query, roleFilter, users]);

  async function handleSubmit(event) {
    event.preventDefault();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    const duplicate = users.find(
      (user) => user.email?.trim().toLowerCase() === email || user.phone?.trim() === phone
    );

    if (duplicate) {
      setMessage(`${duplicate.name} already uses this email or phone.`);
      return;
    }

    try {
      await addUser({ ...form, email, phone });
      setForm(emptyUser);
      setMessage(`${form.name} created as ${form.role.replaceAll("_", " ")}. Credentials were generated and must be shared securely.`);
    } catch (error) {
      setMessage(error.message || "Could not create user.");
    }
  }

  async function runConfirmedAction() {
    if (!confirmAction) {
      return;
    }

    const { type, user, value } = confirmAction;
    try {
      if (type === "status") {
        await updateUserStatus(user.id, value);
        setMessage(`${user.name} marked ${value.replaceAll("_", " ")}.`);
      }

      if (type === "role") {
        await updateUserRole(user.id, value);
        setMessage(`${user.name} role changed to ${value.replaceAll("_", " ")}.`);
      }

      if (type === "reset") {
        await resetUserCredentials(user.id);
        setMessage(`Credentials reset for ${user.name}. Share the new password securely.`);
      }
    } catch (error) {
      setMessage(error.message || "Could not update user.");
    }

    setConfirmAction(null);
  }

  async function saveEditedUser(userRecord) {
    const duplicate = users.find((user) => (
      user.id !== editingUser.id && (
        user.email?.trim().toLowerCase() === userRecord.email ||
        user.phone?.trim() === userRecord.phone
      )
    ));

    if (duplicate) {
      throw new Error(`${duplicate.name} already uses this email or phone.`);
    }

    const result = await updateUser(editingUser.id, userRecord);
    const synchronized = result.synchronizedTables?.length
      ? ` Linked ${result.synchronizedTables.join(", ")} details were synchronized.`
      : "";
    setMessage(`${userRecord.name} was updated.${synchronized}`);
    setEditingUser(null);
  }

  const columns = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    {
      key: "role",
      label: "Role",
      render: (row) => (
        <select
          value={row.role}
          aria-label={`Role for ${row.name}`}
          onChange={(event) =>
            setConfirmAction({ type: "role", user: row, value: event.target.value })
          }
        >
          {roles.map((role) => (
            <option key={role} value={role}>
              {role.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      )
    },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div className="table-actions">
          <button type="button" onClick={() => setEditingUser(row)}>
            <Pencil size={16} />
            Edit
          </button>
          {row.status === "active" ? (
            <button
              type="button"
              onClick={() => setConfirmAction({ type: "status", user: row, value: "suspended" })}
            >
              Suspend
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmAction({ type: "status", user: row, value: "active" })}
            >
              Activate
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmAction({ type: "reset", user: row })}
          >
            Reset
          </button>
        </div>
      )
    }
  ];

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="User management"
        title="Staff and portal users"
        description="Create users, edit login and profile details, manage roles, suspend access, and issue temporary credential resets."
      />

      {message ? <div className="alert soft">{message}</div> : null}

      <div className="stat-grid compact">
        <StatCard icon={UsersIcon} label="Total users" value={users.length} detail="All user records" />
        <StatCard
          icon={ShieldCheck}
          label="Admins"
          value={users.filter((user) => ["super_admin", "admin", "back_office_officer"].includes(user.role)).length}
          detail="Admin access"
        />
        <StatCard
          icon={KeyRound}
          label="Suspended"
          value={users.filter((user) => user.status === "suspended").length}
          detail="Access blocked"
          tone="warning"
        />
      </div>

      <form className="panel inventory-form" onSubmit={handleSubmit}>
        <div className="settings-card-header">
          <div>
            <p className="eyebrow">Create user</p>
            <h3>Access record</h3>
          </div>
          <UserPlus size={22} />
        </div>
        <div className="settings-form">
          <label>
            Full name
            <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label>
            Email
            <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </label>
          <label>
            Phone
            <input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </label>
          <label>
            Role
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="page-actions">
          <button className="button primary" type="submit">Create user</button>
        </div>
      </form>

      <div className="panel table-toolbar">
        <label>
          Search users
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone..." />
        </label>
        <label>
          Role
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="all">All roles</option>
            {roles.map((role) => (
              <option key={role} value={role}>{role.replaceAll("_", " ")}</option>
            ))}
          </select>
        </label>
        <div className="toolbar-count">
          <span>Visible</span>
          <strong>{filteredUsers.length}</strong>
        </div>
      </div>

      <DataTable columns={columns} rows={filteredUsers} emptyMessage="No users match this view." />

      {editingUser ? (
        <EditUserDialog
          user={editingUser}
          onCancel={() => setEditingUser(null)}
          onSave={saveEditedUser}
        />
      ) : null}

      {confirmAction ? (
        <ConfirmDialog
          title="Confirm user change"
          message={`Apply this change to ${confirmAction.user.name}?`}
          confirmLabel="Apply change"
          tone={confirmAction.type === "reset" ? "warning" : "primary"}
          onCancel={() => setConfirmAction(null)}
          onConfirm={runConfirmedAction}
        />
      ) : null}
    </section>
  );
}
