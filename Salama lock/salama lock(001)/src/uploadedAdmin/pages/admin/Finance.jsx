import { useMemo, useState } from "react";
import { DataTable } from "../../components/ui/DataTable.jsx";
import { PageHeader } from "../../components/ui/PageHeader.jsx";
import { StatCard } from "../../components/ui/StatCard.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { useAdminData } from "../../features/admin/AdminDataContext.jsx";
import { findAgent, findCustomer } from "../../lib/admin/lookups.js";
import { formatKes } from "../../lib/formatting/currency.js";
import { AlertTriangle, BadgeDollarSign, ReceiptText, WalletCards } from "lucide-react";
import { matchesProductScope, normalizeProductScope } from "../../../utils/productScope.js";
import { buildRepaymentHealthRows, getRepaymentHealth } from "../../../utils/repaymentHealth.js";

export default function Finance() {
  const { agents, customers, payments = [], deletePayment, sendFinanceFollowUp, verifyPayment } = useAdminData();
  const [scope, setScope] = useState("all");
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const normalizedScope = normalizeProductScope(scope);
  const scopedPayments = useMemo(
    () => payments.filter((payment) => matchesProductScope(payment.productType, normalizedScope)),
    [normalizedScope, payments]
  );
  const scopedPaymentRows = useMemo(
    () => scopedPayments.map((payment) => ({
      id: payment.id,
      ...payment,
      payment,
      customer: findCustomer(customers, payment.customerId)
    })),
    [customers, scopedPayments]
  );
  const repaymentRows = useMemo(
    () => buildRepaymentHealthRows(scopedPayments, { resolveCustomer: (payment) => findCustomer(customers, payment.customerId) }),
    [customers, scopedPayments]
  );
  const flaggedRows = useMemo(() => repaymentRows.filter((row) => row.isRedFlag), [repaymentRows]);
  const repaymentSummary = useMemo(
    () =>
      repaymentRows.reduce(
        (summary, row) => {
          summary[row.healthKey] += 1;
          return summary;
        },
        { good: 0, average: 0, bad: 0 }
      ),
    [repaymentRows]
  );
  const totalCollected = scopedPayments
    .filter((payment) => payment.status === "success")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const phoneCollected = payments
    .filter((payment) => matchesProductScope(payment.productType, "phone") && payment.status === "success")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const bikeCollected = payments
    .filter((payment) => matchesProductScope(payment.productType, "bike") && payment.status === "success")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const pendingPayments = scopedPayments.filter((payment) => payment.status === "pending").length;
  const reconciliationFlags = scopedPayments.filter((payment) =>
    ["unmatched", "manual_review"].includes(payment.reconciliationStatus)
  ).length;
  const commissionBalance = agents.reduce((sum, agent) => sum + agent.commissionBalance, 0);

  async function followUpPayments(paymentRows) {
    const customerIds = [...new Set(paymentRows.map(({ customer }) => customer?.id).filter(Boolean))];
    const paymentIds = paymentRows.map(({ payment }) => payment.id).filter(Boolean);

    if (customerIds.length === 0) {
      window.alert("No overdue customers were found for follow-up.");
      return;
    }

    setSendingFollowUp(true);
    try {
      await sendFinanceFollowUp(customerIds, { paymentIds });
    } catch (error) {
      window.alert(error.message || "Could not send follow-up.");
    } finally {
      setSendingFollowUp(false);
    }
  }

  async function markVerified(payment) {
    try {
      await verifyPayment(payment.id, {
        verifiedAt: new Date().toISOString(),
        verifiedBy: "finance_admin"
      });
    } catch (error) {
      window.alert(error.message || "Could not verify payment.");
    }
  }

  async function removePayment(payment) {
    if (!window.confirm(`Delete payment ${payment.receipt || payment.id}?`)) {
      return;
    }

    try {
      await deletePayment(payment.id);
    } catch (error) {
      window.alert(error.message || "Could not delete payment.");
    }
  }

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow="Finance management"
        title="Collections and reconciliation"
        description="Monitor payment records, reconciliation state, and agent commission exposure."
      />

      <div className="filter-row">
        {["all", "bike", "phone"].map((value) => (
          <button
            key={value}
            type="button"
            className={`button secondary ${scope === value ? "active" : ""}`}
            onClick={() => setScope(value)}
          >
            {value === "all" ? "All" : value === "bike" ? "Bikes" : "Phones"}
          </button>
        ))}
        <button
          type="button"
          className="button"
          onClick={() => followUpPayments(flaggedRows)}
          disabled={sendingFollowUp || flaggedRows.length === 0}
        >
          {sendingFollowUp ? "Sending follow-up..." : `Follow up red flags (${flaggedRows.length})`}
        </button>
      </div>

      <div className="finance-grid">
        <StatCard icon={WalletCards} label="Total collected" value={formatKes(totalCollected)} detail="Successful payments" />
        <StatCard icon={WalletCards} label="Phone collections" value={formatKes(phoneCollected)} detail="Phone-only receipts" />
        <StatCard icon={WalletCards} label="Bike collections" value={formatKes(bikeCollected)} detail="Bike-only receipts" />
        <StatCard icon={ReceiptText} label="Pending payments" value={pendingPayments} detail="Awaiting completion" />
        <StatCard icon={AlertTriangle} label="Reconciliation flags" value={reconciliationFlags} detail="Unmatched/manual review" />
        <StatCard icon={BadgeDollarSign} label="Commission balance" value={formatKes(commissionBalance)} detail="Unpaid agent commissions" />
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Repayment watch</p>
            <h3>Green, amber, and red payment health by customer</h3>
          </div>
          <StatusBadge status={flaggedRows.length > 0 ? "urgent" : "clear"} />
        </div>
        <div className="repayment-summary-grid">
          <div className="repayment-summary-card repayment-summary-good">
            <span>Green</span>
            <strong>{repaymentSummary.good}</strong>
            <small>On schedule</small>
          </div>
          <div className="repayment-summary-card repayment-summary-average">
            <span>Amber</span>
            <strong>{repaymentSummary.average}</strong>
            <small>Needs follow-up</small>
          </div>
          <div className="repayment-summary-card repayment-summary-bad">
            <span>Red</span>
            <strong>{repaymentSummary.bad}</strong>
            <small>2+ days overdue</small>
          </div>
        </div>
        <div className="risk-grid">
          {repaymentRows.slice(0, 6).map((row) => {
            const agentName = row.agentName || findAgent(agents, row.agentCode)?.name || "Unassigned";

            return (
              <div key={row.id} className={`risk-item risk-${row.healthKey}`}>
                <AlertTriangle size={18} />
                <div>
                  <strong>{row.customerName}</strong>
                  <span>
                    {agentName} | Daily {formatKes(row.dailyAmount)} | Balance {formatKes(row.balance)}
                  </span>
                  <span>{row.healthNote}</span>
                </div>
                <b>{row.overdueDays}</b>
              </div>
            );
          })}
          {repaymentRows.length === 0 && (
            <div className="risk-item" style={{ gridColumn: "1 / -1" }}>
              <AlertTriangle size={18} />
              <div>
                <strong>No repayment accounts</strong>
                <span>Visible customers will appear here once payments are available.</span>
              </div>
              <b>0</b>
            </div>
          )}
        </div>
      </section>

      <DataTable
        columns={[
          { key: "receipt", label: "Receipt" },
          { key: "productType", label: "Type", render: (row) => row.productType || "bike" },
          { key: "productModel", label: "Product" },
          {
            key: "customer",
            label: "Customer",
            render: (row) => row.customer?.name || row.customer?.customerName || "Unknown customer"
          },
          {
            key: "dailyInstallment",
            label: "Daily installment",
            render: (row) => formatKes(Number(row.customer?.dailyInstallment || row.payment.dailyTarget || 0))
          },
          {
            key: "overdueDays",
            label: "Overdue",
            render: (row) => Number(row.customer?.overdueDays || row.payment.overdueDays || 0)
          },
          {
            key: "agent",
            label: "Agent",
            render: (row) => row.customer?.agentName || findAgent(agents, row.payment.agentId)?.name || "Unassigned"
          },
          { key: "amount", label: "Amount", render: (row) => formatKes(row.amount) },
          { key: "status", label: "Payment", render: (row) => <StatusBadge status={row.status} /> },
          {
            key: "risk",
            label: "Health",
            render: (row) => {
              const health = getRepaymentHealth(row.payment, row.customer);
              return <StatusBadge status={health.badgeStatus} />;
            }
          },
          {
            key: "reconciliationStatus",
            label: "Reconciliation",
            render: (row) => <StatusBadge status={row.reconciliationStatus} />
          },
          { key: "paidAt", label: "Date" },
          {
            key: "actions",
            label: "Actions",
            render: (row) => (
              <div className="table-actions">
                <button
                  type="button"
                  onClick={() => followUpPayments([{ payment: row, customer: row.customer }])}
                  disabled={sendingFollowUp || !row.customer}
                >
                  Follow up
                </button>
                <button type="button" onClick={() => markVerified(row)}>
                  Verify
                </button>
                <button type="button" onClick={() => removePayment(row)}>
                  Delete
                </button>
              </div>
            )
          }
        ]}
        rows={scopedPaymentRows}
      />
    </section>
  );
}
