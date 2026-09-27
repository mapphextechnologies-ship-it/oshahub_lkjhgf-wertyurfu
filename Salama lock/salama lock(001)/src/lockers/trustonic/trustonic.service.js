import * as trustonic from '../../../api/_lib/trustonic.js';
import {
  mapProviderState as mapPhoneLockerProviderState,
  validateProviderCommandResponse as validatePhoneLockerCommandResponse
} from '../phone-locker.state.js';

const TRUSTONIC_ENDPOINTS = {
  token: '/api/v2/authorization/token',
  register: '/api/v2/inventory/upload',
  update: '/api/v2/device/updateExpiration',
  release: '/api/v2/device/release',
  status: '/api/v2/query/devices',
  notify: '/api/v2/device/notify',
  pin: '/api/v2/device/pinunlock'
};

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeDeviceUid(options = {}) {
  return normalizeText(
    options.imei ||
    options.deviceUid ||
    options.registeredId ||
    options.lockerId ||
    options.product?.locker_id ||
    options.product?.lockerId ||
    options.product?.imei_1 ||
    options.product?.imei1 ||
    ''
  );
}

function normalizeEpochTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new Error('Trustonic expiration must be an integer epoch timestamp.');
  }
  return numeric;
}

function epochToMilliseconds(value) {
  return value < 1e11 ? value * 1000 : value;
}

function resolveStrictDeviceUid(options = {}) {
  const uid = normalizeDeviceUid(options);
  if (!uid) {
    throw new Error('Trustonic deviceUid must be provided.');
  }

  return uid;
}

function buildStatusPayload(deviceUid) {
  return {
    deviceList: deviceUid ? [{ deviceUid }] : []
  };
}

function buildNotificationPayload(deviceUid, notification = {}) {
  return {
    messageList: deviceUid
      ? [
          {
            deviceUid,
            notificationTitle: normalizeText(notification.notificationTitle || notification.title || 'Payment reminder'),
            notificationType: normalizeText(notification.notificationType || notification.type || 'headsup') || 'headsup',
            notificationContent: normalizeText(notification.notificationContent || notification.content || notification.message || ''),
            ...(notification.messageTemplateId ? { messageTemplateId: normalizeText(notification.messageTemplateId) } : {})
          }
        ]
      : []
  };
}

function buildPinUnlockPayload(deviceUid, challenge) {
  return {
    pinUnlockList: deviceUid
      ? [
          {
            deviceUid,
            challenge: normalizeText(challenge)
          }
        ]
      : []
  };
}

function buildUpdateExpirationPayload(deviceUid, expiration, action = 'lock') {
  if (!deviceUid) {
    throw new Error('Trustonic deviceUid must be provided.');
  }

  const resolvedExpiration = normalizeEpochTimestamp(expiration);
  if (action === 'unlock' && epochToMilliseconds(resolvedExpiration) <= Date.now()) {
    throw new Error('Trustonic expiration must be a future epoch timestamp.');
  }

  return {
    updateExpirationList: [
      {
        deviceUid,
        expiration: resolvedExpiration
      }
    ]
  };
}

export function diagnostics() {
  return trustonic.trustonicDiagnostics();
}

export function authenticate() {
  if (typeof trustonic.authenticateTrustonic === 'function') {
    return trustonic.authenticateTrustonic();
  }

  return Promise.resolve(trustonic.trustonicDiagnostics());
}

export function buildRegistrationPayload(options = {}) {
  return trustonic.buildTrustonicRegistrationPayload(options);
}

export function buildLockPolicy(options = {}) {
  return trustonic.buildLockPolicy(options);
}

export function buildUnlockPolicy(options = {}) {
  return trustonic.buildUnlockPolicy(options);
}

