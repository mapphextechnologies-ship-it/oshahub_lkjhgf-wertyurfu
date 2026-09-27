import { backendClient } from './backendClient.js';
import { getSharedPortalData, invalidateSharedPortalData } from './sharedPortalService.js';
import { readSharedData } from './sharedDataService.js';
import { inferCommissionProductType, matchesCommissionProductScope } from '../utils/commission.js';

function normalizeCommission(commission) {
  return {
    id: commission.id,
    agentName: commission.agentName ?? commission.agent_name,
    agentCode: commission.agentCode ?? commission.agent_code ?? commission.agentId ?? commission.agent_id,
    agentPhone: commission.agentPhone ?? commission.agent_phone ?? commission.phone,
    customerName: commission.customerName ?? commission.customer_name,
    productType: inferCommissionProductType(commission),
    productModel: commission.productModel ?? commission.product_model ?? commission.bikeModel ?? commission.bike_model ?? commission.itemName ?? commission.item_name ?? 'Product',
    chassisNumber: commission.chassisNumber ?? commission.chassis_number ?? '',
    serialNumber: commission.serialNumber ?? commission.serial_number ?? commission.chassisNumber ?? commission.chassis_number ?? '',
    type: commission.type,
    amount: Number(commission.amount ?? 0),
    status: String(commission.status ?? '').toLowerCase(),
    earnedAt: commission.earnedAt ?? commission.earned_at ?? commission.createdAt ?? commission.created_at,
    paidAt: commission.paidAt ?? commission.paid_at,
    payoutStatus: commission.payoutStatus ?? commission.payout_status,
    payoutRequestedAt: commission.payoutRequestedAt ?? commission.payout_requested_at,
    payoutReference: commission.payoutReference ?? commission.payout_reference,
    payoutError: commission.payoutError ?? commission.payout_error,
    approvalReference: commission.approvalReference ?? commission.finance_approval_reference ?? commission.payoutReference ?? commission.payout_reference,
    approvedAt: commission.approvedAt ?? commission.finance_approved_at ?? commission.paidAt ?? commission.paid_at,
    paymentPercentage: commission.paymentPercentage ?? commission.payment_percentage ?? 0,
    commissionRate: commission.commissionRate ?? commission.commission_rate ?? 0,
    notificationMessage: commission.notificationMessage ?? commission.notification_message ?? '',
    payoutNote: commission.payoutNote ?? commission.payout_note ?? 'earned after sale and activation',
    earnedMonth: commission.earnedMonth ?? commission.earned_month ?? String(commission.earnedAt ?? '').slice(0, 7),
    customerPaymentStatus: String(commission.customerPaymentStatus ?? commission.customer_payment_status ?? commission.paymentStatus ?? commission.payment_status ?? 'unpaid').toLowerCase(),
    followUpSentAt: commission.followUpSentAt ?? commission.follow_up_sent_at
  };
}

export const commissionService = {
  async listCommissions(options = {}) {
    const query = options.productType ? { productType: options.productType, limit: 5000 } : { limit: 5000 };

    return readSharedData({
      resource: 'commission records',
      primary: async () => {
        const commissions = await backendClient
          .get('/api/commissions', query)
          .then((data) => data.commissions ?? data.records ?? data);
        if (!Array.isArray(commissions)) throw new Error('Commission records were not returned by the backend.');
        return commissions.map(normalizeCommission);
      },
      secondary: async () => {
        const portal = await getSharedPortalData({ force: true });
        if (!Array.isArray(portal?.commissions)) throw new Error('Commission records were not returned by the shared portal.');
        return portal.commissions
          .map(normalizeCommission)
          .filter((commission) => matchesCommissionProductScope(commission, options.productType));
      }
    });
  },

  async payAgent(commissionId) {
    const data = await backendClient.post(`/api/commissions/${commissionId}/pay`, {});
    invalidateSharedPortalData();
    return normalizeCommission(data.commission ?? data.record ?? data);
  },

  async sendFollowUpNotification(commissionId) {
    const data = await backendClient.post('/api/agent-notifications', { commissionId });
    invalidateSharedPortalData();
    return normalizeCommission(data.commission ?? data.record ?? data);
  },

  async markAgentPaid(agentKey) {
    const data = await backendClient.post('/api/commissions/agent-payment-approvals', { agentKey });
    invalidateSharedPortalData();

    if (data?.commissions || data?.records) {
      return (data.commissions ?? data.records).map(normalizeCommission);
    }

    return [];
  }
};
