import { HonorProvider } from './honor/honor.provider.js';
import { TrustonicProvider } from './trustonic/trustonic.provider.js';

const providerRegistry = {
  honor: new HonorProvider(),
  trustonic: new TrustonicProvider()
};

function envValue(name) {
  return String(process.env[name] || '').trim();
}

function normalizeLockerProvider(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['trustonic', 'trust', 'ttp', 'telecoms-platform', 'trustonic-v2'].includes(normalized)) return 'trustonic';
  if (['honor', 'hihonor', 'honor-guard', 'honorguard'].includes(normalized)) return 'honor';
  if (normalized === 'auto') return 'auto';
  return '';
}

export function resolveLockerProviderKey(context = {}) {
  const explicit = normalizeLockerProvider(
    context.lockerProvider ||
    context.locker_provider ||
    context.provider ||
    context.product?.locker_provider ||
    context.product?.lockerProvider ||
    context.device?.locker_provider ||
    context.device?.lockerProvider ||
    context.profile?.locker_provider ||
    context.profile?.lockerProvider ||
    context.integration?.locker_provider ||
    context.integration?.lockerProvider
  );

  if (explicit && explicit !== 'auto') return explicit;

  const envProvider = normalizeLockerProvider(envValue('PHONE_LOCKER_PROVIDER') || envValue('PHONE_LOCKER_BACKEND'));
  if (envProvider && envProvider !== 'auto') return envProvider;

  return 'honor';
}

function getLockerProvider(provider = 'honor') {
  const normalized = normalizeLockerProvider(provider);
  if (normalized === 'trustonic') return providerRegistry.trustonic;
  return providerRegistry.honor;
}

export function createLockerProvider(context = {}) {
  return getLockerProvider(resolveLockerProviderKey(context));
}

export function getLockerProviderDiagnostics(context = {}) {
  return createLockerProvider(context).diagnostics();
}

export function getLockerProviderByName(provider = 'honor') {
  return getLockerProvider(provider);
}
