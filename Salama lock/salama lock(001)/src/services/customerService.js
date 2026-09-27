import { paymentService } from './paymentService.js';
import { backendClient } from './backendClient.js';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function agentIdFor(payment) {
  return normalize(payment.agentId || payment.agentCode);
}

export const customerService = {
  async listPaymentRecords() {
    if (backendClient.isConfigured) {
      const data = await backendClient.get('/api/customers/payment-records').catch(() => null);

      if (data) {
        return data.payments ?? data.records ?? data;
      }
    }

    return paymentService.listPayments();
  },

  async listPaymentRecordsByAgent({ agentName, agentId }) {
    const name = normalize(agentName);
    const id = normalize(agentId);

    if (!name && !id) {
      return this.listPaymentRecords();
    }

    if (backendClient.isConfigured) {
      const data = await backendClient
        .get('/api/customers/payment-records', { agentName, agentId })
        .catch(() => null);

      if (data) {
        return data.payments ?? data.records ?? data;
      }
    }

    const payments = await this.listPaymentRecords();
    return payments.filter(
      (payment) =>
        (!name || normalize(payment.agentName) === name) &&
        (!id || agentIdFor(payment) === id)
    );
  }
};
