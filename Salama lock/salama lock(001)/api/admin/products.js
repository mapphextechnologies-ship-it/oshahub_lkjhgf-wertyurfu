import { readJson, sendJson } from '../_lib/http.js';
import { assertBodySize, assertPositiveNumber, assertRateLimit, assertRequiredTextFields } from '../_lib/security.js';
import { getSupabase, requirePortalUser } from '../_lib/supabase.js';
import { syncPhoneLockerForProduct } from '../_lib/database.js';

const PHONE_LOCKER_SYNC_TIMEOUT_MS = 5000;

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

async function resolveAssignedAgent({ assignedAgentId = '', assignedAgentCode = '' } = {}) {
  const agentId = String(assignedAgentId || '').trim();
  const agentCode = String(assignedAgentCode || '').trim();

  if (!agentId && !agentCode) return null;

  if (agentId) {
    const result = await getSupabase()
      .from('agents')
      .select('id,agent_code,full_name,agent_name,status')
      .eq('id', agentId)
      .maybeSingle();
    if (result.error) throw result.error;
    if (result.data) return result.data;
  }

  if (agentCode) {
    const byCode = await getSupabase()
      .from('agents')
      .select('id,agent_code,full_name,agent_name,status')
      .ilike('agent_code', agentCode)
      .maybeSingle();
    if (byCode.error) throw byCode.error;
    if (byCode.data) return byCode.data;

    const byEmail = await getSupabase()
      .from('agents')
      .select('id,agent_code,full_name,agent_name,status')
      .ilike('email', agentCode)
      .maybeSingle();
    if (byEmail.error) throw byEmail.error;
    if (byEmail.data) return byEmail.data;
  }

  return null;
}

function normalizeAdminProductType(value) {
  const type = String(value || 'bike').trim().toLowerCase();
  if (['phone', 'phones'].includes(type)) return 'phone';
  if (['bike', 'bikes', 'product', 'products', ''].includes(type)) return 'bike';
  return '';
}

