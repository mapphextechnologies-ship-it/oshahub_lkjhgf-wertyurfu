import { backendClient } from './backendClient.js';
import { filterPortalRecords, getSharedPortalData } from './sharedPortalService.js';
import { readSharedData } from './sharedDataService.js';
import {
  dedupeFinancialPayments,
  financialPaymentAmount,
  isSuccessfulFinancialPayment,
  normalizeDashboardSummary,
  sumFinancialCustomerCollections
} from '../utils/financialLedger.js';
import { matchesCommissionProductScope, summarizeUnpaidCommissions } from '../utils/commission.js';
import { normalizeProductScope } from '../utils/productScope.js';
export { normalizeDashboardSummary } from '../utils/financialLedger.js';

export const emptyDashboardSummary = {
  totalCollected: 0,
  expectedAmount: 0,
  expectedCollection: 0,
  pendingPayments: 0,
  overdueAmount: 0,
  reconciliationFlags: 0,
  unpaidCommissions: 0,
  bikeUnpaidCommissions: 0,
  phoneUnpaidCommissions: 0,
  activeAccounts: 0,
  todayCollections: 0,
  unpaidPayments: 0,
  pendingCommissions: 0
};

function normalizeReconciliation(record) {
  return {
    id: record.id,
    receipt: record.receipt ?? record.receiptNumber ?? record.receipt_number,
    customerName: record.customerName ?? record.customer_name ?? record.name,
    nationalId: record.nationalId ?? record.national_id ?? record.idNumber ?? record.id_number ?? 'No data yet',
    providerAmount: record.providerAmount ?? record.provider_amount ?? record.amount ?? 0,
    systemAmount: record.systemAmount ?? record.system_amount ?? record.recordedAmount ?? record.recorded_amount,
    date: record.date ?? record.createdAt ?? record.created_at,
    status: record.status
  };
}

function transactionAmount(record) {
  return financialPaymentAmount(record);
}

function sumPaymentAmount(payment) {
  return financialPaymentAmount(payment);
}

function overdueAmountForCustomer(customer = {}) {
  const explicitOverdueAmount = Number(customer.overdueAmount ?? customer.overdue_amount);
  const balance = Math.max(0, Number(customer.balance ?? 0));
  if (Number.isFinite(explicitOverdueAmount) && explicitOverdueAmount >= 0) {
    return balance > 0 ? Math.min(explicitOverdueAmount, balance) : explicitOverdueAmount;
  }

  const overdueDays = Number(customer.overdueDays ?? customer.overdue_days ?? 0);
  const status = String(customer.status || '').toLowerCase();
  if (overdueDays <= 0 && status !== 'defaulted') return 0;

  const dailyInstallment = Number(customer.dailyInstallment ?? customer.daily_installment ?? 0);
  const missedDays = Math.max(1, overdueDays);

  if (dailyInstallment > 0 && balance > 0) {
    return Math.min(dailyInstallment * missedDays, balance);
  }

  return balance;
}

function buildSummaryFromPortal(portal = {}, scopeProductType = null) {
  const payments = dedupeFinancialPayments(filterPortalRecords(portal.payments || [], scopeProductType));
  const successfulPayments = payments.filter(isSuccessfulFinancialPayment);
  const customers = filterPortalRecords(portal.customers || [], scopeProductType);
  const commissions = Array.isArray(portal.commissions) ? portal.commissions : [];
  const commissionScope = normalizeProductScope(scopeProductType);
  const scopedCommissions = commissions.filter((commission) => matchesCommissionProductScope(commission, commissionScope));
  const commissionTotals = summarizeUnpaidCommissions(commissions);
  const scopedUnpaidCommissions = commissionScope === 'phone'
    ? commissionTotals.phoneUnpaidCommissions
    : commissionScope === 'bike'
      ? commissionTotals.bikeUnpaidCommissions
      : commissionTotals.unpaidCommissions;
  const paymentTypeById = new Map(
    (portal.payments || []).map((payment) => [
      String(payment.id || payment.paymentId || payment.payment_id || ''),
      String(payment.productType || payment.product_type || '').toLowerCase()
    ])
  );
  const reconciliation = (portal.reconciliation || []).filter((record) => {
    if (!scopeProductType || String(scopeProductType).toLowerCase() === 'all') return true;
    const paymentType = paymentTypeById.get(String(record.paymentId || record.payment_id || '')) || '';
    return paymentType === String(scopeProductType).toLowerCase();
  });
  const today = new Date().toISOString().slice(0, 10);
  const expectedAmount = customers.reduce((sum, customer) => sum + Number(customer.totalPayable ?? customer.total_payable ?? 0), 0);
  const pendingPayments = customers.reduce((sum, customer) => {
    const balance = Number(customer.balance ?? 0);
    return balance > 0 ? sum + balance : sum;
  }, 0);
  return normalizeDashboardSummary({
    totalCollected: sumFinancialCustomerCollections(customers),
    expectedAmount,
    expectedCollection: expectedAmount,
    pendingPayments,
    overdueAmount: customers.reduce((sum, customer) => sum + overdueAmountForCustomer(customer), 0),
    reconciliationFlags: reconciliation.filter((record) => String(record.status || '').toLowerCase() !== 'matched').length,
    unpaidCommissions: scopedUnpaidCommissions,
    bikeUnpaidCommissions: commissionTotals.bikeUnpaidCommissions,
    phoneUnpaidCommissions: commissionTotals.phoneUnpaidCommissions,
    activeAccounts: customers.filter((customer) => String(customer.status || '').toLowerCase() !== 'paid').length,
    todayCollections: successfulPayments.filter((payment) => String(payment.dateIso || payment.date || payment.createdAt || payment.created_at || '').slice(0, 10) === today).reduce((sum, payment) => sum + sumPaymentAmount(payment), 0),
    unpaidPayments: payments.filter((payment) => String(payment.status || '').toLowerCase() === 'unpaid').length,
    pendingCommissions: scopedCommissions.filter((commission) => String(commission.status || '').toLowerCase() === 'earned').length
  });
}

