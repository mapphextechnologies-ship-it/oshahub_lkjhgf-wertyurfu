import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { StatCard } from "../../components/ui/StatCard.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { useAdminData } from "../../features/admin/AdminDataContext.jsx";
import { findAgent } from "../../lib/admin/lookups.js";
import { formatKes } from "../../lib/formatting/currency.js";
import { Bike, UserRoundCheck, Users, WalletCards } from "lucide-react";

export default function Customers({ initialScope = "all" } = {}) {
  const { agents, bikes, customers, deleteCustomer } = useAdminData();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scope, setScope] = useState(initialScope);
  const approvedCustomers = customers.filter((customer) => customer.applicationStatus === "approved").length;
  const totalBalance = customers
    .filter((customer) => customer.applicationStatus !== "rejected" && customer.repaymentStatus !== "rejected")
    .reduce((sum, customer) => sum + customer.balance, 0);
  const assignedBikes = bikes.filter((bike) => bike.assignedCustomerId).length;
  const phoneCustomers = customers.filter((customer) => String(customer.productType || "").toLowerCase() === "phone").length;
  const bikeCustomers = customers.filter((customer) => String(customer.productType || "").toLowerCase() === "bike").length;

  function productForCustomer(customer) {
    const assignedProduct = bikes.find((bike) => bike.assignedCustomerId === customer.id);
    const productType = String(customer.productType || assignedProduct?.productType || "").toLowerCase() || "bike";
    return {
      productType,
      model: assignedProduct?.model || customer.productModel || "Unassigned"
    };
  }

  const columns = [
    { key: "name", label: "Customer" },
    { key: "nationalId", label: "National ID" },
    { key: "phone", label: "Phone" },
    { key: "location", label: "Location" },
    { key: "agent", label: "Agent", render: (row) => findAgent(agents, row.agentId)?.name },
    {
      key: "product",
      label: "Product",
      render: (row) => {
        const product = productForCustomer(row);
        return `${product.productType} | ${product.model}`;
      }
    },
    {
      key: "accountStatus",
      label: "Account",
      render: (row) => <StatusBadge status={row.applicationStatus} />
    },
    { key: "repaymentStatus", label: "Repayment" },
    { key: "balance", label: "Balance", render: (row) => row.applicationStatus === "rejected" || row.repaymentStatus === "rejected" ? "Not captured" : formatKes(row.balance) },
    {
      key: "open",
      label: "Open",
      render: (row) => (
        <div className="table-actions">
          <Link to={`/admin/customers/${row.id}`}>View</Link>
          <button type="button" onClick={() => removeCustomer(row)}>Delete</button>
        </div>
      )
    }
  ];
  const visibleCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return customers.filter((customer) => {
      const agent = findAgent(agents, customer.agentId);
      const product = productForCustomer(customer);
      const customerType = String(customer.productType || product.productType || "").toLowerCase();
      const searchable = [customer.name, customer.nationalId, customer.phone, customer.location, customer.applicationStatus, customer.repaymentStatus, customerType, product.model, agent?.name]
        .join(" ")
        .toLowerCase();
      const matchesStatus = statusFilter === "all" || customer.applicationStatus === statusFilter;
      const matchesScope = scope === "all" || customerType === scope;
      return matchesStatus && matchesScope && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [agents, bikes, customers, query, scope, statusFilter]);

  async function removeCustomer(customer) {
    if (!window.confirm(`Delete ${customer.name}? This removes the customer record and disconnects assigned stock.`)) {
      return;
    }

    try {
      await deleteCustomer(customer.id);
    } catch (error) {
      window.alert(error.message || "Could not delete customer.");
    }
  }

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Customer accounts"
        title={scope === "phone" ? "Phone customers" : scope === "bike" ? "Bike customers" : "Customer records"}
        description="Review the assigned agent, account status, and balances."
      />

      <div className="stat-grid compact">
        <StatCard icon={Users} label="Total customers" value={customers.length} detail="All customer records" />
        <StatCard icon={UserRoundCheck} label="Approved accounts" value={approvedCustomers} detail="Activated or ready" />
        <StatCard icon={Bike} label="Phone customers" value={phoneCustomers} detail="Phone-linked accounts" />
        <StatCard icon={Bike} label="Bike customers" value={bikeCustomers} detail="Bike-linked accounts" />
        <StatCard icon={Bike} label="Assigned bikes" value={assignedBikes} detail="Linked customer bikes" />
        <StatCard icon={WalletCards} label="Customer balances" value={formatKes(totalBalance)} detail="Total outstanding" />
      </div>

      <div className="panel table-toolbar">
        {initialScope === "all" ? (
          <label>
            Customer type
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="all">All customers</option>
              <option value="phone">Phone customers</option>
              <option value="bike">Bike customers</option>
            </select>
          </label>
        ) : null}
        <label>
          Search customers
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, ID, phone, agent..." />
        </label>
        <label>
          Application status
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
          <strong>{visibleCustomers.length}</strong>
        </div>
      </div>

      <DataTable columns={columns} rows={visibleCustomers} emptyMessage="No customers match this view." />
    </section>
  );
}
