/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { adminApiRequest as apiRequest } from "../../../services/adminApiClient.js";
import { normalizeAgentRecord, normalizeCustomerRecord, normalizePaymentRecord, normalizeProductRecord } from "../../../services/recordNormalization.js";
import { useAuth } from "../auth/AuthContext.jsx";

const AdminDataContext = createContext(null);

const defaultState = {
  agents: [],
  applications: [],
  archivedAuditLogs: [],
  auditLogs: [],
  bikes: [],
  customers: [],
  notifications: [],
  smsDeliveryReports: [],
  payments: [],
  users: []
};

function uploadedAgentStatus(status) {
  if (status === "pending") return "pending_approval";
  if (status === "inactive") return "deactivated";
  return status || "active";
}

function backendAgentStatus(status) {
  if (status === "pending_approval") return "pending";
  if (status === "deactivated") return "inactive";
  return status || "active";
}

function isoDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString().slice(0, 10);
}

function backOfficeStatusForCustomer(customer = {}) {
  const applicationStatus = String(customer.applicationStatus || "").toLowerCase();
  const repaymentStatus = String(customer.repaymentStatus || "").toLowerCase();

  if (["next_of_kin_pending", "pending_screening", "info_required", "approved", "rejected"].includes(applicationStatus)) {
    return applicationStatus;
  }

  if (["next_of_kin_pending", "pending_screening", "rejected"].includes(repaymentStatus)) {
    return repaymentStatus;
  }

  if (["active", "paid", "defaulted"].includes(repaymentStatus) || applicationStatus === "active") {
    return "approved";
  }

  return "pending_screening";
}

function fallbackApplicationForCustomer(customer = {}) {
  return {
    id: `CASE-${customer.id}`,
    customerId: customer.id,
    agentId: customer.agentId || "",
    bikeId: "",
    depositAmount: 0,
    installmentPlan: "Daily repayment",
    submittedAt: customer.createdAt || "",
    reviewedAt: "",
    reviewedBy: "",
    customerOtpVerified: backOfficeStatusForCustomer(customer) === "approved",
    nextOfKinOtpVerified: backOfficeStatusForCustomer(customer) === "approved",
    nextOfKin: customer.nextOfKin || {
      name: "",
      phone: "",
      relationship: "",
      nationalId: "",
      gender: "",
      location: "",
      occupation: ""
    },
    status: backOfficeStatusForCustomer(customer),
    screeningNotes: "",
    rejectionReason: "",
    infoRequiredMessage: "",
    duplicateNationalId: false,
    documents: [],
    verification: {}
  };
}

