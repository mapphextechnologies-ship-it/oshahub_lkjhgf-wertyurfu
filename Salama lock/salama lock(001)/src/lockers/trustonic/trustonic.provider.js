import { traceProviderCall } from '../provider.logging.js';
import * as trustonicService from './trustonic.service.js';

function primaryDeviceId(device = {}) {
  return String(
    device?.locker_id ||
    device?.lockerId ||
    device?.imei ||
    device?.imei_1 ||
    device?.deviceUid ||
    ''
  ).trim();
}

export class TrustonicProvider {
  constructor({ service = trustonicService } = {}) {
    this.name = 'trustonic';
    this.service = service;
  }

  diagnostics() {
    return this.service.diagnostics();
  }

  authenticate() {
    return traceProviderCall({
      provider: this.name,
      endpoint: this.diagnostics().tokenPath,
      operation: 'authenticate',
      run: () => this.service.authenticate()
    });
  }

  buildRegistrationPayload(options = {}) {
    return this.service.buildRegistrationPayload(options);
  }

  buildLockPolicy(options = {}) {
    return this.service.buildLockPolicy(options);
  }

  buildUnlockPolicy(options = {}) {
    return this.service.buildUnlockPolicy(options);
  }

  enrollDevice(device = {}) {
    return traceProviderCall({
      provider: this.name,
      imei: primaryDeviceId(device),
      endpoint: this.diagnostics().registerPath,
      operation: 'enrollDevice',
      run: () => this.service.enrollDevice(device)
    });
  }

  updateExpiration(imei, expiration) {
    return traceProviderCall({
      provider: this.name,
      imei,
      endpoint: this.diagnostics().updatePath,
      operation: 'updateExpiration',
      run: () => this.service.updateExpiration({ imei, expiration })
    });
  }

  sendNotification(imei, notification = {}) {
    return traceProviderCall({
      provider: this.name,
      imei,
      endpoint: this.diagnostics().notifyPath,
      operation: 'sendNotification',
      run: () => this.service.sendNotification(imei, notification)
    });
  }

  releaseDevice(imei) {
    return traceProviderCall({
      provider: this.name,
      imei,
      endpoint: this.diagnostics().releasePath,
      operation: 'releaseDevice',
      run: () => this.service.releaseDevice(imei)
    });
  }

  getDeviceStatus(imei) {
    return traceProviderCall({
      provider: this.name,
      imei,
      endpoint: this.diagnostics().statusPath,
      operation: 'getDeviceStatus',
      run: () => this.service.getDeviceStatus(imei)
    });
  }

  offlineUnlock(imei, challenge) {
    return traceProviderCall({
      provider: this.name,
      imei,
      endpoint: this.diagnostics().pinPath,
      operation: 'offlineUnlock',
      run: () => this.service.offlineUnlock(imei, challenge)
    });
  }

  importDevice(args = {}) {
    return this.service.importDevice(args);
  }

  deliverLock(args = {}) {
    return this.service.deliverLock(args);
  }

  unlockDevice(args = {}) {
    return this.service.unlockDevice(args);
  }

  lockDevice(args = {}) {
    return this.service.lockDevice(args);
  }

  unlockOrExtendDevice(args = {}) {
    return this.service.unlockOrExtendDevice(args);
  }

  queryTask(args = {}) {
    return this.service.queryTask(args);
  }

  queryDevice(args = {}) {
    return this.service.queryDevice(args);
  }

  mapProviderState(providerResponse, context = {}) {
    return this.service.mapProviderState(providerResponse, context);
  }

  validateProviderCommandResponse(providerResponse, context = {}) {
    return this.service.validateProviderCommandResponse(providerResponse, context);
  }
}
