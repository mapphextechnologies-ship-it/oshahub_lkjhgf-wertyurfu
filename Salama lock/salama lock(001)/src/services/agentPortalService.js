import { backendClient } from './backendClient.js';
import { normalizeCustomerRecord } from './recordNormalization.js';
import { getSharedPortalData } from './sharedPortalService.js';
import { readSharedData } from './sharedDataService.js';

let lastSyncIssue = null;

function normalizeRegisteredCustomer(customer) {
  return normalizeCustomerRecord(customer);
}

export const agentPortalService = {
  async listRegisteredCustomers() {
    try {
      const customers = await readSharedData({
        resource: 'customer records',
        primary: async () => {
          const records = await backendClient
            .get('/api/customers', { limit: 5000 })
            .then((data) => data.customers ?? data.records ?? data);
          if (!Array.isArray(records)) throw new Error('Customer records were not returned by the backend.');
          return records.map(normalizeRegisteredCustomer);
        },
        secondary: async () => {
          const portal = await getSharedPortalData({ force: true });
          if (!Array.isArray(portal?.customers)) throw new Error('Customer records were not returned by the shared portal.');
          return portal.customers.map(normalizeRegisteredCustomer);
        }
      });
      lastSyncIssue = null;
      return customers;
    } catch (error) {
      lastSyncIssue = {
        message: error.message,
        checkedAt: new Date().toISOString()
      };
      throw error;
    }
  },

  async healthCheck() {
    return backendClient.get('/api/health').catch((error) => {
      lastSyncIssue = {
        message: error.message,
        checkedAt: new Date().toISOString()
      };
      return { ok: false, mode: 'backend', message: error.message };
    });
  },

  getLastSyncIssue() {
    return lastSyncIssue;
  }
};