function normalizeCollectionTrend(dashboard) {
  const existingTrend = dashboard.trend ?? dashboard.collectionsTrend ?? dashboard.collections_trend;

  if (Array.isArray(existingTrend) && existingTrend.length > 0) {
    return existingTrend.map((item) => ({
      date: item.date ?? item.paymentDate ?? item.payment_date ?? item.createdAt ?? item.created_at,
      amount: Number(item.amount ?? item.collected ?? item.totalCollected ?? item.total_collected ?? 0),
      records: Number(item.records ?? item.recordCount ?? item.record_count ?? 0),
      customers: item.customers ?? item.customerNames ?? item.customer_names ?? [],
      accounts: item.accounts ?? item.accountNames ?? item.account_names ?? []
    }));
  }

  const transactions = dashboard.transactions ??
    dashboard.paymentTransactions ??
    dashboard.payment_transactions ??
    dashboard.collectionTransactions ??
    dashboard.collection_transactions ??
    [];

  if (!Array.isArray(transactions)) {
    return [];
  }

  const daily = dedupeFinancialPayments(transactions).filter(isSuccessfulFinancialPayment).reduce((days, transaction) => {
    const date = String(transaction.date ?? transaction.paymentDate ?? transaction.payment_date ?? transaction.createdAt ?? transaction.created_at ?? '').slice(0, 10);
    if (!date) return days;

    const current = days.get(date) ?? {
      date,
      amount: 0,
      records: 0,
      customers: new Set(),
      accounts: new Set()
    };

    current.amount += transactionAmount(transaction);
    current.records += 1;
    if (transaction.customerName || transaction.customer_name) {
      current.customers.add(transaction.customerName ?? transaction.customer_name);
    }
    if (transaction.accountName || transaction.account_name || transaction.accountNumber || transaction.account_number) {
      current.accounts.add(transaction.accountName ?? transaction.account_name ?? transaction.accountNumber ?? transaction.account_number);
    }
    days.set(date, current);
    return days;
  }, new Map());

  return [...daily.values()]
    .sort((first, second) => first.date.localeCompare(second.date))
    .map((item) => ({
      ...item,
      customers: [...item.customers],
      accounts: [...item.accounts]
    }));
}

export const financeService = {
  async getDashboard(options = {}) {
    const query = options.productType ? { productType: options.productType } : {};

    return readSharedData({
      resource: 'finance dashboard',
      primary: async () => {
        const dashboard = await backendClient.get('/api/dashboard', query);
        return {
          summary: normalizeDashboardSummary(dashboard.summary ?? emptyDashboardSummary),
          trend: normalizeCollectionTrend(dashboard)
        };
      },
      secondary: async () => {
        const portal = await getSharedPortalData({ force: true });
        if (!portal || typeof portal !== 'object') throw new Error('Finance dashboard data was not returned by the shared portal.');
        const portalPayments = filterPortalRecords(portal.payments || [], options.productType)
          .map((payment) => ({
            ...payment,
            date: payment.dateIso || payment.date || payment.createdAt || payment.created_at || ''
          }));
        return {
          summary: buildSummaryFromPortal(portal, options.productType || null),
          trend: normalizeCollectionTrend({ transactions: portalPayments })
        };
      }
    });
  },

  async getReconciliation(options = {}) {
    const query = options.productType ? { productType: options.productType } : {};

    return readSharedData({
      resource: 'reconciliation records',
      primary: async () => {
        const data = await backendClient.get('/api/reconciliation', query);
        const records = data.reconciliation ?? data.records ?? data;
        if (!Array.isArray(records)) throw new Error('Reconciliation records were not returned by the backend.');
        return records.map(normalizeReconciliation);
      },
      secondary: async () => {
        const portal = await getSharedPortalData({ force: true });
        if (!Array.isArray(portal?.reconciliation) || !Array.isArray(portal?.payments)) {
          throw new Error('Reconciliation records were not returned by the shared portal.');
        }
        const paymentTypeById = new Map(
          portal.payments.map((payment) => [
            String(payment.id || payment.paymentId || payment.payment_id || ''),
            String(payment.productType || payment.product_type || '').toLowerCase()
          ])
        );
        return portal.reconciliation
          .filter((record) => {
            if (!options.productType || String(options.productType).toLowerCase() === 'all') return true;
            const paymentType = paymentTypeById.get(String(record.paymentId || record.payment_id || '')) || '';
            return paymentType === String(options.productType).toLowerCase();
          })
          .map(normalizeReconciliation);
      }
    });
  }
};
