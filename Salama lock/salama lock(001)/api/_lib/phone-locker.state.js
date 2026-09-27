function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeStateKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s_-]+/g, '');
}

function normalizeLockerState(value) {
  const normalized = normalizeStateKey(value);
  if (!normalized) return 'unknown';

  if (normalized.includes('unlocking') || normalized.includes('locking') || normalized.includes('releasingcontrol')) {
    return 'pending';
  }

  if (['11', '12', '13', '21', '22', '23', '33', '34', '35'].includes(normalized)) {
    return 'pending';
  }

  if (['1', '3', 'released', 'controlreleased'].includes(normalized)) {
    return 'unlocked';
  }

  if (['2', '31', '32', 'offlinelocked'].includes(normalized)) {
    return 'locked';
  }

  if ([
    'locked',
    'lock',
    'blocked',
    'restricted',
    'inactive',
    'deactivated',
    'expired',
    'overdue',
    'suspended',
    'disabled',
    'off'
  ].includes(normalized)) {
    return 'locked';
  }

  if ([
    'unlocked',
    'unlock',
    'active',
    'activated',
    'ready',
    'available',
    'normal',
    'released',
    'freed',
    'online',
    'connected',
    'on'
  ].includes(normalized)) {
    return 'unlocked';
  }

  if ([
    'pending',
    'queued',
    'processing',
    'running',
    'submitted',
    'waiting',
    'transitioning',
    'inprogress'
  ].includes(normalized)) {
    return 'pending';
  }

  return 'unknown';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractBody(response = {}) {
  if (isPlainObject(response?.body)) return response.body;
  return isPlainObject(response) ? response : {};
}

function extractRows(response = {}) {
  const body = extractBody(response);
  const candidates = [
    response?.rows,
    body.deviceResponseList,
    body.responseList,
    body.queryResponseList,
    body.deviceResponses,
    body.devices,
    body.deviceList,
    body.updateExpirationResponseList,
    body.updateExpirationResponse,
    body.deviceReleaseList,
    body.messageList,
    body.pinUnlockList,
    body.data,
    body.items
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item) => isPlainObject(item));
    }

    if (isPlainObject(candidate)) {
      return [candidate];
    }
  }

  return [];
}

function normalizeSyncStatus(value) {
  const normalized = normalizeStateKey(value);
  if (!normalized) return 'unknown';
  if (['synced', 'sync', 'success', 'succeeded', 'completed', 'complete', 'done', 'ok'].includes(normalized) || normalized.includes('sync')) {
    return 'synced';
  }
  if (['failed', 'error', 'rejected', 'invalid', 'cancelled', 'canceled'].includes(normalized)) return 'failed';
  if (['pending', 'queued', 'processing', 'running', 'submitted', 'waiting'].includes(normalized)) return 'pending';
  return 'unknown';
}

function normalizeCommandStatus(value) {
  const normalized = normalizeStateKey(value);
  if (!normalized) return 'unknown';
  if (['success', 'succeeded', 'ok', 'okay', 'accepted', 'approved', 'complete', 'completed', 'done', '0', '0000', '000000', '20000000'].includes(normalized) || normalized.includes('success')) {
    return 'success';
  }
  if (['pending', 'queued', 'processing', 'running', 'submitted', 'waiting'].includes(normalized)) {
    return 'pending';
  }
  if (['failed', 'error', 'rejected', 'invalid', 'cancelled', 'canceled', 'denied', 'forbidden', 'unauthorized'].some((needle) => normalized.includes(needle))) {
    return 'failed';
  }
  if (['skipped', 'ignored'].includes(normalized)) return 'skipped';
  return 'unknown';
}

