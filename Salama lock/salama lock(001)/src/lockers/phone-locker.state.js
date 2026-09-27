function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeStateKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s_-]+/g, '');
}

function cloneValue(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
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

function extractRequestId(response = {}) {
  const body = extractBody(response);
  return firstDefined(
    response?.requestId,
    response?.request_id,
    response?.taskId,
    response?.task_id,
    body?.requestId,
    body?.request_id,
    body?.taskId,
    body?.task_id
  ) || '';
}

function extractTaskId(response = {}) {
  const body = extractBody(response);
  return firstDefined(
    response?.taskId,
    response?.task_id,
    response?.requestId,
    response?.request_id,
    body?.taskId,
    body?.task_id,
    body?.requestId,
    body?.request_id
  ) || '';
}

function extractCodes(response = {}) {
  const body = extractBody(response);
  const rows = extractRows(response);
  const candidates = [
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

  return candidates
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .map((value) => normalizeText(value));
}

function extractMessages(response = {}) {
  const body = extractBody(response);
  const rows = extractRows(response);
  const candidates = [
    body.resultMessage,
    body.result_message,
    body.message,
    body.msg,
    body.errorMessage,
    body.error_message,
    body.error,
    ...rows.flatMap((row) => [
      row.resultMessage,
      row.result_message,
      row.message,
      row.msg,
      row.errorMessage,
      row.error_message,
      row.error
    ])
  ];

  return candidates
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .map((value) => normalizeText(value));
}

function classifyCode(code) {
  const normalized = normalizeStateKey(code);
  if (!normalized) return 'unknown';
  if ([
    'success',
    'succeeded',
    'ok',
    'okay',
    'accepted',
    'approved',
    'complete',
    'completed',
    'done',
    '0',
    '0000',
    '000000',
    '20000000'
  ].includes(normalized) || normalized.includes('success')) {
    return 'success';
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
  ].includes(normalized) || normalized.includes('pending')) {
    return 'pending';
  }

  if ([
    'failed',
    'error',
    'rejected',
    'invalid',
    'denied',
    'forbidden',
    'unauthorized',
    'expired',
    'missing',
    'notfound',
    'notallowed'
  ].some((needle) => normalized.includes(needle))) {
    return 'failed';
  }

  return 'unknown';
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
    'disabled'
  ].includes(normalized)) {
    return 'locked';
  }

  if ([
    'unlocked',
    'unlock',
    'active',
    'ready',
    'available',
    'normal',
    'released',
    'freed'
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
  if (['success', 'succeeded', 'accepted', 'approved', 'complete', 'completed', 'done', 'ok'].includes(normalized) || normalized.includes('success')) {
    return 'success';
  }
  if (['failed', 'error', 'rejected', 'invalid', 'cancelled', 'canceled'].includes(normalized) || normalized.includes('fail')) {
    return 'failed';
  }
  if (['skipped', 'noop', 'no-op'].includes(normalized) || normalized.includes('skip')) {
    return 'skipped';
  }
  if (['pending', 'queued', 'processing', 'running', 'submitted', 'waiting'].includes(normalized)) {
    return 'pending';
  }
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
  const body = extractBody(response);
  const rows = extractRows(response);

  const candidates = [
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
    ...rows.flatMap((row) => [
      row.stateInfo,
      row.state_info,
      row.deviceState,
      row.device_state,
      row.lockStatus,
      row.lock_status,
      row.state,
      row.status,
      row.transitionState,
      row.transition_state
    ])
  ];

  for (const candidate of candidates) {
    const normalized = normalizeLockerState(candidate);
    if (normalized !== 'unknown') return normalized;
  }

  return 'unknown';
}

function classifyResponseCode(response = {}) {
  const codes = extractCodes(response);
  let hasSuccess = false;
  let hasPending = false;

  for (const code of codes) {
    const classification = classifyCode(code);
    if (classification === 'failed') {
      return 'failed';
    }
    if (classification === 'pending') {
      hasPending = true;
    }
    if (classification === 'success') {
      hasSuccess = true;
    }
  }

  if (hasPending) return 'pending';
  if (hasSuccess) return 'success';
  return 'unknown';
}

export function mapProviderState(providerName, response = {}, { action = '' } = {}) {
  const body = extractBody(response);
  const rows = extractRows(response);
  const explicitState = explicitStateFromResponse(response);
  const providerState = firstDefined(
    body.providerState,
    body.provider_state,
    body.stateInfo,
    body.state_info,
    body.deviceState,
    body.device_state,
    body.lockStatus,
    body.lock_status,
    body.transitionState,
    body.transition_state,
    body.resultCode,
    body.result_code,
    body.resultMessage,
    body.result_message,
    body.message,
    body.msg,
    rows[0]?.providerState,
    rows[0]?.provider_state,
    rows[0]?.stateInfo,
    rows[0]?.state_info,
    rows[0]?.deviceState,
    rows[0]?.device_state,
    rows[0]?.lockStatus,
    rows[0]?.lock_status,
    rows[0]?.transitionState,
    rows[0]?.transition_state,
    rows[0]?.resultCode,
    rows[0]?.result_code,
    rows[0]?.resultMessage,
    rows[0]?.result_message,
    rows[0]?.message,
    rows[0]?.msg
  ) || '';

  let providerLockStatus = explicitState;

  if (providerLockStatus === 'unknown') {
    const codeClassification = classifyResponseCode(response);
    if (codeClassification === 'pending') {
      providerLockStatus = 'pending';
    }
  }

  const providerRequestId = extractRequestId(response);
  const providerTaskId = extractTaskId(response);
  const providerErrorCode = firstDefined(
    body.errorCode,
    body.error_code,
    body.resultCode,
    body.result_code,
    body.code,
    rows[0]?.errorCode,
    rows[0]?.error_code,
    rows[0]?.resultCode,
    rows[0]?.result_code,
    rows[0]?.code
  ) || '';
  const providerErrorMessage = firstDefined(
    body.resultMessage,
    body.result_message,
    body.message,
    body.msg,
    body.errorMessage,
    body.error_message,
    body.error,
    rows[0]?.resultMessage,
    rows[0]?.result_message,
    rows[0]?.message,
    rows[0]?.msg,
    rows[0]?.errorMessage,
    rows[0]?.error_message,
    rows[0]?.error
  ) || '';

  return {
    provider: normalizeText(providerName || ''),
    action: normalizeText(action || ''),
    providerState,
    providerLockStatus,
    finalDeviceState: providerLockStatus,
    providerRequestId,
    providerTaskId,
    providerErrorCode,
    providerErrorMessage,
    providerResponse: cloneValue(body) || cloneValue(response) || {},
    providerRows: cloneValue(rows) || [],
    hasExplicitState: explicitState !== 'unknown'
  };
}

export function validateProviderCommandResponse(providerName, response = {}, { action = '' } = {}) {
  const mapped = mapProviderState(providerName, response, { action });
  const body = extractBody(response);
  const responseCodeStatus = classifyResponseCode(response);
  const messageText = extractMessages(response).join(' ').toLowerCase();
  const provider = normalizeText(providerName || '').toLowerCase();

  let commandStatus = 'success';
  let providerErrorCode = mapped.providerErrorCode;
  let providerErrorMessage = mapped.providerErrorMessage;

  if (responseCodeStatus === 'failed' || /(^|[^a-z])(invalid|error|failed|rejected|denied|forbidden|unauthorized)([^a-z]|$)/.test(messageText)) {
    commandStatus = 'failed';
  } else if (responseCodeStatus === 'pending') {
    commandStatus = 'pending';
  } else if (provider === 'trustonic') {
    const trustonicState = mapped.hasExplicitState ? mapped.providerLockStatus : '';
    if (action !== 'sync' && trustonicState === 'unknown') {
      commandStatus = 'pending';
    }
  }

  if (provider === 'trustonic' && action !== 'sync') {
    const resultCode = normalizeStateKey(
      body.resultCode ||
      body.result_code ||
      mapped.providerErrorCode ||
      ''
    );

    if (resultCode && !['success', 'succeeded', 'ok', 'okay', 'accepted', 'approved', 'complete', 'completed', 'done', '0', '0000', '000000', '20000000'].includes(resultCode) && !resultCode.includes('success') && !resultCode.includes('pending')) {
      commandStatus = 'failed';
      providerErrorCode = firstDefined(providerErrorCode, body.resultCode, body.result_code, mapped.providerErrorCode) || resultCode;
      providerErrorMessage = firstDefined(providerErrorMessage, body.resultMessage, body.result_message, body.message, body.msg, 'Trustonic command response was not accepted.') || 'Trustonic command response was not accepted.';
    }
  }

  if (provider === 'honor' && action !== 'sync') {
    const resultCode = normalizeStateKey(
      body.code ||
      body.resultCode ||
      mapped.providerErrorCode ||
      ''
    );

    if (resultCode && !['success', 'succeeded', 'ok', 'okay', 'accepted', 'approved', 'complete', 'completed', 'done', '0', '0000', '000000', '20000000'].includes(resultCode) && !resultCode.includes('success') && !resultCode.includes('pending')) {
      commandStatus = 'failed';
      providerErrorCode = firstDefined(providerErrorCode, body.code, body.resultCode, mapped.providerErrorCode) || resultCode;
      providerErrorMessage = firstDefined(providerErrorMessage, body.message, body.msg, body.error, 'Honor command response was not accepted.') || 'Honor command response was not accepted.';
    }
  }

  if (commandStatus === 'success' && action !== 'sync' && !mapped.hasExplicitState) {
    mapped.providerLockStatus = 'pending';
    mapped.finalDeviceState = 'pending';
  }

  return {
    ...mapped,
    providerErrorCode,
    providerErrorMessage,
    commandStatus,
    success: commandStatus !== 'failed',
    commandAccepted: commandStatus === 'success' || commandStatus === 'pending',
    commandPending: commandStatus === 'pending',
    rawResultCode: firstDefined(body.resultCode, body.result_code, body.code, mapped.providerErrorCode) || ''
  };
}
