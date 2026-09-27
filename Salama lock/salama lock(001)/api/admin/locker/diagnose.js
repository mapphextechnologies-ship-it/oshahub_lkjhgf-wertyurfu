import { readJson, sendJson } from '../../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../../_lib/security.js';
import { getSupabase, requirePortalUser } from '../../_lib/supabase.js';
import { refreshHonorTaskStatusForProduct, resolveTrustonicPhoneLockerDeviceUid } from '../../_lib/database.js';
import { queryTask } from '../../_lib/phone-locker.js';

function isTrustonicLockerProvider(value) {
  return ['trustonic', 'trust', 'ttp', 'telecoms-platform', 'trustonic-v2'].includes(
    String(value || '').trim().toLowerCase()
  );
}

function resolveRouteLockerProvider(product = {}, profile = {}) {
  const productProvider = String(product.locker_provider || product.lockerProvider || '').trim();
  const profileProvider = String(profile.locker_provider || profile.lockerProvider || '').trim();
  if ([productProvider, profileProvider].some(isTrustonicLockerProvider)) return 'trustonic';
  return productProvider || profileProvider || 'honor';
}

async function findProduct({ productId, registeredId }) {
  if (productId) {
    const result = await getSupabase()
      .from('inventory_products')
      .select('*, inventory_phone_profiles(*)')
      .eq('id', productId)
      .maybeSingle();

    if (result.error) throw result.error;
    if (result.data) return result.data;
  }

  if (registeredId) {
    for (const column of ['imei_1', 'imei_2', 'serial_number', 'chassis_number', 'locker_id']) {
      const result = await getSupabase()
        .from('inventory_products')
        .select('*, inventory_phone_profiles(*)')
        .eq('product_type', 'phone')
        .eq(column, registeredId)
        .maybeSingle();

      if (result.error) throw result.error;
      if (result.data) return result.data;
    }

    const mappingResult = await getSupabase()
      .from('customer_device_mappings')
      .select('registered_id')
      .eq('customer_account', registeredId)
      .maybeSingle();

    if (mappingResult.error) throw mappingResult.error;
    if (mappingResult.data?.registered_id) {
      for (const column of ['imei_1', 'imei_2', 'serial_number', 'chassis_number', 'locker_id']) {
        const result = await getSupabase()
          .from('inventory_products')
          .select('*, inventory_phone_profiles(*)')
          .eq('product_type', 'phone')
          .eq(column, mappingResult.data.registered_id)
          .maybeSingle();

        if (result.error) throw result.error;
        if (result.data) return result.data;
      }
    }
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'admin-phone-locker-diagnose', limit: 10, windowMs: 60_000 });
    await requirePortalUser(req, ['admin']);

    const body = await readJson(req);
    const productId = String(body.productId || body.product_id || '').trim();
    const registeredId = String(body.registeredId || body.registered_id || body.lockerId || body.locker_id || '').trim();

    if (!productId && !registeredId) {
      sendJson(res, 400, { message: 'Provide productId or registeredId.' });
      return;
    }

    const product = await findProduct({ productId, registeredId });
    if (!product) {
      sendJson(res, 404, { message: 'Phone inventory record was not found.' });
      return;
    }

    const profile = Array.isArray(product.inventory_phone_profiles)
      ? product.inventory_phone_profiles[0] || {}
      : product.inventory_phone_profiles || {};
    const lockerProvider = resolveRouteLockerProvider(product, profile);
    const resolvedRegisteredId = lockerProvider === 'trustonic'
      ? resolveTrustonicPhoneLockerDeviceUid(product, profile) || (/^\d{15}$/.test(registeredId) ? registeredId : '')
      : (product.imei_1 || profile.imei_1 || product.locker_id || profile.locker_id || registeredId);
    if (lockerProvider === 'trustonic' && !resolvedRegisteredId) {
      sendJson(res, 400, { message: 'Trustonic deviceUid could not be resolved.' });
      return;
    }
    const providerProduct = {
      ...product,
      locker_provider: lockerProvider
    };
    const rawTask = await queryTask({
      registeredId: resolvedRegisteredId,
      product: providerProduct,
      lockerProvider,
      action: String(profile.locker_sync_payload?.action || 'lock').trim().toLowerCase(),
      timeoutMs: 15_000
    });
    const refreshed = await refreshHonorTaskStatusForProduct(providerProduct, {
      action: String(profile.locker_sync_payload?.action || 'lock').trim().toLowerCase(),
      sourcePortal: 'admin_phone_locker_diagnose'
    });

    sendJson(res, 200, {
      product: {
        id: product.id,
        productType: product.product_type || 'phone',
        productModel: product.product_model || '',
        imei1: product.imei_1 || profile.imei_1 || '',
        imei2: product.imei_2 || profile.imei_2 || '',
        lockerId: product.locker_id || profile.locker_id || '',
        lockerProvider,
        providerState: refreshed?.providerState || profile.provider_state || '',
        providerLockStatus: refreshed?.providerLockStatus || profile.provider_lock_status || refreshed?.finalDeviceState || profile.final_device_state || profile.lock_status || profile.honor_lock_status || profile.locker_sync_status || '',
        finalDeviceState: refreshed?.finalDeviceState || profile.final_device_state || refreshed?.providerLockStatus || profile.provider_lock_status || profile.lock_status || profile.honor_lock_status || '',
        providerTaskId: refreshed?.providerTaskId || profile.provider_task_id || profile.honor_task_id || '',
        providerRequestId: refreshed?.providerRequestId || profile.provider_request_id || '',
        providerResponse: refreshed?.providerResponse || profile.provider_response || null,
        providerErrorCode: refreshed?.providerErrorCode || profile.provider_error_code || '',
        providerErrorMessage: refreshed?.providerErrorMessage || profile.provider_error_message || '',
        syncStatus: refreshed?.syncStatus || profile.sync_status || profile.locker_sync_status || '',
        commandStatus: refreshed?.commandStatus || profile.command_status || '',
        lastProviderSyncAt: refreshed?.lastProviderSyncAt || profile.last_provider_sync_at || profile.locker_last_synced_at || '',
        lastCommandAt: refreshed?.lastCommandAt || profile.last_command_at || profile.locker_last_request_at || profile.last_lock_request_at || '',
        lastVerifiedAt: refreshed?.lastVerifiedAt || profile.last_verified_at || '',
        unlockUntilAt: refreshed?.unlockUntilAt || profile.unlock_until_at || '',
        honorTaskId: refreshed?.honorTaskId || profile.honor_task_id || '',
        lockStatus: refreshed?.providerLockStatus || refreshed?.finalDeviceState || refreshed?.lockStatus || profile.provider_lock_status || profile.final_device_state || profile.lock_status || profile.honor_lock_status || profile.locker_sync_status || '',
        honorLockStatus: refreshed?.providerLockStatus || refreshed?.honorLockStatus || profile.provider_lock_status || profile.honor_lock_status || profile.locker_sync_status || '',
        honorDeviceState: refreshed?.providerLockStatus || refreshed?.finalDeviceState || refreshed?.honorDeviceState || profile.provider_lock_status || profile.final_device_state || profile.honor_lock_status || profile.lock_status || '',
        honorLastResponse: refreshed?.honorLastResponse || profile.honor_last_response || profile.provider_response || null,
        lastLockRequestAt: refreshed?.lastLockRequestAt || profile.last_lock_request_at || profile.locker_last_request_at || profile.last_command_at || '',
        lockerSyncStatus: refreshed?.lockerSyncStatus || profile.locker_sync_status || profile.sync_status || ''
      },
      registeredId: resolvedRegisteredId,
      rawTask,
      refreshed,
      taskRows: Array.isArray(rawTask?.rows) ? rawTask.rows : [],
      taskBody: rawTask?.body || null
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      message: error.message,
      requestId: error.requestId || null,
      phoneLockerError: error.response || null,
      honorError: error.response || null
    });
  }
}
