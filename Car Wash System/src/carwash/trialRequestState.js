export function getTrialRequestState(subscription, requests = [], payments = [], now = Date.now(), extensionAlreadyUsed = false) {
  const pendingRequest = requests.find((request) => request.status === 'PENDING') || null;
  const trialExpired = Boolean(subscription
    && ['TRIAL', 'EXPIRED'].includes(subscription.status)
    && (subscription.status === 'EXPIRED' || new Date(subscription.ends_at).getTime() <= now)
    && (!subscription.grace_until || new Date(subscription.grace_until).getTime() <= now));
  const trialRequestPending = pendingRequest?.request_type === 'TRIAL_EXTENSION';
  const trialExtensionGranted = extensionAlreadyUsed
    || requests.some((request) => request.request_type === 'TRIAL_EXTENSION' && request.status === 'APPROVED');

  return {
    trialExpired,
    trialRequestPending,
    trialExtensionGranted,
    canRequestTrialExtension: trialExpired && !trialRequestPending && !trialExtensionGranted
      && !pendingRequest && payments.length === 0,
  };
}
