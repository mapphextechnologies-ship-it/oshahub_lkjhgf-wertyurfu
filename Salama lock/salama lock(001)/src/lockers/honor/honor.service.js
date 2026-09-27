import * as honor from '../../../api/_lib/honor.js';
import {
  mapProviderState as mapPhoneLockerProviderState,
  validateProviderCommandResponse as validatePhoneLockerCommandResponse
} from '../phone-locker.state.js';

const HONOR_ENDPOINTS = {
  authenticate: '/api/devicelock/v1/devices/import',
  register: '/api/devicelock/v1/devices/import',
  lock: '/api/devicelock/v1/lock/deliver',
  unlock: '/api/devicelock/v1/unlock/deliver',
  status: '/api/devicelock/v1/devices',
  tasks: '/api/devicelock/v1/devices/operationlogs',
  remind: '/api/devicelock/v1/remind/deliver',
  unbind: '/api/devicelock/v1/unbind/deliver'
};

function normalizeText(value) {
  return String(value || '').trim();
}

function limitText(value, maxLength) {
  const text = normalizeText(value);
  if (!maxLength || text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function normalizeDeviceIds(value) {
  return [...new Set((Array.isArray(value) ? value : [value]).map((item) => String(item || '').trim()).filter(Boolean))];
}

function normalizeShowType(value) {
  if (value === 1 || value === '1') return 1;
  if (value === 0 || value === '0') return 0;

  const normalized = normalizeText(value).toLowerCase().replace(/[\s_-]+/g, '');
  if (['fullscreen', 'full', 'screen'].includes(normalized)) return 1;
  return 0;
}

export function buildRemindPolicy(notification = {}) {
  const config = honor.validateHonorEnvironment();
  const title = notification.title || notification.notificationTitle || 'Payment reminder';
  const content = notification.content || notification.notificationContent || notification.message || 'Your device status has been updated.';
  const contactNumber = normalizeText(notification.contactNumber || config.contactNumber);

  return {
    title: limitText(title, 20),
    content: limitText(content, 1000),
    showType: normalizeShowType(notification.showType ?? notification.notificationType ?? notification.type),
    ...(contactNumber ? { contactNumber } : {})
  };
}

function buildDiagnostics() {
  try {
    const config = honor.validateHonorEnvironment();
    return {
      provider: 'honor',
      configured: Boolean(config.apiBase && config.appId && config.appKey),
      baseUrl: config.apiBase,
      appIdConfigured: Boolean(config.appId),
      appIdMasked: config.appId ? `${config.appId.slice(0, 4)}...${config.appId.slice(-4)}` : '',
      appKeyConfigured: Boolean(config.appKey),
      appKeyMasked: config.appKey ? `${config.appKey.slice(0, 4)}...${config.appKey.slice(-4)}` : '',
      signAlgorithm: config.signAlgorithm,
      registerPath: HONOR_ENDPOINTS.register,
      lockPath: HONOR_ENDPOINTS.lock,
      unlockPath: HONOR_ENDPOINTS.unlock,
      statusPath: HONOR_ENDPOINTS.status,
      syncPath: HONOR_ENDPOINTS.tasks,
      remindPath: HONOR_ENDPOINTS.remind,
      remindPolicySchema: 'title-content-showType-v1',
      unbindPath: HONOR_ENDPOINTS.unbind,
      appIdHeader: 'X-RY-ID',
      appKeyHeader: 'X-RY-SIGN',
      includeCredentialsInBody: false,
      timeoutMs: config.timeoutMs,
      contactNumberConfigured: Boolean(config.contactNumber),
      supportEmailConfigured: Boolean(config.supportEmail)
    };
  } catch {
    return {
      provider: 'honor',
      configured: false,
      baseUrl: '',
      appIdConfigured: false,
      appIdMasked: '',
      appKeyConfigured: false,
      appKeyMasked: '',
      signAlgorithm: 'SHA256',
      registerPath: HONOR_ENDPOINTS.register,
      lockPath: HONOR_ENDPOINTS.lock,
      unlockPath: HONOR_ENDPOINTS.unlock,
      statusPath: HONOR_ENDPOINTS.status,
      syncPath: HONOR_ENDPOINTS.tasks,
      remindPath: HONOR_ENDPOINTS.remind,
      remindPolicySchema: 'title-content-showType-v1',
      unbindPath: HONOR_ENDPOINTS.unbind,
      appIdHeader: 'X-RY-ID',
      appKeyHeader: 'X-RY-SIGN',
      includeCredentialsInBody: false,
      timeoutMs: 15_000,
      contactNumberConfigured: false,
      supportEmailConfigured: false
    };
  }
}

export function diagnostics() {
  return buildDiagnostics();
}

export function authenticate() {
  return Promise.resolve(buildDiagnostics());
}

export function buildRegistrationPayload(options = {}) {
  return {
    provider: 'honor',
    ...honor.buildHonorRegistrationPayload(options)
  };
}

export function buildLockPolicy(options = {}) {
  return honor.buildLockPolicy(options);
}

export function buildUnlockPolicy(options = {}) {
  return honor.buildUnlockPolicy(options);
}

export async function enrollDevice({ product = {}, customer = null, payment = null, body, timeoutMs } = {}) {
  const payload = body && typeof body === 'object'
    ? body
    : honor.buildHonorRegistrationPayload({ product, customer });

  const deviceIds = normalizeDeviceIds(
    payload.deviceInfos?.flat?.()?.[0] ||
    payload.deviceId ||
    product?.imei_1 ||
    product?.serial_number ||
    product?.chassis_number ||
    product?.locker_id
  );

  return honor.importDevice({
    deviceInfos: payload.deviceInfos || [deviceIds],
    registeredIds: deviceIds,
    body: payload,
    product,
    customer,
    payment,
    timeoutMs
  });
}

export async function updateExpiration({
  imei,
  expiration,
  product = {},
  customer = null,
  payment = null,
  timeoutMs
} = {}) {
  const deviceId = normalizeText(
    imei ||
    product?.imei_1 ||
    product?.imei1 ||
    product?.serial_number ||
    product?.chassis_number ||
    product?.locker_id
  );
  const expirationTime = Number(expiration);
  const shouldUnlock = Number.isFinite(expirationTime) ? expirationTime > Date.now() : true;

  if (shouldUnlock) {
    return honor.unlockDevice({
      registeredIds: normalizeDeviceIds(deviceId),
      unlockPolicy: buildUnlockPolicy({
        product,
        customer,
        payment,
        content: `Device ${deviceId || 'phone'} expiration was extended.`
      }),
      timeoutMs
    });
  }

  return honor.deliverLock({
    registeredIds: normalizeDeviceIds(deviceId),
    lockPolicy: buildLockPolicy({
      product,
      customer,
      payment,
      content: 'Payment is overdue. Device access is restricted.'
    }),
    timeoutMs
  });
}

export async function sendNotification(imei, notification = {}, { timeoutMs } = {}) {
  const deviceId = normalizeText(imei);
  return honor.honorRequest({
    method: 'POST',
    path: HONOR_ENDPOINTS.remind,
    body: {
      registeredIds: normalizeDeviceIds(deviceId),
      remindPolicy: buildRemindPolicy(notification)
    },
    timeoutMs
  });
}

export async function releaseDevice(imei, { timeoutMs } = {}) {
  const deviceId = normalizeText(imei);
  return honor.honorRequest({
    method: 'POST',
    path: HONOR_ENDPOINTS.unbind,
    body: {
      registeredIds: normalizeDeviceIds(deviceId),
      unbindPolicy: {
        deactivateReason: 'other',
        content: `Device ${deviceId || ''} released from financing.`.trim()
      }
    },
    timeoutMs
  });
}

export async function getDeviceStatus(imei, { timeoutMs } = {}) {
  return honor.queryDevice({
    registeredId: normalizeText(imei),
    timeoutMs
  });
}

export async function offlineUnlock(imei, challenge, { timeoutMs } = {}) {
  const deviceId = normalizeText(imei);
  const result = await honor.unlockDevice({
    registeredIds: normalizeDeviceIds(deviceId),
    unlockPolicy: buildUnlockPolicy({
      content: normalizeText(challenge) || 'Offline unlock approved.'
    }),
    timeoutMs
  });

  return String(
    result?.requestId ||
    result?.taskId ||
    result?.body?.requestId ||
    result?.body?.taskId ||
    normalizeText(challenge)
  );
}

export const importDevice = (args = {}) => honor.importDevice(args);
export const deliverLock = (args = {}) => honor.deliverLock(args);
export const unlockDevice = (args = {}) => honor.unlockDevice(args);
export const queryTask = (args = {}) => honor.queryTask(args);
export const queryDevice = (args = {}) => honor.queryDevice(args);
export const lockDevice = (args = {}) => honor.deliverLock(args);
export const unlockOrExtendDevice = (args = {}) => honor.unlockDevice(args);
export const mapProviderState = (providerResponse = {}, context = {}) => mapPhoneLockerProviderState('honor', providerResponse, context);
export const validateProviderCommandResponse = (providerResponse = {}, context = {}) => validatePhoneLockerCommandResponse('honor', providerResponse, context);
