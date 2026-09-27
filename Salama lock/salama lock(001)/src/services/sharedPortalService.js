import { backendClient } from './backendClient.js';

const PORTAL_CACHE_TTL_MS = 15000;

let inFlightPortalRequest = null;
let cachedPortal = null;
let cachedAt = 0;

function normalizePortalResponse(data = {}) {
  return data.portal ?? data;
}

export function invalidateSharedPortalData() {
  cachedPortal = null;
  cachedAt = 0;
}

export async function getSharedPortalData({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedPortal && now - cachedAt < PORTAL_CACHE_TTL_MS) {
    return cachedPortal;
  }

  if (!inFlightPortalRequest) {
    inFlightPortalRequest = backendClient
      .get('/api/admin/portal')
      .then((data) => {
        cachedPortal = normalizePortalResponse(data || {});
        cachedAt = Date.now();
        return cachedPortal;
      })
      .finally(() => {
        inFlightPortalRequest = null;
      });
  }

  return inFlightPortalRequest;
}

export function filterPortalRecords(records = [], productType) {
  const normalizedType = String(productType || '').trim().toLowerCase();
  if (!normalizedType || normalizedType === 'all') {
    return Array.isArray(records) ? records : [];
  }

  return (Array.isArray(records) ? records : []).filter((record) => {
    const recordType = String(record?.productType ?? record?.product_type ?? record?.type ?? '').trim().toLowerCase();
    return recordType === normalizedType;
  });
}
