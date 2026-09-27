import { backendClient } from './backendClient.js';
import { formatKes } from '../utils/currency.js';
import { formatDate } from '../utils/dates.js';
import { getSharedPortalData, invalidateSharedPortalData } from './sharedPortalService.js';
import { readSharedData } from './sharedDataService.js';

function normalizeNotification(record) {
  const amount = record.amount ?? record.paymentAmount ?? record.payment_amount;
  const balance = record.balance ?? record.outstandingBalance ?? record.outstanding_balance;

  return {
    id: record.id,
    type: record.type ?? 'payment_unpaid',
    title: record.title ?? 'Payment alert',
    message: record.message ?? 'Review the payment record.',
    issue: record.issue,
    followUp: record.followUp ?? record.follow_up,
    customerName: record.customerName ?? record.customer_name,
    customerPhone: record.customerPhone ?? record.customer_phone,
    agentName: record.agentName ?? record.agent_name,
    agentCode: record.agentCode ?? record.agent_code,
    paymentDate: record.paymentDate
      ? formatDate(record.paymentDate)
      : record.payment_date ? formatDate(record.payment_date) : '',
    amount: amount !== undefined && amount !== null ? formatKes(amount) : null,
    balance: balance !== undefined && balance !== null ? formatKes(balance) : null,
    overdueDays: record.overdueDays ?? record.overdue_days,
    sourcePortal: record.sourcePortal ?? record.source_portal ?? 'Backend',
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
    isRead: record.status === 'read' || Boolean(record.isRead ?? record.is_read)
  };
}

export const notificationService = {
  async listNotifications() {
    return readSharedData({
      resource: 'notification records',
      primary: async () => {
        const data = await backendClient.get('/api/notifications');
        const records = data.notifications ?? data.records ?? data;
        if (!Array.isArray(records)) throw new Error('Notification records were not returned by the backend.');
        return records.map(normalizeNotification);
      },
      secondary: async () => {
        const portal = await getSharedPortalData({ force: true });
        if (!Array.isArray(portal?.notifications)) throw new Error('Notification records were not returned by the shared portal.');
        return portal.notifications.map(normalizeNotification);
      }
    });
  },

  async markNotifications(ids, status) {
    if (!ids.length) return { updated: [] };
    const result = await backendClient.patch('/api/notifications', { ids, status });
    invalidateSharedPortalData();
    return result;
  },

  async dismissNotifications(ids) {
    if (!ids.length) return { updated: [] };
    const result = await backendClient.delete('/api/notifications', { ids });
    invalidateSharedPortalData();
    return result;
  }
};
