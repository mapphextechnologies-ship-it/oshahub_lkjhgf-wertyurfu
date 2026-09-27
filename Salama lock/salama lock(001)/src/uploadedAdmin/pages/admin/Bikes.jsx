import { useMemo, useState } from "react";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { useAdminData } from "../../features/admin/AdminDataContext.jsx";
import { findAgent, findCustomer } from "../../lib/admin/lookups.js";
import { formatKes } from "../../lib/formatting/currency.js";

const emptyBike = {
  productType: "bike",
  model: "",
  totalPayable: "",
  imageUrl: "",
  serialNumber: "",
  chassisNumber: "",
  imei1: "",
  imei2: "",
  lockerId: "",
  lockerProvider: "",
  assignedAgentId: ""
};

function createEmptyInventoryForm(productType = "bike") {
  const normalizedType = String(productType || "bike").toLowerCase() === "phone" ? "phone" : "bike";
  return {
    ...emptyBike,
    productType: normalizedType,
    lockerProvider: normalizedType === "phone" ? "honor" : ""
  };
}

function normalizedIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

function inventoryIdentifiers(row = {}) {
  const productType = String(row.productType || "").trim().toLowerCase();
  if (productType === "phone") {
    return [row.imei1, row.imei2, row.lockerId].map(normalizedIdentifier).filter(Boolean);
  }

  return [
    row.serialNumber,
    row.chassisNumber
  ].map(normalizedIdentifier).filter(Boolean);
}

function inventoryFormFromRow(row = {}) {
  const productType = String(row.productType || "").trim().toLowerCase() === "phone" ? "phone" : "bike";
  return {
    ...createEmptyInventoryForm(productType),
    productType,
    model: row.model || row.productModel || "",
    totalPayable: String(row.totalPayable ?? row.total_payable ?? ""),
    imageUrl: productType === "phone" ? "" : (row.imageUrl || ""),
    serialNumber: productType === "phone" ? "" : (row.serialNumber || ""),
    chassisNumber: productType === "phone" ? "" : (row.chassisNumber || ""),
    imei1: productType === "phone" ? (row.imei1 || "") : "",
    imei2: productType === "phone" ? (row.imei2 || "") : "",
    lockerId: productType === "phone" ? (row.lockerId || "") : "",
    lockerProvider: productType === "phone" ? (row.lockerProvider || "honor") : "",
    assignedAgentId: row.assignedAgentId || "",
    branch: row.branch || "",
    status: row.status || "available"
  };
}

function normalizeHonorLockStatus(rowOrStatus) {
  const rawStatus = typeof rowOrStatus === "object" && rowOrStatus !== null
    ? (rowOrStatus.lockStatus || rowOrStatus.honorLockStatus || rowOrStatus.lockerSyncStatus || "")
    : rowOrStatus;
  const status = String(rawStatus || "").trim().toLowerCase();

  if (!status) return "pending";
  if (["locked", "unlocked", "registered"].includes(status)) return status;
  if (["synced", "done", "completed", "success"].includes(status)) return "synced";
  if (["failed", "error"].includes(status)) return "failed";
  if (["processing", "queued", "sent", "pending"].includes(status)) return "pending";
  return status;
}

function normalizeHonorSyncStatus(rowOrStatus) {
  const rawStatus = typeof rowOrStatus === "object" && rowOrStatus !== null
    ? (rowOrStatus.lockerSyncStatus || rowOrStatus.syncStatus || rowOrStatus.status || "")
    : rowOrStatus;
  const status = String(rawStatus || "").trim().toLowerCase();

  if (!status) return "pending";
  if (["synced", "done", "completed", "success"].includes(status)) return "synced";
  if (["failed", "error"].includes(status)) return "failed";
  if (["processing", "queued", "sent", "pending"].includes(status)) return "pending";
  return status;
}