export async function enrollDevice({ product = {}, customer = null, payment = null, body, timeoutMs } = {}) {
  return trustonic.importDevice({
    body,
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
  const deviceUid = resolveStrictDeviceUid({ imei, product });
  const resolvedExpiration = normalizeEpochTimestamp(expiration);
  const expirationMs = epochToMilliseconds(resolvedExpiration);
  const action = expirationMs > Date.now() ? 'unlock' : 'lock';
  return trustonic.trustonicRequest({
    method: 'POST',
    path: trustonic.validateTrustonicEnvironment().updatePath,
    body: buildUpdateExpirationPayload(deviceUid, resolvedExpiration, action),
    timeoutMs,
    action
  });
}

export async function sendNotification(imei, notification = {}, { timeoutMs } = {}) {
  const deviceUid = resolveStrictDeviceUid({ imei });
  function buildSkipResult(response = null, error = null) {
    return {
      success: false,
      skipped: true,
      skipReason: 'device-state-notify-unsupported',
      note: 'notification skipped because the device state does not allow action delivery',
      provider: 'trustonic',
      requestId: response?.requestId || error?.requestId || null,
      url: response?.url || error?.url || trustonic.validateTrustonicEnvironment().notifyPath,
      status: response?.status || error?.statusCode || error?.response?.status || 409,
      body: response?.body || error?.response || null,
      taskId: response?.taskId || deviceUid,
      executionTimeMs: response?.executionTimeMs || error?.executionTimeMs || 0
    };
  }

  try {
    const response = await trustonic.trustonicRequest({
      method: 'POST',
      path: trustonic.validateTrustonicEnvironment().notifyPath,
      body: buildNotificationPayload(deviceUid, notification),
      timeoutMs,
      action: 'notify'
    });

    const message = String(
      response?.body?.message ||
      response?.body?.msg ||
      response?.body?.resultMessage ||
      response?.body?.warningMessage ||
      ''
    ).toLowerCase();
    if (
      message.includes('state transition') ||
      message.includes('unable to assign action') ||
      message.includes('current state of the device') ||
      message.includes('operation is not allowed in the current state') ||
      message.includes('please wait for the action complete')
    ) {
      return buildSkipResult(response);
    }

    return response;
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    const isStateRejection =
      message.includes('unable to assign action') ||
      message.includes('state transition') ||
      message.includes('current state of the device') ||
      message.includes('operation is not allowed in the current state') ||
      message.includes('please wait for the action complete');

    if (isStateRejection) {
      return buildSkipResult(null, error);
    }

    throw error;
  }
}

export async function releaseDevice(imei, { timeoutMs } = {}) {
  const deviceUid = resolveStrictDeviceUid({ imei });
  return trustonic.releaseDevice({
    deviceUid,
    timeoutMs
  });
}

export async function getDeviceStatus(imei, { timeoutMs } = {}) {
  return trustonic.queryDevice({
    registeredId: resolveStrictDeviceUid({ imei }),
    timeoutMs
  });
}

export async function offlineUnlock(imei, challenge, { timeoutMs } = {}) {
  const deviceUid = resolveStrictDeviceUid({ imei });
  const response = await trustonic.trustonicRequest({
    method: 'POST',
    path: trustonic.validateTrustonicEnvironment().pinPath,
    body: buildPinUnlockPayload(deviceUid, challenge),
    timeoutMs,
    action: 'unlock'
  });

  return String(
    response?.body?.pin ||
    response?.body?.pinCode ||
    response?.body?.passcode ||
    response?.body?.challenge ||
    response?.requestId ||
    response?.taskId ||
    normalizeText(challenge)
  );
}

export const importDevice = (args = {}) => trustonic.importDevice(args);
export const deliverLock = (args = {}) => trustonic.deliverLock(args);
export const unlockDevice = (args = {}) => trustonic.unlockDevice(args);
export const queryTask = (args = {}) => trustonic.queryTask(args);
export const queryDevice = (args = {}) => trustonic.queryDevice(args);
export const lockDevice = (args = {}) => trustonic.deliverLock(args);
export const unlockOrExtendDevice = (args = {}) => trustonic.unlockDevice(args);
export const mapProviderState = (providerResponse = {}, context = {}) => mapPhoneLockerProviderState('trustonic', providerResponse, context);
export const validateProviderCommandResponse = (providerResponse = {}, context = {}) => validatePhoneLockerCommandResponse('trustonic', providerResponse, context);
