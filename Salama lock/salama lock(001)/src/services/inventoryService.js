import { backendClient } from './backendClient.js';
import { normalizeProductScope } from '../utils/productScope.js';
import { normalizeProductRecord } from './recordNormalization.js';
import { filterPortalRecords, getSharedPortalData } from './sharedPortalService.js';
import { readSharedData } from './sharedDataService.js';

function normalizeInventoryType(value) {
  return normalizeProductScope(value);
}

function normalizeProduct(product) {
  const normalized = normalizeProductRecord(product);
  return {
    ...normalized,
    productType: normalizeInventoryType(normalized.productType) || 'product'
  };
}

export const inventoryService = {
  async listProducts(options = {}) {
    const productType = normalizeInventoryType(options.productType ?? options.product_type ?? options.type);
    const query = productType ? { productType } : {};

    return readSharedData({
      resource: 'inventory records',
      primary: async () => {
        const data = await backendClient.get('/api/inventory', query);
        const products = data.products ?? data.records ?? data;
        if (!Array.isArray(products)) throw new Error('Inventory records were not returned by the backend.');
        return products.map(normalizeProduct);
      },
      secondary: async () => {
        const portal = await getSharedPortalData({ force: true });
        if (!Array.isArray(portal?.products)) throw new Error('Inventory records were not returned by the shared portal.');
        return filterPortalRecords(portal.products, productType).map(normalizeProduct);
      }
    });
  }
};
