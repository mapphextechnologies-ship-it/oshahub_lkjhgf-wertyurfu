import { formatKes } from "../formatting/currency.js";

function yesNo(value) {
  return value ? "Yes" : "No";
}

function statusLabel(value) {
  return String(value || "").replaceAll("_", " ");
}

function findById(items, id) {
  return items.find((item) => item.id === id);
}

export function buildApplicationRows({ agents, applications, bikes, customers }) {
  return applications.map((application) => {
    const customer = findById(customers, application.customerId);
    const agent = findById(agents, application.agentId);
    const bike = findById(bikes, application.bikeId);

    return {
      "Application ID": application.id,
      "Customer Name": customer?.name || "",
      "National ID": customer?.nationalId || "",
      "Customer Phone": customer?.phone || "",
      "Agent Name": agent?.name || "",
      "Agent Code": agent?.code || "",
      "Bike Model": bike?.model || "Not assigned",
      "Bike Serial": bike?.serialNumber || "Not assigned",
      "Deposit Amount": application.depositAmount,
      "Installment Plan": application.installmentPlan,
      "Application Status": statusLabel(application.status),
      "Submitted At": application.submittedAt,
      "Reviewed At": application.reviewedAt || "",
      "Reviewed By": application.reviewedBy || "",
      "Customer OTP Verified": yesNo(application.customerOtpVerified),
      "Next Of Kin Name": application.nextOfKin?.name || "",
      "Next Of Kin Phone": application.nextOfKin?.phone || "",
      "Next Of Kin Relationship": application.nextOfKin?.relationship || "",
      "Next Of Kin OTP Verified": yesNo(application.nextOfKinOtpVerified),
      "Duplicate National ID": yesNo(application.duplicateNationalId),
      "Document Summary": application.documents
        .map((document) => `${document.type}: ${document.status}`)
        .join("; "),
      "Screening Notes": application.screeningNotes || "",
      "Rejection Reason": application.rejectionReason || "",
      "Info Required Message": application.infoRequiredMessage || ""
    };
  });
}

export function buildCustomerRows({ agents, bikes, customers }) {
  return customers.map((customer) => {
    const agent = findById(agents, customer.agentId);
    const bike = bikes.find((item) => item.assignedCustomerId === customer.id);

    return {
      "Customer Name": customer.name,
      "National ID": customer.nationalId,
      Phone: customer.phone,
      "Date Of Birth": customer.dateOfBirth,
      Gender: customer.gender,
      Location: customer.location,
      Occupation: customer.occupation,
      "Agent Name": agent?.name || "",
      "Agent Code": agent?.code || "",
      "Bike Model": bike?.model || "Not assigned",
      "Bike Serial": bike?.serialNumber || "Not assigned",
      "Application Status": statusLabel(customer.applicationStatus),
      "Repayment Status": customer.repaymentStatus,
      Balance: customer.balance,
      "Formatted Balance": formatKes(customer.balance),
      "Created At": customer.createdAt
    };
  });
}

export function buildUserRows(users) {
  return users.map((user) => ({
    Name: user.name,
    Email: user.email,
    Phone: user.phone,
    Role: statusLabel(user.role),
    Status: statusLabel(user.status)
  }));
}

export function buildAgentRows(agents) {
  return agents.map((agent) => ({
    "Agent Code": agent.code,
    Name: agent.name,
    Role: statusLabel(agent.role || "field_agent"),
    "National ID": agent.nationalId || "",
    Phone: agent.phone,
    Email: agent.email,
    Region: agent.region,
    Status: statusLabel(agent.status),
    "Total Customers": agent.totalCustomers,
    "Commission Balance": agent.commissionBalance,
    "Formatted Commission Balance": formatKes(agent.commissionBalance)
  }));
}

export function buildBikeRows({ agents, bikes, customers }) {
  return bikes.map((bike) => {
    const customer = findById(customers, bike.assignedCustomerId);
    const agent = findById(agents, bike.assignedAgentId);

    return {
      "Product Type": bike.productType || "product",
      Model: bike.model,
      "Serial Number": bike.serialNumber,
      "Chassis Number": bike.chassisNumber,
      "IMEI 1": bike.imei1 || "",
      "IMEI 2": bike.imei2 || "",
      "Locker ID": bike.lockerId || "",
      Branch: bike.branch || "",
      Status: statusLabel(bike.status),
      "Assigned Customer": customer?.name || "Unassigned",
      "Assigned Customer Phone": customer?.phone || "",
      "Assigned Agent": agent?.name || "Unassigned",
      "Created At": bike.createdAt
    };
  });
}

export function buildPaymentRows({ agents, customers, payments }) {
  return payments.map((payment) => {
    const customer = findById(customers, payment.customerId);
    const agent = findById(agents, payment.agentId);

    return {
      "Payment ID": payment.id,
      "Product Type": payment.productType || "bike",
      "Product Model": payment.productModel || "",
      "Chassis Number": payment.chassisNumber || "",
      "Customer Name": customer?.name || "",
      "Customer Phone": customer?.phone || "",
      "Agent Name": agent?.name || "",
      Amount: payment.amount,
      Balance: payment.balance ?? 0,
      "Formatted Amount": formatKes(payment.amount),
      Receipt: payment.receipt,
      Status: statusLabel(payment.status),
      "Reconciliation Status": statusLabel(payment.reconciliationStatus),
      "Paid At": payment.paidAt
    };
  });
}

export function buildFinanceSplitRows({ payments }) {
  const grouped = payments.reduce((accumulator, payment) => {
    const key = String(payment.productType || "bike").toLowerCase();
    const bucket = accumulator[key] || {
      "Product Type": key,
      "Payment Count": 0,
      "Collected Amount": 0,
      "Pending Amount": 0,
      "Reconciliation Flags": 0
    };

    bucket["Payment Count"] += 1;
    if (payment.status === "success") {
      bucket["Collected Amount"] += Number(payment.amount || 0);
    } else {
      bucket["Pending Amount"] += Number(payment.amount || 0);
    }
    if (["unmatched", "manual_review"].includes(payment.reconciliationStatus)) {
      bucket["Reconciliation Flags"] += 1;
    }

    accumulator[key] = bucket;
    return accumulator;
  }, {});

  return Object.values(grouped).map((row) => ({
    ...row,
    "Collected Amount": formatKes(row["Collected Amount"]),
    "Pending Amount": formatKes(row["Pending Amount"])
  }));
}

export function buildNotificationRows(notifications) {
  return notifications.map((notification) => ({
    Title: notification.title,
    Message: notification.message,
    Channel: statusLabel(notification.channel),
    Status: statusLabel(notification.status),
    "Created At": notification.createdAt
  }));
}

export function buildAuditRows(auditLogs) {
  return auditLogs.map((log) => ({
    "Created At": log.createdAt,
    Actor: log.actor,
    Role: statusLabel(log.role),
    Action: log.action,
    "Entity Type": log.entityType,
    "Entity ID": log.entityId
  }));
}
