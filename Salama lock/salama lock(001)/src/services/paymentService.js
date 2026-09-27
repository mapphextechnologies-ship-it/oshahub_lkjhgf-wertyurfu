import { backendClient } from './backendClient.js';
import { getDailyTarget, getOverdueDays, getPaymentAmount, getPaymentBalance, getPaygoAccountState, getPaygoFollowUp } from '../utils/paygo.js';
import { getRepaymentHealth } from '../utils/repaymentHealth.js';
import { normalizePaymentRecord } from './recordNormalization.js';
import { filterPortalRecords, getSharedPortalData, invalidateSharedPortalData } from './sharedPortalService.js';
import { readSharedData } from './sharedDataService.js';
import { dedupeFinancialPayments } from '../utils/financialLedger.js';

function normalizePaymentStatus(status) {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'paid' || normalized === 'completed' || normalized === 'success' ? 'paid' : 'unpaid';
}

function buildPaymentSearchIndex(payment) {
  return [
    payment.customerName,
    payment.customerPhone,
    payment.agentName,
    payment.agentId,
    payment.receipt,
    payment.providerReference,
    payment.providerTransactionId,
    payment.providerAccountReference,
    payment.providerPayerPhone,
    payment.bikeModel,
    payment.serialNumber,
    payment.chassisNumber,
    payment.status,
    payment.sourcePortal
  ].map((value) => String(value ?? '').toLowerCase()).join(' ');
}

function normalizePayment(payment) {
  const normalizedPayment = {
    ...normalizePaymentRecord(payment),
    paidAmount: payment.paidAmount ?? payment.paid_amount ?? getPaymentAmount(payment),
    balance: getPaymentBalance(payment),
    dailyTarget: getDailyTarget(payment),
    paygoState: payment.paygoState ?? payment.paygo_state ?? getPaygoAccountState(payment),
    followUp: payment.followUp ?? payment.follow_up ?? getPaygoFollowUp(payment),
    status: normalizePaymentStatus(payment.status)
  };
  const storedOverdueDays = Number(payment.overdueDays ?? payment.overdue_days ?? normalizedPayment.overdueDays ?? normalizedPayment.overdue_days ?? 0);
  const computedOverdueDays = getOverdueDays({ ...payment, ...normalizedPayment });
  const hasDueDate = Boolean(
    payment.paygoNextDueAt ||
    payment.paygo_next_due_at ||
    payment.dueDate ||
    payment.due_date ||
    normalizedPayment.dueDate ||
    normalizedPayment.due_date ||
    normalizedPayment.customer?.dueDate ||
    normalizedPayment.customer?.due_date
  );
  const repaymentHealth = getRepaymentHealth(normalizedPayment);

  return {
    ...normalizedPayment,
    overdueDays: computedOverdueDays > 0
      ? computedOverdueDays
      : hasDueDate
        ? 0
        : storedOverdueDays,
    overdueAmount: Number(payment.overdueAmount ?? payment.overdue_amount ?? normalizedPayment.overdueAmount ?? 0),
    repaymentHealth: repaymentHealth.key,
    repaymentHealthLabel: repaymentHealth.label,
    repaymentHealthStatus: repaymentHealth.badgeStatus,
    isRedFlag: repaymentHealth.isRedFlag,
    searchIndex: buildPaymentSearchIndex(normalizedPayment)
  };
}

export const paymentService = {
  async listPayments(options = {}) {
    const query = options.productType ? { productType: options.productType, limit: 5000 } : { limit: 5000 };

    return readSharedData({
      resource: 'payment records',
      primary: async () => {
        const payments = await backendClient
          .get('/api/payments', query)
          .then((data) => data.payments ?? data.records ?? data);
        if (!Array.isArray(payments)) throw new Error('Payment records were not returned by the backend.');
        return dedupeFinancialPayments(payments)
          .map(normalizePayment)
          .sort((first, second) => String(second.date || '').localeCompare(String(first.date || '')));
      },
      secondary: async () => {
        const portal = await getSharedPortalData({ force: true });
        if (!Array.isArray(portal?.payments)) throw new Error('Payment records were not returned by the shared portal.');
        return dedupeFinancialPayments(filterPortalRecords(portal.payments, options.productType))
          .map((payment) => normalizePayment({ ...payment, date: payment.dateIso || payment.date }))
          .sort((first, second) => String(second.date || '').localeCompare(String(first.date || '')));
      }
    });
  },

  async saveManualPayment(payment) {
    const data = await backendClient.post('/api/payments/manual', payment);
    invalidateSharedPortalData();

    return {
      ...payment,
      ...normalizePayment(data.payment ?? data.record ?? data)
    };
  },

  async updateFinancials(paymentId, financials) {
    const data = await backendClient.patch(
      `/api/payments/${encodeURIComponent(paymentId)}/financials`,
      financials
    );
    invalidateSharedPortalData();

    const payment = normalizePayment({
      ...(data.payment || {}),
      customer: data.customer || null
    });
    return { ...payment, replacedPaymentId: data.replacedPaymentId || paymentId };
  },

  async syncProviderPayments() {
    return [];
  }
};
