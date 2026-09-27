import { formatKes } from "./currency.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toTimestamp(value) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function toText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normalizeName(payment = {}, customer = null) {
  return (
    customer?.customerName ||
    customer?.name ||
    payment.customerName ||
    payment.customer_name ||
    "Unknown customer"
  );
}

function normalizePhone(payment = {}, customer = null) {
  return customer?.customerPhone || customer?.phone || payment.customerPhone || payment.customer_phone || "";
}

function normalizeAgentName(payment = {}, customer = null) {
  return customer?.agentName || payment.agentName || payment.agent_name || "Unassigned";
}

function normalizeAgentCode(payment = {}, customer = null) {
  return customer?.agentId || payment.agentId || payment.agentCode || payment.agent_code || "";
}

function buildCustomerKey(payment = {}, customer = null) {
  const customerId = toText(payment.customerId || payment.customer_id || customer?.id || "").trim();
  if (customerId) return customerId;

  const name = normalizeName(payment, customer).trim().toLowerCase();
  const phone = normalizePhone(payment, customer).trim().toLowerCase();
  return `${name}::${phone}`;
}

export function getRepaymentHealth(record = {}, customer = null) {
  const overdueDays = Math.max(
    0,
    toNumber(customer?.overdueDays ?? customer?.overdue_days ?? record.overdueDays ?? record.overdue_days, 0)
  );
  const dailyAmount = Math.max(
    0,
    toNumber(
      customer?.dailyInstallment ??
        customer?.daily_installment ??
        record.dailyInstallment ??
        record.daily_installment ??
        record.dailyTarget ??
        record.daily_target,
      0
    )
  );
  const balance = Math.max(0, toNumber(customer?.balance ?? record.balance, 0));
  const overdueAmountValue = customer?.overdueAmount ??
    customer?.overdue_amount ??
    record.overdueAmount ??
    record.overdue_amount;
  const hasExplicitOverdueAmount = overdueAmountValue !== undefined
    && overdueAmountValue !== null
    && overdueAmountValue !== "";
  const overdueAmount = Math.max(
    0,
    toNumber(overdueAmountValue, overdueDays * dailyAmount)
  );
  const hasOverdueDebt = overdueAmount > 0 || (!hasExplicitOverdueAmount && overdueDays > 0);
  const paygoState = toText(record.paygoState ?? record.paygo_state ?? customer?.paygoScheduleStatus ?? "", "")
    .trim()
    .toLowerCase();
  const paymentStatus = toText(record.status, "").trim().toLowerCase();
  const accountStatus = toText(
    customer?.repaymentStatus ??
      customer?.repayment_status ??
      record.repaymentStatus ??
      record.repayment_status ??
      record.customerStatus ??
      record.customer_status,
    ""
  ).trim().toLowerCase();

  if (hasOverdueDebt || accountStatus === "defaulted" || paygoState === "defaulted" || paymentStatus === "failed") {
    return {
      key: "bad",
      label: "Red",
      badgeStatus: "bad",
      sortOrder: 0,
      isRedFlag: true,
      overdueDays,
      overdueAmount,
      dailyAmount,
      balance,
      note: overdueAmount > 0
        ? `${formatKes(overdueAmount)} overdue`
        : overdueDays > 0
          ? `${overdueDays} ${overdueDays === 1 ? "day" : "days"} overdue`
          : "Account is in a default state"
    };
  }

  if (
    ["follow_up", "pending", "warning", "locked"].includes(paygoState) ||
    paymentStatus === "unpaid"
  ) {
    return {
      key: "average",
      label: "Amber",
      badgeStatus: "average",
      sortOrder: 1,
      isRedFlag: false,
      overdueDays,
      overdueAmount,
      dailyAmount,
      balance,
      note: paygoState === "locked"
          ? "PAYGO is locked; verify the current due date"
          : "Needs follow-up before turning red"
    };
  }

  return {
    key: "good",
    label: "Green",
    badgeStatus: "good",
    sortOrder: 2,
    isRedFlag: false,
    overdueDays,
    overdueAmount,
    dailyAmount,
    balance,
    note: "Paying on schedule"
  };
}

