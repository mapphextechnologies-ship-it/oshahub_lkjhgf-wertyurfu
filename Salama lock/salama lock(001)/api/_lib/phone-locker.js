import {
  createLockerProvider,
  getLockerProviderByName,
  getLockerProviderDiagnostics,
  resolveLockerProviderKey
} from '../../src/lockers/locker.factory.js';

import * as honor from './honor.js';
import * as trustonic from './trustonic.js';

function contextForProvider(context = {}) {
  return context && typeof context === 'object' ? context : {};
}

function providerFor(context = {}) {
  return createLockerProvider(contextForProvider(context));
}

export function resolvePhoneLockerProvider(context = {}) {
  return resolveLockerProviderKey(contextForProvider(context));
}

export function getPhoneLockerProvider(context = {}) {
  return providerFor(context);
}

export function phoneLockerDiagnostics(context = {}) {
  return getLockerProviderDiagnostics(contextForProvider(context));
}

export function phoneLockerBaseUrl(context = {}) {
  return phoneLockerDiagnostics(context).baseUrl || '';
}

export function phoneLockerAppId(context = {}) {
  const provider = resolvePhoneLockerProvider(context);
  if (provider === 'trustonic') {
    try {
      const config = trustonic.validateTrustonicEnvironment();
      return config.tenantId || config.assignedPolicy || config.serviceName || 'trustonic';
    } catch {
      return 'trustonic';
    }
  }

  try {
    return honor.validateHonorEnvironment().appId;
  } catch {
    return '';
  }
}

export function buildPhoneLockerPayload(options = {}) {
  const provider = providerFor(options);
  const action = String(options.action || '').trim().toLowerCase();
  const state = String(options.state || '').trim().toLowerCase();

  if (provider.name === 'trustonic') {
    const payload = provider.buildRegistrationPayload(options);
    return {
      provider: 'trustonic',
      action,
      state: state || String(payload.state || '').trim().toLowerCase(),
      registeredId: payload.deviceUid || payload.registeredId || '',
      lockerId: payload.deviceUid || payload.registeredId || '',
      customerId: payload.customerId || '',
      productId: payload.productId || '',
      deviceUid: payload.deviceUid || '',
      deviceList: payload.deviceList || [],
      imei2: payload.imei2 || null,
      expiry: payload.expiry || null,
      nextDueAt: payload.nextDueAt || null,
      metadata: payload.metadata || {},
      request: payload
    };
  }

  const payload = provider.buildRegistrationPayload(options);
  return {
    provider: 'honor',
    action,
    state: state || String(options.state || '').trim().toLowerCase(),
    registeredId: payload.deviceId || '',
    lockerId: payload.deviceId || '',
    ...payload
  };
}

export async function sendPhoneLockerNotification(imei, notification = {}, context = {}) {
  return providerFor(context).sendNotification(imei, notification);
}

export const buildLockPolicy = (options = {}) => getLockerProviderByName(resolvePhoneLockerProvider(options)).buildLockPolicy(options);
export const buildUnlockPolicy = (options = {}) => getLockerProviderByName(resolvePhoneLockerProvider(options)).buildUnlockPolicy(options);
export const deliverLock = (options = {}) => getLockerProviderByName(resolvePhoneLockerProvider(options)).deliverLock(options);
export const importDevice = (options = {}) => getLockerProviderByName(resolvePhoneLockerProvider(options)).importDevice(options);
export const queryTask = (options = {}) => getLockerProviderByName(resolvePhoneLockerProvider(options)).queryTask(options);
export const queryDevice = (options = {}) => getLockerProviderByName(resolvePhoneLockerProvider(options)).queryDevice(options);
export const unlockDevice = (options = {}) => getLockerProviderByName(resolvePhoneLockerProvider(options)).unlockDevice(options);
export const lockDevice = (options = {}) => {
  const provider = getLockerProviderByName(resolvePhoneLockerProvider(options));
  return typeof provider.lockDevice === 'function'
    ? provider.lockDevice(options)
    : provider.deliverLock(options);
};
export const unlockOrExtendDevice = (options = {}) => {
  const provider = getLockerProviderByName(resolvePhoneLockerProvider(options));
  return typeof provider.unlockOrExtendDevice === 'function'
    ? provider.unlockOrExtendDevice(options)
    : provider.unlockDevice(options);
};
export const mapProviderState = (response = {}, options = {}) => getLockerProviderByName(resolvePhoneLockerProvider(options)).mapProviderState(response, options);
export const validateProviderCommandResponse = (response = {}, options = {}) => getLockerProviderByName(resolvePhoneLockerProvider(options)).validateProviderCommandResponse(response, options);