function uniqueColumnsForProductType(productType) {
  return productType === 'phone'
    ? ['imei_1', 'imei_2', 'locker_id']
    : ['serial_number', 'chassis_number'];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'admin-products', limit: 20, windowMs: 60_000 });
    const user = await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const productType = normalizeAdminProductType(body.productType || body.product_type || body.type);
    const productModel = String(body.productModel || '').trim();
    const imageUrl = String(body.imageUrl || body.image_url || '').trim();
    const serialNumber = String(body.serialNumber || '').trim();
    const chassisNumber = String(body.chassisNumber || '').trim();
    const imei1 = String(body.imei1 || body.imei_1 || '').trim();
    const imei2 = String(body.imei2 || body.imei_2 || '').trim();
    const lockerId = String(body.lockerId || body.locker_id || '').trim();
    const lockerProviderRaw = String(body.lockerProvider || body.locker_provider || 'honor').trim().toLowerCase();
    const lockerProvider = ['trustonic', 'trust', 'ttp', 'telecoms-platform', 'trustonic-v2'].includes(lockerProviderRaw)
      ? 'trustonic'
      : 'honor';
    const branch = String(body.branch || 'Main').trim() || 'Main';
    const assignedAgentId = String(body.assignedAgentId || body.assigned_agent_id || '').trim();
    const assignedAgentCode = String(body.assignedAgentCode || body.assigned_agent_code || '').trim();
    const totalPayable = assertPositiveNumber(body.totalPayable || body.total_payable, 'total payable amount');
    let assignedAgent = null;
    const uniqueColumns = uniqueColumnsForProductType(productType);

    if (!productType) {
      sendJson(res, 400, { message: 'Product type must be bike or phone.' });
      return;
    }

    assertRequiredTextFields({
      'product type': productType,
      'product model': productModel,
      branch
    });

    if (productType === 'phone') {
      assertRequiredTextFields({
        'imei 1': imei1
      });
    } else {
      assertRequiredTextFields({
        'serial number': serialNumber
      });
    }

    if (productType === 'phone') {
      const normalizedImeis = [imei1, imei2].filter(Boolean);
      if (normalizedImeis.length === 0) {
        sendJson(res, 400, { message: 'At least one IMEI is required for a phone.' });
        return;
      }

      for (const value of normalizedImeis) {
        if (!/^\d{15}$/.test(value)) {
          sendJson(res, 400, { message: 'Phone IMEI values must contain exactly 15 digits.' });
          return;
        }
      }
    }

    async function ensureUniqueIdentifier(value, label) {
      if (!value) return;
      for (const column of uniqueColumns) {
        const existing = await getSupabase()
          .from('inventory_products')
          .select('id,product_model,product_type,serial_number,chassis_number,imei_1,imei_2,locker_id')
          .eq(column, value)
          .limit(1);
        if (existing.error) throw existing.error;
        if ((existing.data || []).length > 0) {
          sendJson(res, 409, { message: `${label} already exists on another inventory record.` });
          throw new Error('duplicate');
        }
      }
    }

    try {
      if (productType === 'phone') {
        await ensureUniqueIdentifier(imei1, 'IMEI 1');
        await ensureUniqueIdentifier(imei2, 'IMEI 2');
        await ensureUniqueIdentifier(lockerId, 'Locker ID');
      } else {
        await ensureUniqueIdentifier(serialNumber, 'Serial number');
        await ensureUniqueIdentifier(chassisNumber, 'Chassis number');
      }
    } catch (uniqueError) {
      if (uniqueError.message === 'duplicate') return;
      throw uniqueError;
    }

    if (assignedAgentId || assignedAgentCode) {
      assignedAgent = await resolveAssignedAgent({ assignedAgentId, assignedAgentCode });
      if (!assignedAgent) {
        sendJson(res, 404, { message: 'Assigned agent was not found.' });
        return;
      }
    }

    const insertPayload = {
      product_type: productType,
      product_model: productModel,
      total_payable: totalPayable,
      image_url: productType === 'phone' ? null : (imageUrl || null),
      serial_number: productType === 'phone' ? null : (serialNumber || null),
      chassis_number: productType === 'phone' ? null : (chassisNumber || null),
      imei_1: productType === 'phone' ? (imei1 || null) : null,
      imei_2: productType === 'phone' ? (imei2 || null) : null,
      locker_id: productType === 'phone' ? (lockerId || null) : null,
      ...(productType === 'phone' ? { locker_provider: lockerProvider } : {}),
      branch,
      assigned_agent_id: assignedAgent?.id || null,
      assigned_agent_code: assignedAgent?.agent_code || assignedAgentCode || null,
      status: String(body.status || (assignedAgent ? 'assigned' : 'available')).trim().toLowerCase() || (assignedAgent ? 'assigned' : 'available'),
      source_portal: 'admin'
    };

    let inserted = await getSupabase()
      .from('inventory_products')
      .insert(insertPayload)
      .select()
      .single();

    if (inserted.error && String(inserted.error.message || '').toLowerCase().includes('image_url')) {
      const { image_url, ...fallbackPayload } = insertPayload;
      inserted = await getSupabase()
        .from('inventory_products')
        .insert(fallbackPayload)
        .select()
        .single();
    }

    if (inserted.error) throw inserted.error;

    const data = inserted.data;
    let lockerSyncResult = null;
    if (productType === 'phone') {
      try {
        const lockerSyncPromise = syncPhoneLockerForProduct(data, {
          action: 'register',
          state: 'registered',
          sourcePortal: 'admin_product_creation',
          reason: 'Phone inventory created in admin portal.'
        }).catch((lockerError) => ({
          success: false,
          action: 'register',
          status: 'failed',
          error: lockerError.message || String(lockerError),
          response: lockerError.response || null
        }));

        lockerSyncResult = await Promise.race([
          lockerSyncPromise,
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                success: true,
                queued: true,
                action: 'register',
                status: 'queued',
                reason: 'locker_sync_took_too_long'
              });
            }, PHONE_LOCKER_SYNC_TIMEOUT_MS);
          })
        ]);

        if (lockerSyncResult?.queued) {
          void lockerSyncPromise.then((result) => {
            console.info('[admin-product-locker-sync-complete]', {
              productId: data.id,
              productType,
              lockerProvider,
              result
            });
          }).catch((error) => {
            console.warn('[admin-product-locker-sync-failed]', {
              productId: data.id,
              productType,
              lockerProvider,
              error: error?.message || error
            });
          });
        }
      } catch (lockerError) {
        lockerSyncResult = {
          success: false,
          action: 'register',
          status: 'failed',
          error: lockerError.message || String(lockerError),
          response: lockerError.response || null
        };
      }
    }
    await audit(user, 'product_created', 'inventory_products', data.id, {
      productType,
      productModel,
      totalPayable,
      imageUrl: productType === 'phone' ? null : (imageUrl || null),
      imei1: imei1 || null,
      imei2: imei2 || null,
      lockerId: lockerId || null,
      lockerProvider: productType === 'phone' ? lockerProvider : null,
      assignedAgentId: assignedAgent?.id || null,
      assignedAgentCode: assignedAgent?.agent_code || assignedAgentCode || null
    });
    sendJson(res, 201, {
      success: true,
      product: data,
      customerId: data.assigned_customer_id || null,
      deviceId: productType === 'phone' ? (lockerSyncResult?.registeredId || data.imei_1 || data.id) : data.serial_number || data.id,
      honorTaskId: lockerSyncResult?.providerTaskId || lockerSyncResult?.providerRequestId || lockerSyncResult?.honorTaskId || lockerSyncResult?.requestId || null,
      providerTaskId: lockerSyncResult?.providerTaskId || null,
      providerRequestId: lockerSyncResult?.providerRequestId || null,
      providerState: lockerSyncResult?.providerState || null,
      providerLockStatus: lockerSyncResult?.providerLockStatus || lockerSyncResult?.finalDeviceState || lockerSyncResult?.lockStatus || lockerSyncResult?.honorLockStatus || null,
      finalDeviceState: lockerSyncResult?.finalDeviceState || lockerSyncResult?.providerLockStatus || lockerSyncResult?.honorLockStatus || null,
      syncStatus: lockerSyncResult?.syncStatus || lockerSyncResult?.status || null,
      commandStatus: lockerSyncResult?.commandStatus || null,
      providerResponse: lockerSyncResult?.providerResponse || lockerSyncResult?.response || null,
      providerErrorCode: lockerSyncResult?.providerErrorCode || null,
      providerErrorMessage: lockerSyncResult?.providerErrorMessage || null,
      lastProviderSyncAt: lockerSyncResult?.lastProviderSyncAt || null,
      lastCommandAt: lockerSyncResult?.lastCommandAt || null,
      lastVerifiedAt: lockerSyncResult?.lastVerifiedAt || null,
      unlockUntilAt: lockerSyncResult?.unlockUntilAt || null,
      lockerProvider: productType === 'phone' ? (data.locker_provider || lockerProvider) : null,
      lockStatus: lockerSyncResult?.success
        ? String(lockerSyncResult.finalDeviceState || lockerSyncResult.providerLockStatus || lockerSyncResult.lockStatus || lockerSyncResult.honorLockStatus || lockerSyncResult.status || 'synced').toUpperCase()
        : (productType === 'phone' ? 'REGISTERED' : 'AVAILABLE'),
      lockerSync: lockerSyncResult
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      success: false,
      message: error.message,
      requestId: error.requestId || null,
      honorError: error.response || null
    });
  }
}
