import { readJson, sendJson } from '../../../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../../../_lib/security.js';
import { getSupabase, requirePortalUser } from '../../../_lib/supabase.js';

function normalizeProductType(value) {
  const type = String(value || 'bike').trim().toLowerCase();
  if (['phone', 'phones'].includes(type)) return 'phone';
  return 'bike';
}

function normalizeLockerProvider(value) {
  const providerRaw = String(value || 'honor').trim().toLowerCase();
  return ['trustonic', 'trust', 'ttp', 'telecoms-platform', 'trustonic-v2'].includes(providerRaw)
    ? 'trustonic'
    : 'honor';
}

function nonEmpty(value) {
  return String(value || '').trim();
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

async function assertUniqueInventoryIdentifier({ id, productType, column, value }) {
  if (!value) return;
  const query = await getSupabase()
    .from('inventory_products')
    .select('id')
    .eq(column, value)
    .neq('id', id)
    .limit(1);

  if (query.error) throw query.error;
  if ((query.data || []).length > 0) {
    const label = column.replace(/_/g, ' ');
    const error = new Error(`${label.charAt(0).toUpperCase() + label.slice(1)} already exists on another ${productType} inventory record.`);
    error.statusCode = 409;
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'admin-product-update', limit: 30, windowMs: 60_000 });
    const user = await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const id = req.query?.id || req.url.split('/').slice(-2)[0];

    const productResult = await getSupabase()
      .from('inventory_products')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (productResult.error) throw productResult.error;
    if (!productResult.data) {
      sendJson(res, 404, { message: 'Inventory record was not found.' });
      return;
    }

    const current = productResult.data;
    const productType = normalizeProductType(current.product_type || current.productType || 'bike');
    const productModel = nonEmpty(body.productModel || body.product_model || current.product_model || current.productModel || '');
    const branch = nonEmpty(body.branch || current.branch || 'Main') || 'Main';
    const totalPayableInput = body.totalPayable ?? body.total_payable;
    const totalPayable = totalPayableInput === undefined || totalPayableInput === null || String(totalPayableInput).trim() === ''
      ? Number(current.total_payable || current.totalPayable || 0)
      : Number(String(totalPayableInput).replace(/,/g, '').trim());

    if (!productModel) {
      sendJson(res, 400, { message: 'Product model is required.' });
      return;
    }

    if (!Number.isFinite(totalPayable) || totalPayable <= 0) {
      sendJson(res, 400, { message: 'Enter a valid total payable amount.' });
      return;
    }

    const imageUrl = body.imageUrl ?? body.image_url;
    const serialNumber = productType === 'phone'
      ? nonEmpty(body.serialNumber || body.serial_number || current.serial_number || '')
      : nonEmpty(body.serialNumber || body.serial_number || current.serial_number || '');
    const chassisNumber = productType === 'phone'
      ? nonEmpty(body.chassisNumber || body.chassis_number || current.chassis_number || '')
      : nonEmpty(body.chassisNumber || body.chassis_number || current.chassis_number || '');
    const imei1 = productType === 'phone'
      ? nonEmpty(body.imei1 || body.imei_1 || current.imei_1 || '')
      : '';
    const imei2 = productType === 'phone'
      ? nonEmpty(body.imei2 || body.imei_2 || current.imei_2 || '')
      : '';
    const lockerId = productType === 'phone'
      ? nonEmpty(body.lockerId || body.locker_id || current.locker_id || '')
      : '';
    const lockerProvider = productType === 'phone'
      ? normalizeLockerProvider(body.lockerProvider || body.locker_provider || current.locker_provider || 'honor')
      : null;
    const status = nonEmpty(body.status || current.status || (productType === 'phone' ? 'assigned' : 'available')).toLowerCase() || (productType === 'phone' ? 'assigned' : 'available');

    if (productType === 'phone') {
      if (!imei1) {
        sendJson(res, 400, { message: 'IMEI 1 is required for phone inventory.' });
        return;
      }

      for (const value of [imei1, imei2].filter(Boolean)) {
        if (!/^\d{15}$/.test(value)) {
          sendJson(res, 400, { message: 'Phone IMEI values must contain exactly 15 digits.' });
          return;
        }
      }
    } else if (!serialNumber) {
      sendJson(res, 400, { message: 'Serial number is required for bike inventory.' });
      return;
    }

    if (productType === 'phone') {
      await Promise.all([
        assertUniqueInventoryIdentifier({ id, productType, column: 'imei_1', value: imei1 }),
        assertUniqueInventoryIdentifier({ id, productType, column: 'imei_2', value: imei2 }),
        assertUniqueInventoryIdentifier({ id, productType, column: 'locker_id', value: lockerId })
      ]);
    } else {
      await Promise.all([
        assertUniqueInventoryIdentifier({ id, productType, column: 'serial_number', value: serialNumber }),
        assertUniqueInventoryIdentifier({ id, productType, column: 'chassis_number', value: chassisNumber })
      ]);
    }

    const updatePayload = {
      product_model: productModel,
      total_payable: totalPayable,
      branch,
      status,
      updated_at: new Date().toISOString()
    };

    if (productType === 'phone') {
      updatePayload.image_url = null;
      updatePayload.serial_number = null;
      updatePayload.chassis_number = null;
      updatePayload.imei_1 = imei1;
      updatePayload.imei_2 = imei2 || null;
      updatePayload.locker_id = lockerId || null;
      updatePayload.locker_provider = lockerProvider;
    } else {
      updatePayload.image_url = nonEmpty(imageUrl || current.image_url || '') || null;
      updatePayload.serial_number = serialNumber;
      updatePayload.chassis_number = chassisNumber || null;
    }

    const updatedProductResult = await getSupabase()
      .from('inventory_products')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updatedProductResult.error) throw updatedProductResult.error;

    let updatedCustomer = null;
    const customerId = updatedProductResult.data.assigned_customer_id || current.assigned_customer_id || null;
    if (customerId) {
      const customerResult = await getSupabase()
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .maybeSingle();

      if (customerResult.error) throw customerResult.error;
      if (customerResult.data) {
        const customerUpdatePayload = {
          product_type: productType,
          product_model: productModel,
          bike_model: productType === 'bike' ? productModel : null,
          serial_number: productType === 'phone' ? imei1 : serialNumber,
          chassis_number: productType === 'phone'
            ? nonEmpty(imei2 || customerResult.data.chassis_number || current.chassis_number || '')
            : (chassisNumber || null),
          updated_at: new Date().toISOString()
        };

        const shouldUpdateFinancials = Number.isFinite(totalPayable) && totalPayable > 0 && (
          Number(customerResult.data.total_payable || 0) <= 0
          || String(body.totalPayable ?? body.total_payable ?? '').trim() !== ''
        );

        if (shouldUpdateFinancials) {
          customerUpdatePayload.total_payable = totalPayable;
          customerUpdatePayload.balance = Math.max(totalPayable - Number(customerResult.data.paid_amount || 0), 0);
        }

        const customerUpdateResult = await getSupabase()
          .from('customers')
          .update(customerUpdatePayload)
          .eq('id', customerId)
          .select()
          .single();

        if (customerUpdateResult.error) throw customerUpdateResult.error;
        updatedCustomer = customerUpdateResult.data;
      }
    }

    await audit(user, 'product_updated', 'inventory_products', id, {
      productType,
      productModel,
      totalPayable,
      branch,
      status,
      imageUrl: productType === 'phone' ? null : (nonEmpty(imageUrl || current.image_url || '') || null),
      serialNumber: productType === 'phone' ? null : serialNumber,
      chassisNumber: productType === 'phone' ? null : (chassisNumber || null),
      imei1: productType === 'phone' ? imei1 : null,
      imei2: productType === 'phone' ? (imei2 || null) : null,
      lockerId: productType === 'phone' ? (lockerId || null) : null,
      lockerProvider: productType === 'phone' ? lockerProvider : null,
      assignedCustomerId: customerId
    });

    sendJson(res, 200, {
      success: true,
      product: updatedProductResult.data,
      customer: updatedCustomer,
      lockerSync: {
        skipped: true,
        reason: 'deferred_to_refresh_status'
      }
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