function mapPortal(portal = {}) {
  const agents = (portal.agents || []).map((agent) => {
    const normalized = normalizeAgentRecord(agent);
    return {
      ...normalized,
      status: uploadedAgentStatus(normalized.status)
    };
  });

  const customers = (portal.customers || []).map((customer) => {
    const normalized = normalizeCustomerRecord(customer);
    return {
      ...normalized,
      name: normalized.customerName,
      phone: normalized.customerPhone
    };
  });

  const bikes = (portal.products || []).map((product) => {
    const normalized = normalizeProductRecord(product);
    return {
      ...normalized,
      model: normalized.productModel,
      imageUrl: normalized.imageUrl || "",
      lockerSyncPayload: product.lockerSyncPayload || {}
    };
  });

  const mappedApplications = (portal.applications || []).map((application) => {
    const customer = customers.find((item) => item.id === application.customerId);
    return {
      id: application.id,
      customerId: application.customerId,
      agentId: application.agentId || "",
      bikeId: application.bikeId || "",
      productType: application.productType || customer?.productType || "product",
      productModel: application.productModel || customer?.productModel || "",
      stream: application.stream || customer?.stream || "",
      depositAmount: Number(application.depositAmount || 0),
      installmentPlan: application.installmentPlan || "Daily repayment",
      submittedAt: application.submittedAt || application.createdAt || "",
      reviewedAt: application.reviewedAt || "",
      reviewedBy: application.reviewedBy || "",
      customerOtpVerified: Boolean(application.customerOtpVerified),
      nextOfKinOtpVerified: Boolean(application.nextOfKinOtpVerified || application.verification?.nextOfKinOtpVerified),
      nextOfKin: application.nextOfKin || customer?.nextOfKin || {
        name: "",
        phone: "",
        relationship: "",
        nationalId: "",
        gender: "",
        location: "",
        occupation: ""
      },
      status: application.status || "pending_screening",
      screeningNotes: application.reason || application.screeningNotes || "",
      rejectionReason: application.rejectionReason || "",
      infoRequiredMessage: application.infoRequiredMessage || "",
      duplicateNationalId: Boolean(application.duplicateNationalId),
      documents: application.documents || [],
      verification: application.verification || {}
    };
  });
  const applicationCustomerIds = new Set(mappedApplications.map((application) => application.customerId).filter(Boolean));
  const fallbackApplications = customers
    .filter((customer) => customer.id && !applicationCustomerIds.has(customer.id))
    .map(fallbackApplicationForCustomer);
  const applications = [...mappedApplications, ...fallbackApplications];

  const payments = (portal.payments || []).map((payment) => ({
    ...normalizePaymentRecord(payment),
    receipt: payment.receipt || payment.id,
    customerId: payment.customerId || payment.customer_id || "",
    agentId: payment.agentId || payment.agent_id || "",
    amount: Number(payment.amount || 0),
    status: ["paid", "completed", "success"].includes(String(payment.status || "").toLowerCase()) ? "success" : payment.status || "pending",
    reconciliationStatus: payment.reconciliationStatus || payment.reconciliation_status || "matched",
    paidAt: payment.paidAt || payment.paid_at || payment.date || ""
  }));

  const auditLogs = (portal.audits || []).map((audit) => ({
    id: audit.id,
    actor: audit.actorEmail || "system",
    role: "admin",
    action: audit.action || "",
    entityType: audit.targetTable || "",
    entityId: audit.targetId || "",
    createdAt: audit.createdAt || ""
  }));

  const users = (portal.financeUsers || []).map((user) => ({
    id: user.id,
    name: user.name || user.email,
    email: user.email || "",
    phone: user.phone || "",
    role: user.role || "finance_officer",
    status: user.status || "pending",
    createdAt: user.createdAt || ""
  }));

  const smsDeliveryReports = (portal.smsDeliveryReports || []).map((report) => ({
    id: report.providerMessageId || report.id || report.messageId || "",
    provider: report.provider || "africastalking",
    providerMessageId: report.providerMessageId || report.id || report.messageId || "",
    messageId: report.messageId || report.providerMessageId || report.id || "",
    requestId: report.requestId || report.request_id || "",
    recipientPhone: report.recipientPhone || report.phone || report.phoneNumber || report.number || "",
    phone: report.phone || report.recipientPhone || report.phoneNumber || report.number || "",
    sourcePortal: report.sourcePortal || report.source_portal || "api",
    senderMode: report.senderMode || report.sender_mode || "",
    senderId: report.senderId || report.sender_id || "",
    purpose: report.purpose || report.smsPurpose || report.messagePurpose || "general",
    providerAckStatus: report.providerAckStatus || report.provider_ack_status || "",
    providerAckStatusCode: report.providerAckStatusCode ?? report.provider_ack_status_code ?? null,
    deliveryStatus: report.deliveryStatus || report.delivery_status || "unknown",
    deliveryStatusCode: report.deliveryStatusCode ?? report.delivery_status_code ?? null,
    failureReason: report.failureReason || report.failure_reason || "",
    networkCode: report.networkCode || report.network_code || "",
    deliveredAt: report.deliveredAt || report.delivered_at || "",
    lastReportedAt: report.lastReportedAt || report.last_reported_at || "",
    createdAt: report.createdAt || report.created_at || "",
    updatedAt: report.updatedAt || report.updated_at || "",
    rawPayload: report.rawPayload || report.raw_payload || report.rawDeliveryPayload || {},
    rawProviderResponse: report.rawProviderResponse || report.raw_provider_response || {},
    rawDeliveryPayload: report.rawDeliveryPayload || report.raw_delivery_payload || {}
  }));

  return {
    agents,
    applications,
    archivedAuditLogs: [],
    auditLogs,
    bikes,
    customers,
    notifications: portal.notifications || [],
    smsDeliveryReports,
    payments,
    users
  };
}

