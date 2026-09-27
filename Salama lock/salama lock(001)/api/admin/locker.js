import { readJson, sendJson } from '../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../_lib/security.js';
import { getSupabase, requirePortalUser } from '../_lib/supabase.js';
import { syncPhoneLockerForProduct, resolveTrustonicPhoneLockerDeviceUid } from '../_lib/database.js';
import { phoneLockerDiagnostics } from '../_lib/phone-locker.js';

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

async function audit(user, action, targetTable, targetId, details = {}) {
  await getSupabase().from('admin_audit_logs').insert({
    actor_user_id: user.id,
    actor_email: user.email,
    action,
    target_table: targetTable,
    target_id: targetId,
    details
  });
}

async function findProduct({ productId, registeredId }) {
  if (productId) {
    const result = await getSupabase()
      .from('inventory_products')
      .select('*')
      .eq('id', productId)
      .maybeSingle();

    if (result.error) throw result.error;
    if (result.data) return result.data;
  }

  if (registeredId) {
    for (const column of ['imei_1', 'imei_2', 'serial_number', 'chassis_number', 'locker_id']) {
      const result = await getSupabase()
        .from('inventory_products')
        .select('*')
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
          .select('*')
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
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET,POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    const user = await requirePortalUser(req, ['admin']);

    if (req.method === 'GET') {
      const [integrationsResult] = await Promise.all([
        getSupabase()
          .from('phone_locker_integrations')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(50)
      ]);

      if (integrationsResult.error) throw integrationsResult.error;

      let phoneProductsResult = await getSupabase()
        .from('inventory_products')
        .select('*, image_url, inventory_phone_profiles(*)')
        .eq('product_type', 'phone')
        .order('updated_at', { ascending: false })
        .limit(100);

      if (phoneProductsResult.error) {
        const message = String(phoneProductsResult.error.message || '').toLowerCase();
        if (message.includes('image_url') || message.includes('lock_reason') || message.includes('last_sync_at')) {
          phoneProductsResult = await getSupabase()
            .from('inventory_products')
            .select('*, inventory_phone_profiles(*)')
            .eq('product_type', 'phone')
            .order('updated_at', { ascending: false })
            .limit(100);
        }
      }

      if (phoneProductsResult.error) throw phoneProductsResult.error;

      sendJson(res, 200, {
        diagnostics: phoneLockerDiagnostics(),
        integrations: integrationsResult.data || [],
        phoneProducts: await Promise.all((phoneProductsResult.data || []).map(async (item) => {
          const phoneProfile = Array.isArray(item.inventory_phone_profiles)
            ? item.inventory_phone_profiles[0] || {}
            : item.inventory_phone_profiles || {};

          return {
            ...item,
            imageUrl: item.image_url || '',
            lockerProvider: resolveRouteLockerProvider(item, phoneProfile),
            providerState: phoneProfile.provider_state || item.provider_state || phoneProfile.honor_device_state || item.honor_device_state || '',
            providerLockStatus: phoneProfile.provider_lock_status || item.provider_lock_status || phoneProfile.final_device_state || item.final_device_state || phoneProfile.lock_status || item.lock_status || phoneProfile.honor_lock_status || item.honor_lock_status || '',
            finalDeviceState: phoneProfile.final_device_state || item.final_device_state || phoneProfile.provider_lock_status || item.provider_lock_status || phoneProfile.lock_status || item.lock_status || '',
            providerTaskId: phoneProfile.provider_task_id || item.provider_task_id || phoneProfile.honor_task_id || item.honor_task_id || '',
            providerRequestId: phoneProfile.provider_request_id || item.provider_request_id || '',
            providerResponse: phoneProfile.provider_response || item.provider_response || null,
            providerErrorCode: phoneProfile.provider_error_code || item.provider_error_code || '',
            providerErrorMessage: phoneProfile.provider_error_message || item.provider_error_message || '',
            syncStatus: phoneProfile.sync_status || item.sync_status || phoneProfile.locker_sync_status || item.locker_sync_status || '',
            commandStatus: phoneProfile.command_status || item.command_status || '',
            lastProviderSyncAt: phoneProfile.last_provider_sync_at || item.last_provider_sync_at || phoneProfile.locker_last_synced_at || item.locker_last_synced_at || '',
            lastCommandAt: phoneProfile.last_command_at || item.last_command_at || phoneProfile.locker_last_request_at || phoneProfile.last_lock_request_at || item.locker_last_request_at || item.last_lock_request_at || '',
            lastVerifiedAt: phoneProfile.last_verified_at || item.last_verified_at || '',
            unlockUntilAt: phoneProfile.unlock_until_at || item.unlock_until_at || '',
            honorTaskId: phoneProfile.honor_task_id || item.honor_task_id || '',
            lockStatus: phoneProfile.provider_lock_status || item.provider_lock_status || phoneProfile.final_device_state || item.final_device_state || phoneProfile.lock_status || item.lock_status || phoneProfile.honor_lock_status || item.honor_lock_status || phoneProfile.locker_sync_status || item.locker_sync_status || '',
            honorLockStatus: phoneProfile.provider_lock_status || item.provider_lock_status || phoneProfile.honor_lock_status || item.honor_lock_status || phoneProfile.locker_sync_status || item.locker_sync_status || '',
            honorDeviceState: phoneProfile.provider_lock_status || item.provider_lock_status || phoneProfile.final_device_state || item.final_device_state || phoneProfile.honor_lock_status || item.honor_lock_status || phoneProfile.lock_status || item.lock_status || '',
            honorLastResponse: phoneProfile.honor_last_response || item.honor_last_response || phoneProfile.provider_response || item.provider_response || null,
            lockerSyncStatus: phoneProfile.locker_sync_status || item.locker_sync_status || phoneProfile.sync_status || item.sync_status || '',
            lockerLastSyncedAt: phoneProfile.locker_last_synced_at || item.locker_last_synced_at || '',
            lockerLastError: phoneProfile.locker_last_error || item.locker_last_error || phoneProfile.provider_error_message || item.provider_error_message || '',
            lockerLastRequestAt: phoneProfile.locker_last_request_at || phoneProfile.last_lock_request_at || item.locker_last_request_at || item.last_lock_request_at || phoneProfile.last_command_at || item.last_command_at || '',
            lastLockRequestAt: phoneProfile.last_lock_request_at || phoneProfile.locker_last_request_at || item.last_lock_request_at || item.locker_last_request_at || phoneProfile.last_command_at || item.last_command_at || '',
            lockReason: phoneProfile.lock_reason || item.lock_reason || '',
            lockedAt: phoneProfile.locked_at || item.locked_at || '',
            unlockedAt: phoneProfile.unlocked_at || item.unlocked_at || '',
            lastSyncAt: phoneProfile.last_sync_at || item.last_sync_at || '',
            lockerAppId: phoneProfile.locker_app_id || item.locker_app_id || '',
            lockerSyncPayload: phoneProfile.locker_sync_payload || item.locker_sync_payload || {}
          };
        }))
      });
      return;
    }

    assertBodySize(req);
    await assertRateLimit(req, { scope: 'admin-phone-locker', limit: 20, windowMs: 60_000 });

    const body = await readJson(req);
    const action = String(body.action || 'sync').trim().toLowerCase();
    const registeredId = String(body.registeredId || body.registered_id || body.lockerId || body.locker_id || '').trim();
    const productId = String(body.productId || body.product_id || '').trim();
    const reason = String(body.reason || '').trim();

    if (!['register', 'lock', 'unlock', 'sync'].includes(action)) {
      sendJson(res, 400, { message: 'Choose register, lock, unlock, or sync.' });
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
    const resolvedRegisteredId = resolveRouteLockerProvider(product, profile) === 'trustonic'
      ? resolveTrustonicPhoneLockerDeviceUid(product, profile) || registeredId
      : product.imei_1 || product.serial_number || product.locker_id || registeredId || null;

    const result = await syncPhoneLockerForProduct(product, {
      action,
      state: body.state || undefined,
      sourcePortal: 'admin_phone_locker_api',
      reason,
      metadata: {
        requestedBy: user.email,
        requestType: 'admin_locker_api'
      }
    });

    await audit(user, `phone_locker_${action}`, 'inventory_products', product.id, {
      registeredId: resolvedRegisteredId,
      result
    }).catch(() => null);

    sendJson(res, 200, {
      product,
      lockerResult: result,
      diagnostics: phoneLockerDiagnostics()
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