export function buildRepaymentHealthRows(payments = [], options = {}) {
  const latestByCustomer = new Map();
  const resolveCustomer =
    typeof options.resolveCustomer === "function" ? options.resolveCustomer : () => null;

  payments.forEach((payment) => {
    const customer = resolveCustomer(payment) || payment.customer || null;
    const key = buildCustomerKey(payment, customer);
    const current = latestByCustomer.get(key);
    const nextTimestamp = Math.max(
      toTimestamp(payment.paidAt),
      toTimestamp(payment.date),
      toTimestamp(customer?.lastPaymentDate),
      toTimestamp(customer?.updatedAt)
    );
    const currentTimestamp = current?.sortTimestamp ?? 0;

    if (!current || nextTimestamp >= currentTimestamp) {
      latestByCustomer.set(key, {
        payment,
        customer,
        sortTimestamp: nextTimestamp
      });
    }
  });

  return [...latestByCustomer.values()]
    .map(({ payment, customer, sortTimestamp }, index) => {
      const health = getRepaymentHealth(payment, customer);
      const customerId = toText(payment.customerId || payment.customer_id || customer?.id || "").trim();
      const id = customerId || payment.id || `repayment-health-${index}`;

      return {
        id,
        customerId,
        customerName: normalizeName(payment, customer),
        customerPhone: normalizePhone(payment, customer),
        agentName: normalizeAgentName(payment, customer),
        agentCode: normalizeAgentCode(payment, customer),
        balance: health.balance,
        overdueAmount: health.overdueAmount,
        dailyAmount: health.dailyAmount,
        overdueDays: health.overdueDays,
        healthKey: health.key,
        healthLabel: health.label,
        healthStatus: health.badgeStatus,
        healthNote: health.note,
        isRedFlag: health.isRedFlag,
        lastPaymentAt: payment.paidAt || payment.date || customer?.lastPaymentDate || "",
        paygoState: toText(payment.paygoState ?? customer?.paygoScheduleStatus ?? "", ""),
        payment,
        customer,
        sortTimestamp,
        sortOrder: health.sortOrder
      };
    })
    .sort((first, second) => {
      if (first.sortOrder !== second.sortOrder) {
        return first.sortOrder - second.sortOrder;
      }

      if (first.overdueDays !== second.overdueDays) {
        return second.overdueDays - first.overdueDays;
      }

      if (first.balance !== second.balance) {
        return second.balance - first.balance;
      }

      return first.customerName.localeCompare(second.customerName);
    });
}

export function buildRepaymentHealthNotifications(payments = [], options = {}) {
  return buildRepaymentHealthRows(payments, options)
    .filter((row) => row.healthKey !== "good")
    .map((row) => ({
      id: `repayment-health-${row.customerId || row.customerName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      type: "repayment_health",
      title:
        row.healthKey === "bad"
          ? `${row.customerName} is red flagged`
          : `${row.customerName} needs repayment follow-up`,
      message:
        row.healthKey === "bad"
          ? row.overdueAmount > 0
            ? `${row.customerName} has overdue debt of ${formatKes(row.overdueAmount)} and should remain red until it is cleared.`
            : `${row.customerName} is in default and should be treated as high risk.`
          : `${row.customerName} is slightly behind the daily plan and should be watched closely.`,
      issue: `${row.healthLabel} account. Overdue ${formatKes(row.overdueAmount)}. Daily amount ${formatKes(row.dailyAmount)}. Balance ${formatKes(row.balance)}.`,
      followUp:
        row.healthKey === "bad"
          ? "Call the customer now and confirm the next payment action before more days are missed."
          : "Monitor the next payment and follow up before the account reaches 2 days overdue.",
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      agentName: row.agentName,
      agentCode: row.agentCode,
      dailyAmount: formatKes(row.dailyAmount),
      overdueAmount: formatKes(row.overdueAmount),
      balance: formatKes(row.balance),
      overdueDays: row.overdueDays,
      repaymentHealth: row.healthLabel,
      sourcePortal: "Repayment watch",
      createdAt: row.lastPaymentAt || new Date().toISOString(),
      isRead: false
    }));
}