function makeAudit(action, entityType, entityId, actor, role) {
  return {
    id: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    actor,
    role,
    action,
    entityType,
    entityId,
    createdAt: new Date().toISOString()
  };
}

function adminRefreshIntervalMs() {
  try {
    const settings = JSON.parse(window.localStorage.getItem("SALAMA LOCK-admin-settings") || "{}");
    const value = settings?.admin?.dashboardRefreshInterval;
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 15000;
  } catch {
    return 15000;
  }
}

export function AdminDataProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [state, setState] = useState(defaultState);
  const [dataStatus, setDataStatus] = useState("idle");
  const [dataError, setDataError] = useState("");
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(adminRefreshIntervalMs);

  const loadPortal = useCallback(async ({ silent = false } = {}) => {
    if (!isAuthenticated) {
      setState(defaultState);
      setDataStatus("idle");
      return;
    }

    try {
      if (!silent) setDataStatus("loading");
      const data = await apiRequest("/api/admin/portal");
      setState({ ...defaultState, ...mapPortal(data.portal) });
      setDataStatus("live");
      setDataError("");
    } catch (error) {
      setDataStatus("error");
      setDataError(error.message || "Unable to load admin records.");
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadPortal();
  }, [loadPortal]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const timer = window.setInterval(() => {
      loadPortal({ silent: true });
    }, refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [isAuthenticated, loadPortal, refreshIntervalMs]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const handleVisibilityChange = () => {
      if (window.document.visibilityState === "visible") {
        loadPortal({ silent: true });
      }
    };
    window.document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => window.document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isAuthenticated, loadPortal]);

  useEffect(() => {
    function handleSettingsChange() {
      setRefreshIntervalMs(adminRefreshIntervalMs());
    }

    window.addEventListener("SALAMA LOCK-admin-settings-changed", handleSettingsChange);
    window.addEventListener("storage", handleSettingsChange);
    return () => {
      window.removeEventListener("SALAMA LOCK-admin-settings-changed", handleSettingsChange);
      window.removeEventListener("storage", handleSettingsChange);
    };
  }, []);

  const currentActor = user?.name || user?.email || "System user";
  const currentRole = user?.role || "system";

  const updateApplicationStatus = useCallback(async (applicationId, status, message = "") => {
    const action = status === "approved" ? "approve" : status === "rejected" ? "reject" : "request_info";
    await apiRequest(`/api/admin/applications/${encodeURIComponent(applicationId)}/review`, {
      method: "POST",
      body: { action, reason: message }
    });
    await loadPortal();
  }, [loadPortal]);

  const updateAgentStatus = useCallback(async (agentId, status) => {
    let result = null;
    if (status === "active") {
      result = await apiRequest(`/api/admin/agents/${encodeURIComponent(agentId)}/approve`, { method: "POST" });
    } else {
      result = await apiRequest(`/api/admin/agents/${encodeURIComponent(agentId)}/status`, {
        method: "POST",
        body: { status: backendAgentStatus(status) }
      });
    }
    await loadPortal();
    return result;
  }, [loadPortal]);

  const updateApplicationVerification = useCallback(async (applicationId, verification) => {
    await apiRequest(`/api/admin/applications/${encodeURIComponent(applicationId)}/details`, {
      method: "POST",
      body: { verification }
    });
    await loadPortal();
  }, [loadPortal]);

  const verifyApplication = useCallback(async (applicationId, verification = {}) => {
    await apiRequest(`/api/admin/applications/${encodeURIComponent(applicationId)}/verify`, {
      method: "POST",
      body: { verification }
    });
    await loadPortal();
  }, [loadPortal]);

  const updateApplicationBikeAssignment = useCallback(async (applicationId, bikeId) => {
    await apiRequest(`/api/admin/applications/${encodeURIComponent(applicationId)}/details`, {
      method: "POST",
      body: { bikeId: bikeId || "" }
    });
    await loadPortal();
  }, [loadPortal]);

  const addAgent = useCallback(async (agent) => {
    await apiRequest("/api/admin/agents", {
      method: "POST",
      body: {
        fullName: agent.name,
        email: agent.email,
        phone: agent.phone,
        nationalId: agent.nationalId,
        region: agent.region
      }
    });
    await loadPortal();
  }, [loadPortal]);

  const addBike = useCallback(async (bike) => {
    const productType = String(bike.productType || "bike").toLowerCase() === "phone" ? "phone" : "bike";
    const basePayload = {
      productType,
      productModel: String(bike.model || "").trim(),
      totalPayable: Number(bike.totalPayable || bike.total_payable || 0),
      assignedAgentId: String(bike.assignedAgentId || "").trim(),
      assignedAgentCode: String(bike.assignedAgentCode || "").trim(),
      branch: String(bike.branch || "Main").trim() || "Main",
      status: String(bike.status || "").trim()
    };
    const inventoryPayload = productType === "phone"
      ? {
          ...basePayload,
          imei1: String(bike.imei1 || "").trim(),
          imei2: String(bike.imei2 || "").trim(),
          lockerId: String(bike.lockerId || "").trim(),
          lockerProvider: String(bike.lockerProvider || "honor").trim() || "honor"
        }
      : {
          ...basePayload,
          imageUrl: String(bike.imageUrl || "").trim(),
          serialNumber: String(bike.serialNumber || "").trim(),
          chassisNumber: String(bike.chassisNumber || "").trim()
        };
    await apiRequest("/api/admin/products", {
      method: "POST",
      body: inventoryPayload
    });
    await loadPortal();
  }, [loadPortal]);

  const updateBike = useCallback(async (bikeId, bike) => {
    const optimisticProduct = normalizeProductRecord({
      ...bike,
      id: bikeId,
      productModel: bike.productModel ?? bike.model
    });

    setState((current) => ({
      ...current,
      bikes: current.bikes.map((item) => item.id === bikeId ? { ...item, ...optimisticProduct } : item)
    }));

    let result;
    try {
      result = await apiRequest(`/api/admin/products/${encodeURIComponent(bikeId)}/update`, {
        method: "POST",
        body: bike
      });
    } catch (error) {
      void loadPortal({ silent: true });
      throw error;
    }
    const updatedProduct = normalizeProductRecord(result?.product || {});
    const updatedCustomer = result?.customer ? normalizeCustomerRecord(result.customer) : null;

    setState((current) => ({
      ...current,
      bikes: current.bikes.map((item) => item.id === bikeId ? { ...item, ...updatedProduct } : item),
      customers: updatedCustomer
        ? current.customers.map((item) => item.id === updatedCustomer.id ? { ...item, ...updatedCustomer } : item)
        : current.customers
    }));

    void loadPortal({ silent: true });
    return result;
  }, [loadPortal]);

  const deleteAgent = useCallback(async (agentId) => {
    await apiRequest(`/api/admin/agents/${encodeURIComponent(agentId)}/delete`, {
      method: "DELETE"
    });
    await loadPortal();
  }, [loadPortal]);

  const deleteCustomer = useCallback(async (customerId) => {
    await apiRequest(`/api/admin/customers/${encodeURIComponent(customerId)}/delete`, {
      method: "DELETE"
    });
    await loadPortal();
  }, [loadPortal]);

  const deleteBike = useCallback(async (bikeId) => {
    await apiRequest(`/api/admin/products/${encodeURIComponent(bikeId)}/delete`, {
      method: "DELETE"
    });
    await loadPortal();
  }, [loadPortal]);

  const deleteApplication = useCallback(async (applicationId) => {
    await apiRequest(`/api/admin/applications/${encodeURIComponent(applicationId)}/delete`, {
      method: "DELETE"
    });
    await loadPortal();
  }, [loadPortal]);

  const deletePayment = useCallback(async (paymentId) => {
    await apiRequest(`/api/admin/payments/${encodeURIComponent(paymentId)}/delete`, {
      method: "DELETE"
    });
    await loadPortal();
  }, [loadPortal]);

  const verifyPayment = useCallback(async (paymentId, verification = {}) => {
    await apiRequest(`/api/admin/payments/${encodeURIComponent(paymentId)}/verify`, {
      method: "POST",
      body: { verification }
    });
    await loadPortal();
  }, [loadPortal]);

  const updateBikeAgent = useCallback(async (bikeId, assignedAgentId) => {
    await apiRequest(`/api/admin/products/${encodeURIComponent(bikeId)}/assign-agent`, {
      method: "POST",
      body: { assignedAgentId: assignedAgentId || "" }
    });
    await loadPortal();
  }, [loadPortal]);

  const refreshBikeLockStatus = useCallback(async (bikeId) => {
    const result = await apiRequest("/api/admin/locker/diagnose", {
      method: "POST",
      body: { productId: bikeId }
    });
    const refreshedProduct = result?.product || {};
    setState((current) => ({
      ...current,
      bikes: current.bikes.map((bike) => {
        if (bike.id !== bikeId) return bike;
        return {
          ...bike,
          ...refreshedProduct,
          providerTaskId: refreshedProduct.providerTaskId || bike.providerTaskId || refreshedProduct.honorTaskId || bike.honorTaskId || "",
          providerRequestId: refreshedProduct.providerRequestId || bike.providerRequestId || "",
          providerState: refreshedProduct.providerState || bike.providerState || "",
          providerLockStatus: refreshedProduct.providerLockStatus || bike.providerLockStatus || refreshedProduct.lockStatus || bike.lockStatus || "",
          finalDeviceState: refreshedProduct.finalDeviceState || bike.finalDeviceState || refreshedProduct.providerLockStatus || refreshedProduct.lockStatus || bike.providerLockStatus || bike.lockStatus || "",
          honorTaskId: refreshedProduct.honorTaskId || bike.honorTaskId || "",
          lockStatus: refreshedProduct.lockStatus || bike.lockStatus || "",
          honorLockStatus: refreshedProduct.honorLockStatus || refreshedProduct.lockStatus || bike.honorLockStatus || bike.lockStatus || "",
          honorDeviceState: refreshedProduct.honorDeviceState || refreshedProduct.deviceState || refreshedProduct.honorLockStatus || refreshedProduct.lockStatus || bike.honorDeviceState || bike.honorLockStatus || bike.lockStatus || "",
          providerResponse: refreshedProduct.providerResponse || bike.providerResponse || null,
          honorLastResponse: refreshedProduct.honorLastResponse || bike.honorLastResponse || null,
          lockerProvider: refreshedProduct.lockerProvider || bike.lockerProvider || "",
          lockerSyncStatus: refreshedProduct.lockerSyncStatus || bike.lockerSyncStatus || "",
          lockerLastSyncedAt: refreshedProduct.lockerLastSyncedAt || bike.lockerLastSyncedAt || "",
          lockerLastError: refreshedProduct.lockerLastError || bike.lockerLastError || "",
          lockerLastRequestAt: refreshedProduct.lockerLastRequestAt || bike.lockerLastRequestAt || "",
          lastLockRequestAt: refreshedProduct.lastLockRequestAt || bike.lastLockRequestAt || "",
          lockerAppId: refreshedProduct.lockerAppId || bike.lockerAppId || "",
          lockerSyncPayload: refreshedProduct.lockerSyncPayload || bike.lockerSyncPayload || {}
        };
      })
    }));
    void loadPortal({ silent: true });
    return result;
  }, [loadPortal]);

  const addUser = useCallback(async (userRecord) => {
    const result = await apiRequest("/api/admin/finance-users", {
      method: "POST",
      body: userRecord
    });
    await loadPortal();
    return result.temporaryPassword;
  }, [loadPortal]);

  const updateUserStatus = useCallback(async (userId, status) => {
    await apiRequest(`/api/admin/finance-users/${encodeURIComponent(userId)}/status`, {
      method: "POST",
      body: { status }
    });
    await loadPortal();
  }, [loadPortal]);

  const updateUserRole = useCallback(async (userId, role) => {
    await apiRequest(`/api/admin/finance-users/${encodeURIComponent(userId)}/role`, {
      method: "POST",
      body: { role }
    });
    await loadPortal();
  }, [loadPortal]);

  const updateUser = useCallback(async (userId, userRecord) => {
    const result = await apiRequest(`/api/admin/finance-users/${encodeURIComponent(userId)}/update`, {
      method: "POST",
      body: userRecord
    });
    await loadPortal();
    return result;
  }, [loadPortal]);

  const resetUserCredentials = useCallback(async (userId) => {
    const result = await apiRequest(`/api/admin/finance-users/${encodeURIComponent(userId)}/reset`, { method: "POST" });
    await loadPortal();
    return result.temporaryPassword;
  }, [loadPortal]);

  const archiveAuditLogs = useCallback((logIds) => {
    setState((current) => {
      const ids = new Set(logIds);
      const archived = current.auditLogs.filter((log) => ids.has(log.id));
      return {
        ...current,
        archivedAuditLogs: [...archived, ...current.archivedAuditLogs],
        auditLogs: current.auditLogs.filter((log) => !ids.has(log.id))
      };
    });
  }, []);

  const updateNotificationStatus = useCallback(async (notificationIds, status) => {
    await apiRequest("/api/admin/notifications/status", {
      method: "POST",
      body: { ids: notificationIds, status }
    });
    await loadPortal();
  }, [loadPortal]);

  const sendFinanceFollowUp = useCallback(async (customerIds, options = {}) => {
    const result = await apiRequest("/api/admin/finance/follow-up", {
      method: "POST",
      body: {
        customerIds,
        ...options
      }
    });
    await loadPortal();
    return result;
  }, [loadPortal]);

  const sendTestSms = useCallback(async (options = {}) => {
    const result = await apiRequest("/api/admin/test-sms", {
      method: "POST",
      body: options
    });
    await loadPortal({ silent: true });
    return result;
  }, [loadPortal]);

  const lookupSmsStatus = useCallback(async (messageId) => {
    return apiRequest(`/api/admin/sms-status?messageId=${encodeURIComponent(messageId)}`);
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      addAgent,
      addBike,
      addUser,
      archiveAuditLogs,
      deleteAgent,
      deleteApplication,
      deleteBike,
      deleteCustomer,
      deletePayment,
      refresh: loadPortal,
      resetUserCredentials,
      refreshBikeLockStatus,
      sendFinanceFollowUp,
      sendTestSms,
      lookupSmsStatus,
      updateAgentStatus,
      updateApplicationBikeAssignment,
      updateApplicationVerification,
      updateBike,
      verifyApplication,
      verifyPayment,
      updateApplicationStatus,
      updateBikeAgent,
      updateNotificationStatus,
      updateUser,
      updateUserRole,
      updateUserStatus,
      dataError,
      dataStatus
    }),
    [
      state,
      addAgent,
      addBike,
      addUser,
      archiveAuditLogs,
      deleteAgent,
      deleteApplication,
      deleteBike,
      deleteCustomer,
      deletePayment,
      loadPortal,
      resetUserCredentials,
      refreshBikeLockStatus,
      sendFinanceFollowUp,
      sendTestSms,
      lookupSmsStatus,
      updateAgentStatus,
      updateApplicationBikeAssignment,
      updateApplicationStatus,
      updateApplicationVerification,
      updateBike,
      updateBikeAgent,
      updateNotificationStatus,
      updateUser,
      updateUserRole,
      updateUserStatus,
      verifyApplication,
      verifyPayment,
      dataError,
      dataStatus
    ]
  );

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>;
}

export function useAdminData() {
  const context = useContext(AdminDataContext);
  if (!context) {
    throw new Error("useAdminData must be used inside AdminDataProvider");
  }
  return context;
}