function extractProviderStateCandidates(response = {}) {
  const body = extractBody(response);
  const rows = extractRows(response);

  return [
    body.providerState,
    body.provider_state,
    body.stateInfo,
    body.state_info,
    body.deviceState,
    body.device_state,
    body.lockStatus,
    body.lock_status,
    body.state,
    body.status,
    body.transitionState,
    body.transition_state,
    body.resultStatus,
    body.result_status,
    body.taskStatus,
    body.task_status,
    body.operationStatus,
    body.operation_status,
    body.resultCode,
    body.result_code,
    body.resultMessage,
    body.result_message,
    body.message,
    body.msg,
    ...rows.flatMap((row) => [
      row.providerState,
      row.provider_state,
      row.stateInfo,
      row.state_info,
      row.deviceState,
      row.device_state,
      row.lockStatus,
      row.lock_status,
      row.state,
      row.status,
      row.transitionState,
      row.transition_state,
      row.resultStatus,
      row.result_status,
      row.taskStatus,
      row.task_status,
      row.operationStatus,
      row.operation_status,
      row.resultCode,
      row.result_code,
      row.resultMessage,
      row.result_message,
      row.message,
      row.msg
    ])
  ]
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .map((value) => normalizeText(value));
}

function explicitStateFromResponse(response = {}) {
  for (const candidate of extractProviderStateCandidates(response)) {
    const normalized = normalizeLockerState(candidate);
    if (normalized !== 'unknown') return normalized;
  }

  return 'unknown';
}

function classifyResponseCode(response = {}) {
  const body = extractBody(response);
  const rows = extractRows(response);
  const codes = [
    body.resultCode,
    body.result_code,
    body.code,
    body.statusCode,
    body.status_code,
    body.responseCode,
    body.response_code,
    body.errorCode,
    body.error_code,
    ...rows.flatMap((row) => [
      row.resultCode,
      row.result_code,
      row.code,
      row.statusCode,
      row.status_code,
      row.responseCode,
      row.response_code,
      row.errorCode,
      row.error_code
    ])
  ];

  let hasSuccess = false;
  let hasPending = false;

  for (const code of codes) {
    const normalized = normalizeStateKey(code);
    if (!normalized) continue;
    if (['failed', 'error', 'rejected', 'invalid', 'denied', 'forbidden', 'unauthorized'].some((needle) => normalized.includes(needle))) {
      return 'failed';
    }
    if (['pending', 'queued', 'processing', 'running', 'submitted', 'waiting'].includes(normalized) || normalized.includes('pending')) {
      hasPending = true;
    }
    if (['success', 'succeeded', 'ok', 'okay', 'accepted', 'approved', 'complete', 'completed', 'done', '0', '0000', '000000', '20000000'].includes(normalized) || normalized.includes('success')) {
      hasSuccess = true;
    }
  }

  if (hasPending) return 'pending';
  if (hasSuccess) return 'success';
  return 'unknown';
}

function mapProviderState(providerName, response = {}, { action = '' } = {}) {
  const body = extractBody(response);
  const rows = extractRows(response);
  const explicitState = explicitStateFromResponse(response);
  const providerState = body.providerState || body.provider_state || body.stateInfo || body.state_info || body.deviceState || body.device_state || body.lockStatus || body.lock_status || body.transitionState || body.transition_state || body.resultCode || body.result_code || body.resultMessage || body.result_message || body.message || body.msg || rows[0]?.providerState || rows[0]?.provider_state || rows[0]?.stateInfo || rows[0]?.state_info || rows[0]?.deviceState || rows[0]?.device_state || rows[0]?.lockStatus || rows[0]?.lock_status || rows[0]?.transitionState || rows[0]?.transition_state || rows[0]?.resultCode || rows[0]?.result_code || rows[0]?.resultMessage || rows[0]?.result_message || rows[0]?.message || rows[0]?.msg || '';
  let providerLockStatus = explicitState;

  if (providerLockStatus === 'unknown') {
    const codeClassification = classifyResponseCode(response);
    if (codeClassification === 'pending') {
      providerLockStatus = 'pending';
    }
  }

  return {
    provider: normalizeText(providerName || ''),
    action: normalizeText(action || ''),
    providerState: normalizeText(providerState || ''),
    providerLockStatus,
    finalDeviceState: providerLockStatus,
    providerRequestId: '',
    providerTaskId: '',
    providerErrorCode: '',
    providerErrorMessage: '',
    providerResponse: body,
    providerRows: rows,
    hasExplicitState: explicitState !== 'unknown'
  };
}

export {
  normalizeCommandStatus as normalizePhoneLockerCommandStatus,
  normalizeLockerState as normalizePhoneLockerLockStatus,
  normalizeSyncStatus as normalizePhoneLockerSyncStatus,
  mapProviderState
};
