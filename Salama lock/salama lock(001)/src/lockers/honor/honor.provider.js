import { traceProviderCall } from '../provider.logging.js';
import * as honorService from './honor.service.js';

function primaryDeviceId(device = {}) {
  return String(
    device?.imei ||
    device?.imei_1 ||
    device?.serial_number ||
    device?.chassis_number ||
    device?.locker_id ||
    device?.id ||
    ''
  ).trim();
}

export class HonorProvider {
  constructor({ service = honorService } = {}) {
    this.name = 'honor';
    this.service = service;
  }

  diagnostics() {
    return this.service.diagnostics();
  }

  authenticate() {
    return traceProviderCall({
      provider: this.name,
      endpoint: this.diagnostics().authenticatePath || this.diagnostics().registerPath,
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
      endpoint: Number(expiration) > Date.now() ? this.diagnostics().unlockPath : this.diagnostics().lockPath,
      operation: 'updateExpiration',
      run: () => this.service.updateExpiration({ imei, expiration })
    });
  }

  sendNotification(imei, notification = {}) {
    return traceProviderCall({
      provider: this.name,
      imei,
      endpoint: this.diagnostics().remindPath,
      operation: 'sendNotification',
      run: () => this.service.sendNotification(imei, notification)
    });
  }

  releaseDevice(imei) {
    return traceProviderCall({
      provider: this.name,
      imei,
      endpoint: this.diagnostics().unbindPath,
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
      endpoint: this.diagnostics().unlockPath,
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