function formatHonorDeviceState(row) {
  const directStatus = String(row?.honorDeviceState || row?.honorLockStatus || row?.lockStatus || "").trim().toLowerCase();
  if (directStatus === "failed") return "Failed";
  if (directStatus === "unlocked") return "Unlocked";
  if (directStatus === "registered") return "Registered";
  if (directStatus === "locked") return "Locked";
  if (directStatus === "pending") return "Pending";
  return directStatus ? directStatus.charAt(0).toUpperCase() + directStatus.slice(1) : "Pending";
}

function formatHonorSyncStatus(row) {
  const status = normalizeHonorSyncStatus(row);
  if (status === "failed") return "Failed";
  if (status === "synced") return "Synced";
  if (status === "pending") return "Pending";
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Pending";
}

function formatHonorTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function lockerProviderKey(row) {
  const provider = String(row?.lockerProvider || "").trim().toLowerCase();
  if (["trustonic", "trust", "ttp", "telecoms-platform", "trustonic-v2"].includes(provider)) return "trustonic";
  return "honor";
}

function lockerProviderLabel(row) {
  return lockerProviderKey(row) === "trustonic" ? "Trustonic" : "Honor";
}

export default function Bikes({ initialScope = "all" } = {}) {
  const { addBike, agents, bikes, customers, deleteBike, refreshBikeLockStatus, updateBike, updateBikeAgent } = useAdminData();
  const [showForm, setShowForm] = useState(false);
  const [editingBike, setEditingBike] = useState(null);
  const [form, setForm] = useState(() => createEmptyInventoryForm(initialScope));
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scope, setScope] = useState(initialScope);

  const scopedBikes = useMemo(() => {
    return bikes.filter((bike) => scope === "all" || String(bike.productType || "").toLowerCase() === scope);
  }, [bikes, scope]);

  const visibleBikes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return scopedBikes.filter((bike) => {
      const customer = findCustomer(customers, bike.assignedCustomerId);
      const agent = findAgent(agents, bike.assignedAgentId);
      const isPhone = String(bike.productType || "").toLowerCase() === "phone";
      const searchable = [
        bike.model,
        bike.serialNumber,
        bike.chassisNumber,
        isPhone ? bike.imei1 : "",
        isPhone ? bike.imei2 : "",
        isPhone ? bike.lockerId : "",
        isPhone ? bike.lockerProvider : "",
        bike.status,
        bike.imageUrl,
        customer?.name,
        agent?.name
      ]
        .join(" ")
        .toLowerCase();
      const matchesStatus = statusFilter === "all" || bike.status === statusFilter;
      return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [agents, customers, query, scopedBikes, statusFilter]);

  const scopeLabel = scope === "phone" ? "Phone inventory" : scope === "bike" ? "Bike inventory" : "Inventory";
  const scopeDescription = scope === "phone"
    ? "Phone stock uses IMEI and locker details only. Bike records stay on serial and chassis identity fields."
    : scope === "bike"
      ? "Bike stock stays on vehicle identity, assignment, and readiness fields."
      : "Keep phone and bike inventory in separate lanes so each record stays clean and searchable.";
  const formType = scope === "all" ? form.productType : scope;
  const phoneLockedRows = scopedBikes.filter((bike) => String(bike.productType || "").toLowerCase() === "phone");
  const phoneLockSummary = useMemo(() => {
    return {
      total: phoneLockedRows.length,
      locked: phoneLockedRows.filter((row) => normalizeHonorLockStatus(row) === "locked").length,
      unlocked: phoneLockedRows.filter((row) => normalizeHonorLockStatus(row) === "unlocked").length,
      pending: phoneLockedRows.filter((row) => normalizeHonorSyncStatus(row) === "pending").length,
      failed: phoneLockedRows.filter((row) => normalizeHonorSyncStatus(row) === "failed").length,
      honor: phoneLockedRows.filter((row) => lockerProviderKey(row) === "honor").length,
      trustonic: phoneLockedRows.filter((row) => lockerProviderKey(row) === "trustonic").length
    };
  }, [phoneLockedRows]);
  const phoneHighlights = useMemo(() => {
    return [...phoneLockedRows].sort((first, second) => {
      const providerDiff = lockerProviderLabel(first).localeCompare(lockerProviderLabel(second));
      if (providerDiff !== 0) return providerDiff;
      return String(first.model || first.imei1 || "").localeCompare(String(second.model || second.imei1 || ""));
    });
  }, [phoneLockedRows]);

  function resetInventoryForm(nextScope = scope) {
    setEditingBike(null);
    setForm(createEmptyInventoryForm(nextScope));
  }

  function startEditBike(row) {
    setEditingBike(row);
    setScope((current) => (current === "all" ? current : String(row.productType || current).toLowerCase() || current));
    setForm(inventoryFormFromRow(row));
    setShowForm(true);
    setMessage(`Editing ${row.model || row.serialNumber || row.imei1 || "inventory"}...`);
  }

  function handleImageCapture(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSize = 320;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        setForm((current) => ({ ...current, imageUrl: canvas.toDataURL("image/jpeg", 0.72) }));
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const totalPayable = Number(String(form.totalPayable || "").replace(/,/g, "").trim());
    if (!Number.isFinite(totalPayable) || totalPayable <= 0) {
      setMessage("Enter a valid total payable amount before saving inventory.");
      return;
    }
    const isEditing = Boolean(editingBike?.id);
    const normalizedSerial = formType === "phone" ? "" : form.serialNumber.trim().toLowerCase();
    const normalizedChassis = formType === "phone" ? "" : form.chassisNumber.trim().toLowerCase();
    const normalizedImei1 = formType === "phone" ? form.imei1.trim().toLowerCase() : "";
    const normalizedImei2 = formType === "phone" ? form.imei2.trim().toLowerCase() : "";
    const normalizedLockerId = formType === "phone" ? form.lockerId.trim().toLowerCase() : "";
    const normalizedImageUrl = formType === "phone" ? "" : form.imageUrl.trim().toLowerCase();
    const submittedIdentifiers = inventoryIdentifiers({
      productType: formType,
      serialNumber: normalizedSerial,
      chassisNumber: normalizedChassis,
      imei1: normalizedImei1,
      imei2: normalizedImei2,
      lockerId: normalizedLockerId
    });
    const duplicateBike = bikes.find((bike) => {
      if (String(bike.productType || "").toLowerCase() !== formType) {
        return false;
      }
      if (isEditing && bike.id === editingBike.id) {
        return false;
      }

      const existingIdentifiers = new Set(inventoryIdentifiers(bike));
      const matchesIdentifier = submittedIdentifiers.some((identifier) => existingIdentifiers.has(identifier));
      const matchesImage = normalizedImageUrl && bike.imageUrl?.trim().toLowerCase() === normalizedImageUrl;
      return matchesIdentifier || matchesImage;
    });

    if (duplicateBike) {
      setMessage(`Cannot add inventory. A matching serial, chassis, IMEI, locker ID, or image URL already exists.`);
      return;
    }

    try {
      const payload = {
        ...form,
        productModel: form.model,
        totalPayable,
        productType: formType,
        imageUrl: formType === "phone" ? "" : form.imageUrl
      };

      if (isEditing) {
        await updateBike(editingBike.id, payload);
        setMessage(`${formType} ${form.model} updated successfully.`);
      } else {
        await addBike(payload);
        const agent = findAgent(agents, form.assignedAgentId);
        setMessage(`${formType} ${form.model} saved${agent ? ` and assigned to ${agent.name}` : " as available stock"}.`);
      }

      resetInventoryForm(formType);
      setShowForm(false);
    } catch (error) {
      setMessage(error.message || "Could not save inventory record.");
    }
  }

  async function assignBike(row, assignedAgentId) {
    try {
      await updateBikeAgent(row.id, assignedAgentId);
      const agent = findAgent(agents, assignedAgentId);
      setMessage(agent ? `${row.serialNumber} assigned to ${agent.name}.` : `${row.serialNumber} is now unassigned stock.`);
    } catch (error) {
      setMessage(error.message || "Could not assign bike.");
    }
  }

  async function removeBike(row) {
    if (!window.confirm(`Delete ${row.model || row.serialNumber}? This removes the inventory record.`)) {
      return;
    }

    try {
      await deleteBike(row.id);
      setMessage(`${row.serialNumber || row.model} deleted.`);
    } catch (error) {
      setMessage(error.message || "Could not delete inventory record.");
    }
  }

  async function refreshLock(row) {
    if (String(row.productType || "").toLowerCase() !== "phone") {
      setMessage("Lock status refresh only applies to phone inventory.");
      return;
    }

    try {
      const result = await refreshBikeLockStatus(row.id);
      const nextStatus = result?.refreshed?.lockStatus || result?.refreshed?.honorLockStatus || result?.product?.lockStatus || result?.product?.honorLockStatus || "updated";
      setMessage(`${row.model || row.imei1 || row.serialNumber || "Phone"} lock status refreshed: ${nextStatus}.`);
    } catch (error) {
      setMessage(error.message || "Could not refresh lock status.");
    }
  }

  const columns = [
    {
      key: "image",
      label: "Image",
      render: (row) => (
        <div style={{ width: 56, height: 40, borderRadius: 8, overflow: 'hidden', background: '#eef4fb', border: '1px solid #d8e4f0', display: 'grid', placeItems: 'center' }}>
          {row.imageUrl ? (
            <img
              src={row.imageUrl}
              alt={row.model || row.serialNumber || row.imei1 || 'Inventory image'}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>No image</span>
          )}
        </div>
      )
    },
    { key: "productType", label: "Type" },
    {
      key: "model",
      label: "Model",
      render: (row) => (
        <div className="inventory-cell-stack">
          <strong>{row.model || "Unknown model"}</strong>
          {String(row.productType || "").toLowerCase() === "phone" ? (
            <span>
              {lockerProviderLabel(row)} locker | {formatHonorDeviceState(row)} | {formatKes(row.totalPayable || 0)}
            </span>
          ) : (
            <span>Bike asset | {row.status || "available"} | {formatKes(row.totalPayable || 0)}</span>
          )}
        </div>
      )
    },
    ...(scope === "phone"
      ? [
          {
            key: "imei1",
            label: "IMEI 1",
            render: (row) => (
              <div className="inventory-cell-stack">
                <strong>{row.imei1 || "Not set"}</strong>
                <span>Primary SIM identity</span>
              </div>
            )
          },
          {
            key: "imei2",
            label: "IMEI 2",
            render: (row) => (
              <div className="inventory-cell-stack">
                <strong>{row.imei2 || "Not set"}</strong>
                <span>{row.imei2 ? "Secondary SIM identity" : "Single-SIM / not captured"}</span>
              </div>
            )
          },
          {
            key: "lockerId",
            label: "Locker ID",
            render: (row) => (
              <div className="inventory-cell-stack">
                <strong>{row.lockerId || "Not linked"}</strong>
                <span>Last sync {formatHonorTimestamp(row.lockerLastSyncedAt)}</span>
              </div>
            )
          },
          {
            key: "lockerProvider",
            label: "Provider",
            render: (row) => (
              <div className="inventory-provider-cell">
                <span className={`provider-chip provider-${lockerProviderKey(row)}`}>{lockerProviderLabel(row)}</span>
                <StatusBadge status={normalizeHonorSyncStatus(row)} />
              </div>
            )
          }
        ]
      : [
          { key: "serialNumber", label: "Serial number" },
          { key: "chassisNumber", label: "Chassis number" }
        ]),
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "customer",
      label: "Assigned customer",
      render: (row) => findCustomer(customers, row.assignedCustomerId)?.name || "Unassigned"
    },
    {
      key: "agent",
      label: "Assigned agent",
      render: (row) => (
        <select
          value={row.assignedAgentId || ""}
          disabled={Boolean(row.assignedCustomerId) || row.status === "sold"}
          aria-label={`Assigned agent for ${row.serialNumber || row.imei1 || row.model}`}
          onChange={(event) => assignBike(row, event.target.value)}
        >
          <option value="">Unassigned</option>
          {agents.filter((agent) => agent.status === "active").map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name} ({agent.code})
            </option>
          ))}
        </select>
      )
    },
    { key: "createdAt", label: "Created" },
    {
      key: "delete",
      label: "Delete",
      render: (row) => (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="button secondary" onClick={() => startEditBike(row)}>
            Edit
          </button>
          <button type="button" className="button secondary" onClick={() => removeBike(row)}>
            Delete
          </button>
        </div>
      )
    }
  ];

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Inventory"
        title={scopeLabel}
        description={scopeDescription}
        actions={
          <button
            className="button primary"
            type="button"
            onClick={() => {
              if (showForm) {
                resetInventoryForm(scope === "all" ? formType : scope);
                setShowForm(false);
                return;
              }
              setShowForm(true);
            }}
          >
            {showForm ? "Close form" : "Add inventory"}
          </button>
        }
      />

      {message ? <div className="alert soft">{message}</div> : null}

      {scope === "phone" ? (
        <div className="panel">
          <div className="settings-card-header">
            <div>
              <p className="eyebrow">Phone lock status</p>
              <h3>Provider-aware phone locker overview</h3>
            </div>
            <span className="toolbar-count">
              <span>Phones</span>
              <strong>{phoneLockSummary.total}</strong>
            </span>
          </div>
          <div className="inventory-phone-grid">
            <InventorySummaryCard label="Locked now" value={phoneLockSummary.locked} tone="bad" />
            <InventorySummaryCard label="Unlocked" value={phoneLockSummary.unlocked} tone="good" />
            <InventorySummaryCard label="Pending sync" value={phoneLockSummary.pending} tone="average" />
            <InventorySummaryCard label="Failed sync" value={phoneLockSummary.failed} tone="bad" />
            <InventorySummaryCard label="Honor devices" value={phoneLockSummary.honor} tone="default" />
            <InventorySummaryCard label="Trustonic devices" value={phoneLockSummary.trustonic} tone="default" />
          </div>
          <div className="inventory-phone-list">
            <div className="inventory-phone-list-head">
              <span>Device</span>
              <span>Provider</span>
              <span>Request ref</span>
              <span>States</span>
              <span>Locker</span>
              <span>Updated</span>
              <span>Action</span>
            </div>
            {phoneHighlights.map((row) => (
              <div className="inventory-phone-row" key={row.id}>
                <div className="inventory-phone-main" data-label="Device">
                  <div className="inventory-phone-model">{row.model || "Unknown model"}</div>
                  <div className="inventory-phone-subtitle">{row.imei1 || "No IMEI"}</div>
                </div>
                <div className="inventory-phone-cell inventory-phone-provider-cell" data-label="Provider">
                  <span className={`provider-chip provider-${lockerProviderKey(row)}`}>{lockerProviderLabel(row)}</span>
                </div>
                <div className="inventory-phone-cell inventory-phone-code-cell" data-label="Request ref">
                  <span className="inventory-phone-cell-value inventory-phone-code">{row.providerRequestId || row.providerTaskId || row.honorTaskId || "Not queued"}</span>
                </div>
                <div className="inventory-phone-cell" data-label="States">
                  <div className="inventory-phone-status-row">
                    <StatusBadge status={normalizeHonorLockStatus(row)} />
                    <StatusBadge status={normalizeHonorSyncStatus(row)} />
                  </div>
                </div>
                <div className="inventory-phone-cell inventory-phone-code-cell" data-label="Locker">
                  <span className="inventory-phone-cell-value inventory-phone-code">{row.lockerId || "Not linked"}</span>
                </div>
                <div className="inventory-phone-cell" data-label="Updated">
                  <span className="inventory-phone-cell-value">{formatHonorTimestamp(row.lastLockRequestAt || row.lockerLastRequestAt)}</span>
                  <span className="inventory-phone-subtitle">Sync {formatHonorTimestamp(row.lockerLastSyncedAt)}</span>
                </div>
                <div className="inventory-phone-actions" data-label="Action">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="button secondary inventory-phone-action-button" onClick={() => startEditBike(row)}>
                      Edit
                    </button>
                    <button type="button" className="button secondary inventory-phone-action-button" onClick={() => refreshLock(row)}>
                      Refresh status
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="panel table-toolbar">
        {initialScope === "all" ? (
          <label>
            Inventory type
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="all">All inventory</option>
              <option value="phone">Phone inventory</option>
              <option value="bike">Bike inventory</option>
            </select>
          </label>
        ) : null}
        <div className="toolbar-count">
          <span>Visible</span>
          <strong>{visibleBikes.length}</strong>
        </div>
      </div>

      {showForm ? (
        <form className="panel inventory-form inventory-form-shell" onSubmit={handleSubmit}>
          <div className="inventory-form-hero">
            <div>
              <p className="eyebrow">Inventory record</p>
              <h3>{editingBike ? `Edit ${editingBike.model || editingBike.serialNumber || editingBike.imei1 || "inventory"}` : `Add ${scope === "all" ? "available inventory" : `${scope} inventory`}`}</h3>
              <p>
                {editingBike
                  ? "Correct the identifiers or price on the existing record, then save the update."
                  : "Phones and bikes are recorded in separate lanes so the form stays clean, readable, and safe from field mix-ups."}
              </p>
            </div>
            <div className={`inventory-form-pill ${formType === "phone" ? "is-phone" : "is-bike"}`}>
              {editingBike ? "Editing mode" : formType === "phone" ? "Phone locker lane" : "Bike asset lane"}
            </div>
          </div>

          <div className="inventory-form-grid">
            <section className="inventory-form-card">
              <div className="inventory-form-card-head">
                <div>
                  <p className="eyebrow">Core details</p>
                  <h4>Common information</h4>
                </div>
              </div>
              <div className="settings-form">
                {initialScope === "all" ? (
                  <label>
                    Product type
                    <select
                      value={formType}
                      onChange={(event) => {
                        const nextType = event.target.value;
                        setScope("all");
                        setForm((current) => ({
                          ...createEmptyInventoryForm(nextType),
                          model: current.model,
                          assignedAgentId: current.assignedAgentId,
                          totalPayable: current.totalPayable
                        }));
                      }}
                    >
                      <option value="bike">Bike</option>
                      <option value="phone">Phone</option>
                    </select>
                  </label>
                ) : null}
                <label>
                  Assign to agent
                  <select
                    value={form.assignedAgentId}
                    disabled={Boolean(editingBike)}
                    onChange={(event) => setForm({ ...form, assignedAgentId: event.target.value })}
                  >
                    <option value="">Unassigned stock</option>
                    {agents.filter((agent) => agent.status === "active").map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} ({agent.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Product model
                  <input
                    required
                    value={form.model}
                    onChange={(event) => setForm({ ...form, model: event.target.value })}
                    placeholder={formType === "phone" ? "Samsung A35" : "TVS HLX 150"}
                  />
                </label>
                <label>
                  Total payable
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={form.totalPayable}
                    onChange={(event) => setForm({ ...form, totalPayable: event.target.value })}
                    placeholder="15000"
                  />
                </label>
              </div>
            </section>

            {formType !== "phone" ? (
              <section className="inventory-form-card">
                <div className="inventory-form-card-head">
                  <div>
                    <p className="eyebrow">Media</p>
                    <h4>Bike presentation</h4>
                  </div>
                </div>
                <div className="settings-form">
                  <label>
                    Image URL
                    <input
                      value={form.imageUrl}
                      onChange={(event) => setForm({ ...form, imageUrl: event.target.value })}
                      placeholder="https://..."
                    />
                  </label>
                  <label>
                    Capture image
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageCapture}
                    />
                  </label>
                </div>
                {form.imageUrl ? (
                  <div className="inventory-image-preview">
                    <span>Image preview</span>
                    <div className="inventory-image-frame">
                      <img src={form.imageUrl} alt="Product preview" />
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {formType === "phone" ? (
              <section className="inventory-form-card">
                <div className="inventory-form-card-head">
                  <div>
                    <p className="eyebrow">Locker details</p>
                    <h4>Phone identifiers</h4>
                  </div>
                </div>
                <div className="settings-form">
                  <label>
                    IMEI 1
                    <input
                      required
                      inputMode="numeric"
                      value={form.imei1}
                      onChange={(event) => setForm({ ...form, imei1: event.target.value })}
                      placeholder="356789123456789"
                    />
                  </label>
                  <label>
                    IMEI 2
                    <input
                      inputMode="numeric"
                      value={form.imei2}
                      onChange={(event) => setForm({ ...form, imei2: event.target.value })}
                      placeholder="356789123456780"
                    />
                  </label>
                  <label>
                    Locker ID
                    <input
                      value={form.lockerId}
                      onChange={(event) => setForm({ ...form, lockerId: event.target.value })}
                      placeholder="LCK-001"
                    />
                  </label>
                  <label>
                    Locker provider
                    <select
                      value={form.lockerProvider}
                      onChange={(event) => setForm({ ...form, lockerProvider: event.target.value })}
                    >
                      <option value="honor">Honor</option>
                      <option value="trustonic">Trustonic</option>
                    </select>
                  </label>
                </div>
              </section>
            ) : (
              <section className="inventory-form-card">
                <div className="inventory-form-card-head">
                  <div>
                    <p className="eyebrow">Vehicle details</p>
                    <h4>Bike identity</h4>
                  </div>
                </div>
                <div className="settings-form">
                  <label>
                    Serial number
                    <input
                      required
                      value={form.serialNumber}
                      onChange={(event) => setForm({ ...form, serialNumber: event.target.value })}
                      placeholder="TVS-HLX-2026-010"
                    />
                  </label>
                  <label>
                    Chassis number
                    <input
                      value={form.chassisNumber}
                      onChange={(event) => setForm({ ...form, chassisNumber: event.target.value })}
                      placeholder="MD625MF54P1A90841"
                    />
                  </label>
                </div>
              </section>
            )}
          </div>

          <div className="page-actions">
            <button className="button primary" type="submit">{editingBike ? "Update inventory" : "Save inventory"}</button>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                resetInventoryForm(scope === "all" ? formType : scope);
                setShowForm(false);
              }}
            >
              {editingBike ? "Cancel edit" : "Cancel"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="panel table-toolbar">
        <label>
          Search inventory
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={scope === "phone" ? "Search model, IMEI, locker, provider..." : "Search model, serial, chassis..."}
          />
        </label>
        <label>
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            <option value="assigned">Assigned</option>
            <option value="repossessed">Repossessed</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <div className="toolbar-count">
          <span>Visible</span>
          <strong>{visibleBikes.length}</strong>
        </div>
      </div>

      <DataTable columns={columns} rows={visibleBikes} emptyMessage="No inventory records match this view." />
    </section>
  );
}

function InventorySummaryCard({ label, value, tone = "default" }) {
  return (
    <div className={`repayment-summary-card repayment-summary-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>Live phone inventory view</small>
    </div>
  );
}
