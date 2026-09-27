import crypto from 'node:crypto';
import './logging.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_TOKEN_TTL_MS = 55 * 60 * 1000;
const DEFAULT_LOCK_BUFFER_MS = 60 * 1000;
const DEFAULT_UNLOCK_VALIDITY_HOURS = 24;
const DEFAULT_EXPIRY_HOURS = 24;

let cachedToken = null;
let cachedTokenExpiresAt = 0;
const recentDeviceState = new Map();

function envValue(name) {
  return String(process.env[name] || '').trim();
}

function coalesceEnv(...names) {
  for (const name of names) {
    const value = envValue(name);
    if (value) return value;
  }
  return '';
}

function normalizeBaseUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  return trimmed;
}

function isDocumentationBaseUrl(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.includes('/swagger-ui/') || normalized.includes('/swagger/') || normalized.endsWith('.json');
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeVariant(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['journey', 'journey-v2', 'v2', 'api-v2', 'prepaid'].includes(normalized)) return 'journey-v2';
  if (['public', 'public-v1', 'v1', 'api-v1'].includes(normalized)) return 'public-v1';
  if (!normalized) return 'journey-v2';
  return normalized;
}

function normalizeAuthMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['bearer', 'bearer-token', 'token'].includes(normalized)) return 'bearer';
  if (['api-key', 'apikey', 'header-key'].includes(normalized)) return 'api-key';
  if (['credentials', 'client_credentials', 'client-credentials', 'password'].includes(normalized)) return normalized;
  return '';
}

function normalizeEpochUnit(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['ms', 'millisecond', 'milliseconds'].includes(normalized)) return 'milliseconds';
  return 'seconds';
}

function safeJsonClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizePhoneIds(value) {
  return [...new Set(
    (Array.isArray(value) ? value : [value])
      .flatMap((item) => String(item || '').split(/[;, \n\r\t]+/g))
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function maskSecret(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= 8) return `${text.slice(0, 2)}...`;
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function parseEpochLike(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value < 1e11 ? value * 1000 : value;
  }

  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) return null;
    return numeric < 1e11 ? numeric * 1000 : numeric;
  }

  const parsed = new Date(text);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
}

function toTrustonicEpoch(value, unit = 'seconds') {
  if (value === undefined || value === null || value === '') return null;
  const time = parseEpochLike(value);
  if (time === null) return null;
  return unit === 'milliseconds' ? time : Math.floor(time / 1000);
}

function fromTrustonicEpoch(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseEpochLike(value);
  return parsed === null ? null : new Date(parsed).toISOString();
}

function buildDefaultPaths() {
  return {
    tokenPath: '/api/v2/authorization/token',
    registerPath: '/api/v2/inventory/upload',
    updatePath: '/api/v2/device/updateExpiration',
    releasePath: '/api/v2/device/release',
    activatePath: '/api/v2/service/activate',
    deletePath: '/api/v2/service',
    statusPath: '/api/v2/query/devices',
    notifyPath: '/api/v2/device/notify',
    pinPath: '/api/v2/device/pinunlock'
  };
}

function buildConfig() {
  const defaults = buildDefaultPaths();
  const apiBase = normalizeBaseUrl(coalesceEnv('TRUSTONIC_API_BASE', 'TRUSTONIC_BASE_URL', 'PHONE_LOCKER_BASE_URL'));
  const apiKey = coalesceEnv('TRUSTONIC_API_KEY', 'PHONE_LOCKER_API_KEY');
  const bearerToken = coalesceEnv('TRUSTONIC_BEARER_TOKEN', 'PHONE_LOCKER_BEARER_TOKEN');
  const username = coalesceEnv('TRUSTONIC_USERNAME', 'PHONE_LOCKER_USERNAME');
  const password = coalesceEnv('TRUSTONIC_PASSWORD', 'PHONE_LOCKER_PASSWORD');
  const clientId = coalesceEnv('TRUSTONIC_CLIENT_ID', 'PHONE_LOCKER_CLIENT_ID');
  const clientSecret = coalesceEnv('TRUSTONIC_CLIENT_SECRET', 'PHONE_LOCKER_CLIENT_SECRET');
  const apiKeyHeader = coalesceEnv('TRUSTONIC_API_KEY_HEADER', 'PHONE_LOCKER_API_KEY_HEADER') || 'x-api-key';
  const tenantId = coalesceEnv('TRUSTONIC_TENANT_ID', 'PHONE_LOCKER_TENANT_ID');
  const serviceName = coalesceEnv('TRUSTONIC_SERVICE_NAME', 'PHONE_LOCKER_SERVICE_NAME') || 'deviceFinancing';
  const paymentMethod = coalesceEnv('TRUSTONIC_PAYMENT_METHOD', 'PHONE_LOCKER_PAYMENT_METHOD') || 'prepaid';
  const deviceType = coalesceEnv('TRUSTONIC_DEVICE_TYPE', 'PHONE_LOCKER_DEVICE_TYPE') || 'mobile';
  const idType = coalesceEnv('TRUSTONIC_ID_TYPE', 'PHONE_LOCKER_ID_TYPE') || 'imei';
  const assignedPolicy = coalesceEnv(
    'TRUSTONIC_ASSIGNED_POLICY',
    'PHONE_LOCKER_ASSIGNED_POLICY',
  ) || serviceName;
  const lockPolicy = coalesceEnv('TRUSTONIC_LOCK_POLICY', 'PHONE_LOCKER_LOCK_POLICY') || assignedPolicy;
  const unlockPolicy = coalesceEnv('TRUSTONIC_UNLOCK_POLICY', 'PHONE_LOCKER_UNLOCK_POLICY') || assignedPolicy;
  const variant = normalizeVariant(coalesceEnv('TRUSTONIC_API_VARIANT', 'PHONE_LOCKER_TRUSTONIC_VARIANT'));
  const timeoutMs = Number(coalesceEnv('TRUSTONIC_TIMEOUT_MS', 'PHONE_LOCKER_TIMEOUT_MS')) || DEFAULT_TIMEOUT_MS;
  const tokenTtlMs = Number(coalesceEnv('TRUSTONIC_TOKEN_TTL_MS', 'PHONE_LOCKER_TOKEN_TTL_MS')) || DEFAULT_TOKEN_TTL_MS;
  const tokenPath = coalesceEnv('TRUSTONIC_TOKEN_PATH', 'PHONE_LOCKER_TOKEN_PATH') || defaults.tokenPath;
  const registerPath = coalesceEnv('TRUSTONIC_REGISTER_PATH', 'PHONE_LOCKER_REGISTER_PATH') || defaults.registerPath;
  const updatePath = coalesceEnv('TRUSTONIC_UPDATE_PATH', 'PHONE_LOCKER_UPDATE_PATH') || defaults.updatePath;
  const releasePath = coalesceEnv('TRUSTONIC_RELEASE_PATH', 'PHONE_LOCKER_RELEASE_PATH') || defaults.releasePath;
  const activatePath = coalesceEnv('TRUSTONIC_ACTIVATE_PATH', 'PHONE_LOCKER_ACTIVATE_PATH') || defaults.activatePath;
  const deletePath = coalesceEnv('TRUSTONIC_DELETE_PATH', 'PHONE_LOCKER_DELETE_PATH') || defaults.deletePath;
  const statusPath = coalesceEnv('TRUSTONIC_STATUS_PATH', 'PHONE_LOCKER_STATUS_PATH') || defaults.statusPath;
  const notifyPath = coalesceEnv('TRUSTONIC_NOTIFY_PATH', 'PHONE_LOCKER_NOTIFY_PATH') || defaults.notifyPath;
  const pinPath = coalesceEnv('TRUSTONIC_PIN_PATH', 'PHONE_LOCKER_PIN_PATH') || defaults.pinPath;
  const epochUnit = normalizeEpochUnit(coalesceEnv('TRUSTONIC_EPOCH_UNIT', 'PHONE_LOCKER_EPOCH_UNIT'));
  const lockBufferMinutes = Number(coalesceEnv('TRUSTONIC_LOCK_BUFFER_MINUTES', 'PHONE_LOCKER_LOCK_BUFFER_MINUTES')) || 1;
  const unlockValidityHours = Number(coalesceEnv('TRUSTONIC_UNLOCK_VALIDITY_HOURS', 'PHONE_LOCKER_UNLOCK_VALIDITY_HOURS')) || DEFAULT_UNLOCK_VALIDITY_HOURS;
  const defaultExpiryHours = Number(coalesceEnv('TRUSTONIC_DEFAULT_EXPIRY_HOURS', 'PHONE_LOCKER_DEFAULT_EXPIRY_HOURS')) || DEFAULT_EXPIRY_HOURS;
  const releaseOnUnlock = normalizeBoolean(coalesceEnv('TRUSTONIC_RELEASE_ON_UNLOCK', 'PHONE_LOCKER_RELEASE_ON_UNLOCK'), true);
  const authMode = normalizeAuthMode(coalesceEnv('TRUSTONIC_AUTH_MODE', 'PHONE_LOCKER_AUTH_MODE'));

  return {
    apiBase,
    apiKey,
    bearerToken,
    username,
    password,
    clientId,
    clientSecret,
    apiKeyHeader,
    tenantId,
    serviceName,
    paymentMethod,
    deviceType,
    idType,
    assignedPolicy,
    lockPolicy,
    unlockPolicy,
    variant,
    timeoutMs,
    tokenTtlMs,
    tokenPath,
    registerPath,
    updatePath,
    releasePath,
    activatePath,
    deletePath,
    statusPath,
    notifyPath,
    pinPath,
    epochUnit,
    lockBufferMinutes,
    unlockValidityHours,
    defaultExpiryHours,
    releaseOnUnlock,
    authMode
  };
}

export function validateTrustonicEnvironment() {
  const config = buildConfig();
  const missing = [];
  const authConfigured = Boolean(
    config.bearerToken ||
    config.apiKey ||
    (config.username && config.password) ||
    (config.clientId && config.clientSecret)
  );

  if (!config.apiBase) missing.push('TRUSTONIC_API_BASE');
  if (config.apiBase && isDocumentationBaseUrl(config.apiBase)) {
    missing.push('TRUSTONIC_API_BASE must be the Trustonic API host, not the Swagger/OpenAPI documentation URL');
  }
  if (!authConfigured) missing.push('TRUSTONIC_BEARER_TOKEN, TRUSTONIC_API_KEY, or TRUSTONIC_USERNAME/TRUSTONIC_PASSWORD with TRUSTONIC_CLIENT_ID/TRUSTONIC_CLIENT_SECRET');
  if (!config.assignedPolicy) missing.push('TRUSTONIC_ASSIGNED_POLICY or TRUSTONIC_SERVICE_NAME');

  if (missing.length > 0) {
    const error = new Error(`Missing Trustonic environment variables: ${missing.join(', ')}.`);
    error.statusCode = 500;
    error.code = 'TRUSTONIC_CONFIG_MISSING';
    throw error;
  }

  return config;
}

export async function authenticateTrustonic(timeoutMs) {
  const config = validateTrustonicEnvironment();
  const tokenResult = await fetchAccessToken(config, timeoutMs);
  return {
    provider: 'trustonic',
    authenticated: true,
    authMode: config.authMode || (config.bearerToken ? 'bearer' : config.apiKey ? 'api-key' : 'credentials'),
    tokenExpiresAt: tokenResult.expiresAt,
    token: tokenResult.token
  };
}

function buildTokenRequestBody(config) {
  const body = {};

  if (config.username) {
    body.username = config.username;
    body.userName = config.username;
  }

  if (config.password) {
    body.password = config.password;
  }

  if (config.clientId) {
    body.clientId = config.clientId;
    body.client_id = config.clientId;
  }

  if (config.clientSecret) {
    body.clientSecret = config.clientSecret;
    body.client_secret = config.clientSecret;
  }

  if (config.authMode) {
    body.grantType = config.authMode;
    body.grant_type = config.authMode;
  } else if (config.clientId && config.clientSecret) {
    body.grantType = 'client_credentials';
    body.grant_type = 'client_credentials';
  } else if (config.username && config.password) {
    body.grantType = 'password';
    body.grant_type = 'password';
  }

  return body;
}

function buildUrl(path, query = {}) {
  const config = validateTrustonicEnvironment();
  const base = config.apiBase.replace(/\/+$/, '');
  const normalizedPath = String(path || '').trim();
  const fullPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  const url = new URL(fullPath, `${base}/`);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  return url;
}

function sanitizeHeaders(headers = {}) {
  const output = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowered = key.toLowerCase();
    if (lowered === 'authorization') {
      output[key] = String(value || '').startsWith('Bearer ')
        ? `Bearer ${maskSecret(String(value).slice('Bearer '.length))}`
        : maskSecret(value);
      continue;
    }
    if (['x-api-key', 'apikey', 'api-key', 'x-api-key'].includes(lowered)) {
      output[key] = maskSecret(value);
      continue;
    }
    output[key] = value;
  }
  return output;
}

function extractTrustonicToken(data = {}) {
  return (
    data.access_token ||
    data.accessToken ||
    data.token ||
    data.jwt ||
    data.id_token ||
    data.idToken ||
    data.bearerToken ||
    ''
  );
}

function extractTrustonicTokenExpiresIn(data = {}) {
  const raw = data.expires_in ?? data.expiresIn ?? data.ttl ?? data.ttlSeconds ?? data.validity ?? data.expires;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return 3600;
}

function normalizeResponseBody(rawText) {
  if (!rawText) return {};
  try {
    return JSON.parse(rawText);
  } catch {
    return { raw: rawText };
  }
}

function extractRows(data = {}) {
  const candidates = [
    data.updateExpirationResponseList,
    data.updateExpirationResponse,
    data.deviceReleaseResponseList,
    data.releaseResponseList,
    data.deviceReleaseList,
    data.messageList,
    data.messageResponseList,
    data.messageResponse,
    data.pinUnlockList,
    data.deviceResponseList,
    data.responseList,
    data.queryResponseList,
    data.deviceResponses,
    data.devices,
    data.deviceList,
    data.data,
    data.rows,
    data.items
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter((item) => item && typeof item === 'object');
    if (candidate && typeof candidate === 'object') return [candidate];
  }

  if (data && typeof data === 'object') {
    const looksLikeRow = [
      'deviceUid',
      'imei',
      'assignedPolicy',
      'lastReportedPolicy',
      'deviceReady',
      'expiration',
      'expirationTime',
      'expiry',
      'status',
      'state',
      'stateInfo',
      'transitionState',
      'lockStatus',
      'error'
    ].some((key) => Object.prototype.hasOwnProperty.call(data, key));

    if (looksLikeRow) return [data];
  }

  return [];
}

function extractTrustonicErrorMessage(body = {}, action = 'sync') {
  const rows = extractRows(body);
  const candidates = [
    body.message,
    body.msg,
    body.error,
    body.resultMessage,
    body.result_message,
    ...rows.flatMap((row) => [
      row.resultMessage,
      row.result_message,
      row.message,
      row.msg,
      row.errorMessage,
      row.error_message,
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

  if (action !== 'sync') {
    candidates.push(
      body.code,
      body.statusCode,
      body.status_code,
      body.responseCode,
      body.response_code,
      body.errorCode,
      body.error_code
    );
  }

  const selected = candidates.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
  return selected ? String(selected).trim() : '';
}

function normalizeStateText(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function normalizeTrustonicState(value) {
  const normalized = normalizeStateText(value);
  if (!normalized) return '';
  if (['locked', 'lock', 'blocked', 'restricted', 'inactive', 'deactivated', 'expired', 'overdue', 'suspended', 'disabled'].includes(normalized)) return 'locked';
  if (['unlocked', 'unlock', 'active', 'ready', 'available', 'normal', 'released', 'freed'].includes(normalized)) return 'unlocked';
  if (['registered', 'enrolled', 'enrollment', 'enrol', 'enrolment'].includes(normalized)) return 'registered';
  if (['pending', 'queued', 'processing', 'running', 'submitted', 'waiting'].includes(normalized)) return 'pending';
  if (['failed', 'error', 'rejected', 'cancelled', 'canceled', 'invalid'].includes(normalized)) return 'failed';
  return normalized;
}

function inferStateFromPolicies(row = {}, config = {}) {
  const policies = [
    row.assignedPolicy,
    row.assigned_policy,
    row.lastReportedPolicy,
    row.last_reported_policy,
    row.policy,
    row.policyName,
    row.policy_name
  ]
    .map(normalizeStateText)
    .filter(Boolean);

  const lockPolicy = normalizeStateText(config.lockPolicy);
  const unlockPolicy = normalizeStateText(config.unlockPolicy);
  const assignedPolicy = normalizeStateText(config.assignedPolicy);
  const serviceName = normalizeStateText(config.serviceName);

  if (policies.some((policy) => policy && lockPolicy && policy === lockPolicy)) return 'locked';
  if (policies.some((policy) => policy && unlockPolicy && policy === unlockPolicy)) return 'unlocked';
  if (policies.some((policy) => policy && assignedPolicy && policy === assignedPolicy)) return 'registered';
  if (policies.some((policy) => policy && serviceName && policy === serviceName)) return 'registered';
  return '';
}

function inferStateFromExpiry(row = {}) {
  const expiryCandidates = [
    row.expiration,
    row.expirationTime,
    row.expiration_time,
    row.expiry,
    row.validUntil,
    row.valid_until,
    row.nextDue,
    row.next_due,
    row.dueDate,
    row.due_date,
    row.additionalInfo?.expiry,
    row.additional_info?.expiry,
    row.customProperties?.['@expiry'],
    row.custom_properties?.['@expiry']
  ];

  for (const candidate of expiryCandidates) {
    const parsed = parseEpochLike(candidate);
    if (parsed === null) continue;
    return parsed <= Date.now() ? 'locked' : 'unlocked';
  }

  return '';
}

function inferTrustonicState(row = {}, action = '', config = {}) {
  const explicitState = normalizeTrustonicState(
    row.lockStatus ||
    row.stateInfo ||
    row.state_info ||
    row.deviceState ||
    row.state ||
    row.status ||
    row.transitionState ||
    row.transition_state ||
    row.resultStatus ||
    row.taskStatus ||
    row.operationStatus ||
    row.result ||
    row.message
  );
  if (explicitState) return explicitState;

  const expiryState = inferStateFromExpiry(row);
  if (expiryState) return expiryState;

  const policyState = inferStateFromPolicies(row, config);
  if (policyState) return policyState;

  if (typeof row.deviceReady === 'boolean') {
    return row.deviceReady ? 'unlocked' : 'locked';
  }

  if (action === 'register') return 'registered';
  if (action === 'lock') return 'locked';
  if (action === 'unlock') return 'unlocked';
  return '';
}

function synthesizeTrustonicRow(row = {}, action = '', config = {}) {
  const state = inferTrustonicState(row, action, config);
  const deviceUid = normalizeText(row.deviceUid || row.device_uid || row.imei || row.imei_1 || row.deviceId || row.device_id);
  const expiration = row.expiration ?? row.expirationTime ?? row.expiration_time ?? row.expiry ?? row.validUntil ?? row.valid_until ?? row.nextDue ?? row.next_due ?? row.additionalInfo?.expiry ?? row.customProperties?.['@expiry'] ?? null;
  const error = row.error || ((row.message && state === 'failed') ? row.message : null);

  return {
    ...row,
    deviceUid,
    imei: deviceUid,
    operationType:
      state === 'unlocked' ? 4 :
      state === 'locked' ? 3 :
      state === 'registered' ? 1 :
      action === 'unlock' ? 4 :
      action === 'lock' ? 3 :
      action === 'register' ? 1 :
      0,
    operationResult: error ? 1 : 0,
    status: state || row.status || '',
    state: state || row.state || row.stateInfo || '',
    result: state || row.result || '',
    resultStatus: state || row.resultStatus || '',
    taskStatus: state || row.taskStatus || '',
    operationStatus: state || row.operationStatus || '',
    lockStatus: state || row.lockStatus || '',
    expiration,
    expiry: expiration,
    message: error || row.message || '',
    error: row.error || null
  };
}

function rememberDeviceState(row = {}, state = '', source = {}) {
  const deviceUid = normalizeText(row.deviceUid || row.device_uid || row.imei || row.deviceId || row.device_id || source.deviceUid || source.imei || source.registeredId);
  if (!deviceUid) return;

  const expiration = parseEpochLike(row.expiration ?? row.expirationTime ?? row.expiration_time ?? row.expiry ?? source.expiration ?? source.expirationTime ?? source.expiration_time ?? source.expiry ?? null);
  recentDeviceState.set(deviceUid, {
    state: state || normalizeTrustonicState(row.lockStatus || row.stateInfo || row.state_info || row.status || row.state || ''),
    expiration,
    row: safeJsonClone(row),
    updatedAt: Date.now()
  });
}

function getRememberedDeviceState(deviceUid) {
  const entry = recentDeviceState.get(normalizeText(deviceUid));
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > 6 * 60 * 60 * 1000) {
    recentDeviceState.delete(normalizeText(deviceUid));
    return null;
  }
  return entry;
}

function buildTrustonicRowResponse(action, rows, config) {
  const normalizedRows = rows.map((row) => synthesizeTrustonicRow(row, action, config));
  normalizedRows.forEach((row) => rememberDeviceState(row, row.lockStatus || row.status || '', row));
  return normalizedRows;
}

function buildSuccessResponse({ requestId, url, httpStatus, body, rows, action, config, executionTimeMs }) {
  const normalizedRows = buildTrustonicRowResponse(action, rows, config);
  const safeBody = safeJsonClone(body) || {};
  const responseBody = {
    ...safeBody,
    code: safeBody.code ?? 20000000,
    message: safeBody.message || safeBody.msg || '',
    data: normalizedRows,
    devices: normalizedRows,
    deviceList: normalizedRows
  };

  const taskId =
    safeBody.uploadID ||
    safeBody.uploadId ||
    safeBody.upload_id ||
    safeBody.taskId ||
    safeBody.task_id ||
    normalizedRows[0]?.deviceUid ||
    normalizedRows[0]?.imei ||
    requestId ||
    '';

  return {
    success: true,
    requestId,
    url,
    status: httpStatus,
    body: responseBody,
    rows: normalizedRows,
    taskId,
    executionTimeMs
  };
}

function buildFallbackRows(action, requestBody = {}, parsedBody = {}) {
  const status =
    action === 'register' ? 'registered' :
    action === 'lock' ? 'locked' :
    action === 'unlock' ? 'unlocked' :
    action === 'release' ? 'unlocked' :
    '';
  const deviceUid =
    normalizeText(requestBody?.deviceUid) ||
    normalizeText(requestBody?.deviceList?.[0]?.deviceUid) ||
    normalizeText(requestBody?.updateExpirationList?.[0]?.deviceUid) ||
    normalizeText(requestBody?.deviceReleaseList?.[0]?.deviceUid) ||
    normalizeText(requestBody?.devices?.[0]?.imei) ||
    normalizeText(requestBody?.devices?.[0]?.deviceUid) ||
    '';

  if (!deviceUid) return [];

  const expiration =
    requestBody?.deviceList?.[0]?.additionalInfo?.expiry ??
    requestBody?.deviceList?.[0]?.customProperties?.['@expiry'] ??
    requestBody?.updateExpirationList?.[0]?.expiration ??
    requestBody?.deviceReleaseList?.[0]?.expiration ??
    null;

  return [
    {
      deviceUid,
      imei: deviceUid,
      status,
      state: status,
      result: status,
      resultStatus: status,
      taskStatus: status,
      operationStatus: status,
      lockStatus: status,
      operationType: status === 'unlocked' ? 4 : status === 'locked' ? 3 : status === 'registered' ? 1 : 0,
      operationResult: parsedBody?.error ? 1 : 0,
      expiration,
      expiry: expiration,
      message: parsedBody?.message || parsedBody?.msg || '',
      error: parsedBody?.error || null
    }
  ];
}

function extractTrustonicRequestDeviceUid(requestBody = {}) {
  return normalizeText(
    requestBody?.deviceUid ||
    requestBody?.deviceList?.[0]?.deviceUid ||
    requestBody?.updateExpirationList?.[0]?.deviceUid ||
    requestBody?.deviceReleaseList?.[0]?.deviceUid ||
    requestBody?.messageList?.[0]?.deviceUid ||
    requestBody?.pinUnlockList?.[0]?.deviceUid ||
    requestBody?.devices?.[0]?.imei ||
    requestBody?.devices?.[0]?.deviceUid ||
    ''
  );
}

function buildTrustonicNotFoundRows(requestBody = {}, parsedBody = {}) {
  const deviceUid = extractTrustonicRequestDeviceUid(requestBody);
  if (!deviceUid) return [];

  const warningCode = normalizeText(
    parsedBody?.resultCode ||
    parsedBody?.result_code ||
    parsedBody?.code ||
    parsedBody?.errorCode ||
    parsedBody?.error_code ||
    'DEVICE_UID_NOT_FOUND'
  );
  const warningMessage = normalizeText(
    parsedBody?.resultMessage ||
    parsedBody?.result_message ||
    parsedBody?.message ||
    parsedBody?.msg ||
    parsedBody?.error ||
    ''
  );

  return [
    {
      deviceUid,
      imei: deviceUid,
      status: 'unknown',
      state: 'unknown',
      result: 'unknown',
      resultStatus: 'unknown',
      taskStatus: 'unknown',
      operationStatus: 'unknown',
      lockStatus: 'unknown',
      operationType: 0,
      operationResult: 0,
      warningCode,
      warningMessage,
      message: '',
      error: null
    }
  ];
}

function isTrustonicNotFoundError(error = {}) {
  const body = error?.response && typeof error.response === 'object' ? error.response : {};
  const message = String(
    error?.message ||
    body?.message ||
    body?.msg ||
    body?.error ||
    body?.resultMessage ||
    body?.result_message ||
    ''
  ).toLowerCase().replace(/[\s_-]+/g, '');
  if (!message.includes('notfound')) return false;

  const rows = extractRows(body);
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
  ]
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .map((value) => String(value).trim().toLowerCase().replace(/[\s_-]+/g, ''));

  return codes.some((code) => code.includes('notfound'));
}

function buildTrustonicNotFoundResponse({
  requestId,
  url,
  httpStatus,
  body,
  requestBody,
  action,
  config,
  executionTimeMs
} = {}) {
  const safeBody = safeJsonClone(body) || {};
  const responseBody = {
    ...safeBody,
    code: safeBody.code ?? 20000000,
    message: '',
    warningCode: safeBody.warningCode || safeBody.resultCode || safeBody.result_code || 'DEVICE_UID_NOT_FOUND',
    warningMessage: safeBody.warningMessage || safeBody.resultMessage || safeBody.result_message || safeBody.message || safeBody.msg || '',
    notFound: true
  };

  return buildSuccessResponse({
    requestId,
    url,
    httpStatus,
    body: responseBody,
    rows: buildTrustonicNotFoundRows(requestBody || {}, safeBody),
    action,
    config,
    executionTimeMs
  });
}

function hasFailureCode(value = '') {
  const normalized = normalizeStateText(value);
  if (!normalized) return false;
  if (['success', 'succeeded', 'ok', 'okay', 'accepted', 'approved', 'complete', 'completed', 'done', 'pending', 'queued', 'processing', 'running', 'submitted', 'waiting', '20000000', '0', '000000', '0000'].includes(normalized) || normalized.includes('success') || normalized.includes('pending')) {
    return false;
  }

  return [
    'invalid',
    'error',
    'failed',
    'fail',
    'reject',
    'denied',
    'forbidden',
    'unauthor',
    'missing',
    'expired',
    'notfound',
    'notallowed',
    'badrequest'
  ].some((needle) => normalized.includes(needle));
}

function isResponseError(body = {}, action = 'sync') {
  const message = String(body.message || body.msg || body.error || '').trim().toLowerCase();
  if (message && ['error', 'failed', 'authorization failure'].some((needle) => message.includes(needle))) return true;
  if (Number(body.code || 0) >= 40000000) return true;
  if (body.error && typeof body.error === 'object') return true;
  if (action !== 'sync') {
    const rows = extractRows(body);
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

    if (codes.some((code) => hasFailureCode(code))) return true;
    const rowMessages = [
      body.resultMessage,
      body.result_message,
      body.message,
      body.msg,
      body.errorMessage,
      body.error_message,
      ...rows.flatMap((row) => [
        row.resultMessage,
        row.result_message,
        row.message,
        row.msg,
        row.errorMessage,
        row.error_message
      ])
    ]
      .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
      .map((value) => String(value).trim().toLowerCase());

    if (rowMessages.some((value) => ['invalid', 'error', 'failed', 'rejected', 'denied', 'forbidden', 'unauthor', 'missing'].some((needle) => value.includes(needle)))) {
      return true;
    }
  }
  return false;
}

async function fetchAccessToken(config, timeoutMs) {
  if (config.bearerToken) {
    return {
      token: config.bearerToken,
      expiresAt: Date.now() + config.tokenTtlMs
    };
  }

  if (cachedToken && cachedTokenExpiresAt > Date.now() + 60_000) {
    return {
      token: cachedToken,
      expiresAt: cachedTokenExpiresAt
    };
  }

  const tokenPaths = [config.tokenPath];
  const alternatePath = config.tokenPath.includes('/v2/') ? config.tokenPath.replace('/v2/', '/v1/') : config.tokenPath.replace('/v1/', '/v2/');
  if (!tokenPaths.includes(alternatePath)) tokenPaths.push(alternatePath);

  let lastError = null;
  const tokenRequestCandidates = [];
  const credentialBody = buildTokenRequestBody(config);

  if (Object.keys(credentialBody).length > 0) {
    tokenRequestCandidates.push({
      body: credentialBody,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(config.apiKey ? {
          [config.apiKeyHeader]: config.apiKey,
          'x-api-key': config.apiKey,
          apiKey: config.apiKey
        } : {}),
        ...(config.tenantId ? { 'x-tenant-id': config.tenantId } : {}),
        'x-request-id': crypto.randomUUID()
      }
    });
  }

  if (config.apiKey) {
    tokenRequestCandidates.push({
      body: {},
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        [config.apiKeyHeader]: config.apiKey,
        'x-api-key': config.apiKey,
        apiKey: config.apiKey,
        ...(config.tenantId ? { 'x-tenant-id': config.tenantId } : {}),
        'x-request-id': crypto.randomUUID()
      }
    });
  }

  if (tokenRequestCandidates.length === 0) {
    tokenRequestCandidates.push({
      body: {},
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(config.tenantId ? { 'x-tenant-id': config.tenantId } : {}),
        'x-request-id': crypto.randomUUID()
      }
    });
  }

  for (const tokenPath of tokenPaths) {
    const url = buildUrl(tokenPath);
    for (const candidate of tokenRequestCandidates) {
      const requestId = candidate.headers['x-request-id'] || crypto.randomUUID();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Number(timeoutMs) > 0 ? Number(timeoutMs) : config.timeoutMs);

      try {
        const headers = {
          ...candidate.headers,
          'x-request-id': requestId
        };

        console.info('[trustonic-token-request]', JSON.stringify({
          requestId,
          url: url.toString(),
          headers: sanitizeHeaders(headers)
        }));

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(candidate.body || {}),
          signal: controller.signal
        });

        const rawText = await response.text();
        const parsedBody = normalizeResponseBody(rawText);

        console.info('[trustonic-token-response]', JSON.stringify({
          requestId,
          url: url.toString(),
          status: response.status,
          body: parsedBody
        }));

        if (!response.ok) {
          const error = new Error(parsedBody.message || parsedBody.error || `Trustonic token request failed with HTTP ${response.status}.`);
          error.statusCode = response.status;
          error.response = parsedBody;
          error.requestId = requestId;
          lastError = error;
          if (response.status === 404 || response.status === 405 || response.status === 401) {
            continue;
          }
          throw error;
        }

        const token = extractTrustonicToken(parsedBody);
        if (!token) {
          const error = new Error('Trustonic token response did not include an access token.');
          error.statusCode = 502;
          error.response = parsedBody;
          error.requestId = requestId;
          throw error;
        }

        const expiresAt = Date.now() + Math.max(extractTrustonicTokenExpiresIn(parsedBody) * 1000, 60_000);
        cachedToken = token;
        cachedTokenExpiresAt = expiresAt;
        return { token, expiresAt };
      } catch (error) {
        lastError = error;
        if (error?.name === 'AbortError') {
          error.statusCode = 504;
          error.response = null;
          error.requestId = requestId;
        }
        if (error?.statusCode && [404, 405, 401].includes(error.statusCode) && tokenPath !== alternatePath) {
          continue;
        }
        if (!error.requestId) error.requestId = requestId;
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  throw lastError || new Error('Trustonic token request failed.');
}

function buildAuthHeaders(config, token, requestId) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-request-id': requestId,
    ...(config.tenantId ? { 'x-tenant-id': config.tenantId } : {})
  };
}

function detectDuplicateRegistration(responseBody = {}, message = '') {
  const normalizedMessage = String(message || responseBody?.message || responseBody?.error || '').toLowerCase();
  const rows = extractRows(responseBody);
  if (rows.some((row) => String(row?.error || '').toLowerCase().includes('already'))) return true;
  return normalizedMessage.includes('already exists') || normalizedMessage.includes('already registered') || normalizedMessage.includes('duplicate');
}

export async function trustonicRequest({
  method = 'GET',
  path,
  query = {},
  body,
  headers = {},
  timeoutMs,
  action = 'sync',
  allowNotFound = false
} = {}) {
  const config = validateTrustonicEnvironment();
  const url = buildUrl(path, query);
  const requestId = crypto.randomUUID();
  const requestTimeoutMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : config.timeoutMs;
  const startTime = Date.now();
  let accessToken = config.bearerToken;
  const requestBody = body && typeof body === 'object' ? safeJsonClone(body) || {} : {};

  if (!path.includes('/authorization/token')) {
    const tokenResult = await fetchAccessToken(config, requestTimeoutMs);
    accessToken = tokenResult.token;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  const requestHeaders = {
    ...buildAuthHeaders(config, accessToken, requestId),
    ...headers
  };
  const safePayload = body && typeof body === 'object' ? safeJsonClone(body) : body ?? null;

  try {
    console.info('[trustonic-request]', JSON.stringify({
      requestId,
      method: method.toUpperCase(),
      url: url.toString(),
      headers: sanitizeHeaders(requestHeaders),
      payload: safePayload
    }));

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      ...(method.toUpperCase() === 'GET' ? {} : { body: body === undefined ? undefined : JSON.stringify(body || {}) }),
      signal: controller.signal
    });

    const rawText = await response.text();
    const parsedBody = normalizeResponseBody(rawText);

    console.info('[trustonic-response]', JSON.stringify({
      requestId,
      method: method.toUpperCase(),
      url: url.toString(),
      status: response.status,
      body: parsedBody,
      executionTimeMs: Date.now() - startTime
    }));

    if (!response.ok || isResponseError(parsedBody, action)) {
      const errorMessage = extractTrustonicErrorMessage(parsedBody, action) || `Trustonic request failed with HTTP ${response.status}.`;
      const error = new Error(errorMessage);
      error.statusCode = response.status;
      error.response = parsedBody;
      error.requestId = requestId;
      error.url = url.toString();
      error.executionTimeMs = Date.now() - startTime;
      throw error;
    }

    let rows = extractRows(parsedBody);
    if (rows.length === 0 && ['register', 'lock', 'unlock', 'release'].includes(action)) {
      rows = buildFallbackRows(action, body || {}, parsedBody);
    }
    const responseResult = buildSuccessResponse({
      requestId,
      url: url.toString(),
      httpStatus: response.status,
      body: parsedBody,
      rows,
      action,
      config,
      executionTimeMs: Date.now() - startTime
    });

    if ((action === 'register' || action === 'lock' || action === 'unlock') && detectDuplicateRegistration(parsedBody, parsedBody.message || parsedBody.msg || '')) {
      const error = new Error('Trustonic device already exists.');
      error.statusCode = 409;
      error.response = parsedBody;
      error.requestId = requestId;
      error.url = url.toString();
      error.executionTimeMs = Date.now() - startTime;
      throw error;
    }

    return responseResult;
  } catch (error) {
    if (error?.name === 'AbortError') {
      error.statusCode = 504;
      error.message = 'Trustonic request timed out.';
      error.requestId = requestId;
      error.url = url.toString();
      error.executionTimeMs = Date.now() - startTime;
    }

    if (allowNotFound && isTrustonicNotFoundError(error)) {
      return buildTrustonicNotFoundResponse({
        requestId,
        url: url.toString(),
        httpStatus: error?.statusCode || 200,
        body: error?.response || {},
        requestBody,
        action,
        config,
        executionTimeMs: Date.now() - startTime
      });
    }

    if (error?.statusCode === 401 && !path.includes('/authorization/token')) {
      cachedToken = null;
      cachedTokenExpiresAt = 0;
    }

    console.error('[trustonic-error]', JSON.stringify({
      requestId,
      method: method.toUpperCase(),
      url: url.toString(),
      error: error.message,
      executionTimeMs: Date.now() - startTime
    }));

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function resolveExpiryFromOptions(options = {}, fallbackHours = DEFAULT_EXPIRY_HOURS, mode = 'future', bufferMs = DEFAULT_LOCK_BUFFER_MS) {
  const candidates = [
    options.expiry,
    options.expiration,
    options.nextDue,
    options.nextDueAt,
    options.next_due_at,
    options.unlockUntilAt,
    options.unlock_until_at,
    options.validUntil,
    options.valid_until,
    options.dueAt,
    options.due_at,
    options.customer?.paygo_next_due_at,
    options.customer?.paygo_usage_ends_at,
    options.customer?.unlock_until,
    options.customer?.due_date,
    options.payment?.next_due_at,
    options.payment?.due_date,
    options.metadata?.nextDueAt,
    options.metadata?.unlockUntilAt,
    options.metadata?.expiry
  ];

  for (const candidate of candidates) {
    const parsed = parseEpochLike(candidate);
    if (parsed !== null) return parsed;
  }

  const base = Date.now();
  if (mode === 'past') {
    return base - Math.max(Number(bufferMs) || 0, 1_000);
  }

  const hours = Number(fallbackHours) > 0 ? Number(fallbackHours) : DEFAULT_EXPIRY_HOURS;
  return base + (hours * 60 * 60 * 1000);
}

function buildDeviceUid(options = {}) {
  const firstRegisteredId = Array.isArray(options.registeredIds)
    ? options.registeredIds.map((value) => normalizeText(value)).find(Boolean)
    : '';
  return normalizeText(
    options.deviceUid ||
    firstRegisteredId ||
    options.lockerId ||
    options.locker_id ||
    options.product?.locker_id ||
    options.product?.lockerId ||
    options.registeredId ||
    options.imei ||
    options.product?.imei_1 ||
    options.product?.imei1 ||
    ''
  );
}

export function buildTrustonicRegistrationPayload({
  product = {},
  customer = null,
  payment = null,
  registeredId = '',
  registeredIds = [],
  metadata = {},
  state = '',
  expiry = null,
  deviceUid = '',
  deviceType = null,
  idType = null,
  serviceName = null,
  paymentMethod = null
} = {}) {
  const config = validateTrustonicEnvironment();
  const uid = buildDeviceUid({
    deviceUid: deviceUid || registeredId || product?.locker_id || product?.lockerId || product?.imei_1 || product?.imei1,
    registeredId,
    registeredIds,
    lockerId: product?.locker_id || product?.lockerId,
    imei: product?.imei_1 || product?.imei1
  });
  const resolvedExpiry = expiry !== null && expiry !== undefined && expiry !== ''
    ? parseEpochLike(expiry)
    : resolveExpiryFromOptions({ customer, payment, metadata, product }, config.defaultExpiryHours, 'future');

  const deviceListItem = {
    deviceType: normalizeText(deviceType || config.deviceType),
    idType: normalizeText(idType || config.idType),
    deviceUid: uid,
    additionalInfo: {
      expiry: toTrustonicEpoch(resolvedExpiry, config.epochUnit)
    },
    serviceList: [
      {
        paymentMethod: normalizeText(paymentMethod || config.paymentMethod),
        serviceName: normalizeText(serviceName || config.serviceName)
      }
    ]
  };

  const imei2 = normalizeText(product?.imei_2 || product?.imei2 || metadata?.imei2 || metadata?.imei_2 || '');
  if (imei2) {
    deviceListItem.customProperties = {
      '@imei2': imei2,
      '@expiry': String(toTrustonicEpoch(resolvedExpiry, config.epochUnit))
    };
  } else {
    deviceListItem.customProperties = {
      '@expiry': String(toTrustonicEpoch(resolvedExpiry, config.epochUnit))
    };
  }

  return {
    provider: 'trustonic',
    action: 'register',
    state: normalizeText(state || 'registered'),
    deviceUid: uid,
    deviceList: uid ? [deviceListItem] : [],
    customerId: normalizeText(customer?.id || ''),
    productId: normalizeText(product?.id || ''),
    imei2: imei2 || null,
    expiry: toTrustonicEpoch(resolvedExpiry, config.epochUnit),
    nextDueAt: fromTrustonicEpoch(resolvedExpiry),
    metadata: safeJsonClone(metadata) || {}
  };
}

export function buildLockPolicy({
  product = {},
  customer = null,
  payment = null,
  metadata = {},
  deviceUid = '',
  expiry = null,
  content = '',
  reason = '',
  state = 'locked'
} = {}) {
  const config = validateTrustonicEnvironment();
  const uid = buildDeviceUid({ product, deviceUid, registeredId: product?.locker_id, imei: product?.imei_1 });
  const resolvedExpiry = expiry !== null && expiry !== undefined && expiry !== ''
    ? parseEpochLike(expiry)
    : resolveExpiryFromOptions({ customer, payment, metadata, product }, config.lockBufferMinutes / 60, 'past', config.lockBufferMinutes * 60 * 1000);

  return {
    provider: 'trustonic',
    action: 'lock',
    state: normalizeText(state || 'locked'),
    deviceUid: uid,
    content: normalizeText(content || reason || 'Device is restricted for non-payment.'),
    reason: normalizeText(reason || ''),
    expiry: toTrustonicEpoch(resolvedExpiry, config.epochUnit),
    expiration: toTrustonicEpoch(resolvedExpiry, config.epochUnit),
    metadata: safeJsonClone(metadata) || {}
  };
}

export function buildUnlockPolicy({
  product = {},
  customer = null,
  payment = null,
  metadata = {},
  deviceUid = '',
  expiry = null,
  nextDueAt = null,
  content = '',
  reason = '',
  state = 'unlocked'
} = {}) {
  const config = validateTrustonicEnvironment();
  const uid = buildDeviceUid({ product, deviceUid, registeredId: product?.locker_id, imei: product?.imei_1 });
  const candidateExpiry = expiry !== null && expiry !== undefined && expiry !== ''
    ? expiry
    : nextDueAt !== null && nextDueAt !== undefined && nextDueAt !== ''
      ? nextDueAt
      : resolveExpiryFromOptions({ customer, payment, metadata, product }, config.unlockValidityHours, 'future');

  const resolvedExpiry = parseEpochLike(candidateExpiry);

  return {
    provider: 'trustonic',
    action: 'unlock',
    state: normalizeText(state || 'unlocked'),
    deviceUid: uid,
    content: normalizeText(content || reason || 'Your device has been unlocked.'),
    reason: normalizeText(reason || ''),
    expiry: toTrustonicEpoch(resolvedExpiry, config.epochUnit),
    expiration: toTrustonicEpoch(resolvedExpiry, config.epochUnit),
    nextDueAt: fromTrustonicEpoch(resolvedExpiry),
    metadata: safeJsonClone(metadata) || {}
  };
}

function buildRegisterBody(policy = {}) {
  const config = validateTrustonicEnvironment();
  const registration = buildTrustonicRegistrationPayload(policy);
  return {
    deviceList: registration.deviceList.map((item) => ({
      ...item,
      deviceType: normalizeText(item.deviceType || config.deviceType),
      idType: normalizeText(item.idType || config.idType)
    }))
  };
}

function buildUpdateExpirationBody(policy = {}, action = 'lock') {
  const config = validateTrustonicEnvironment();
  const base = action === 'unlock' ? buildUnlockPolicy(policy) : buildLockPolicy(policy);
  const resolvedExpiry = parseEpochLike(base.expiry ?? base.expiration ?? policy.expiry ?? policy.expiration);
  const deviceUid = buildDeviceUid(policy);
  if (resolvedExpiry === null) {
    throw new Error('Trustonic expiration must be an integer epoch timestamp.');
  }
  if (action === 'unlock' && resolvedExpiry <= Date.now()) {
    throw new Error('Trustonic expiration must be in the future.');
  }
  if (!deviceUid) {
    throw new Error('Trustonic deviceUid must be provided.');
  }
  return {
    updateExpirationList: [
      {
        deviceUid,
        expiration: toTrustonicEpoch(resolvedExpiry, config.epochUnit)
      }
    ]
  };
}

function buildStatusBody(options = {}) {
  const deviceUid = buildDeviceUid(options);
  return {
    deviceList: deviceUid ? [{ deviceUid }] : []
  };
}

function buildReleaseBody(options = {}) {
  const deviceUid = buildDeviceUid(options);
  return {
    deviceReleaseList: deviceUid ? [{ deviceUid }] : []
  };
}

async function runTrustonicAction(action, {
  product = {},
  customer = null,
  payment = null,
  body = null,
  deviceInfos = null,
  registeredIds = null,
  timeoutMs
} = {}) {
  const config = validateTrustonicEnvironment();
  const uid = buildDeviceUid({
    product,
    deviceUid: body?.deviceUid || body?.device_uid,
    registeredIds,
    registeredId: registeredIds?.[0] || body?.registeredId || body?.registered_id,
    lockerId: product?.locker_id || product?.lockerId,
    imei: product?.imei_1 || product?.imei1 || deviceInfos?.flat?.()?.[0],
    deviceInfos
  });
  let requestBody = body;

  if (!requestBody) {
    if (action === 'register') {
      requestBody = buildRegisterBody({ product, customer, payment, deviceUid: uid });
    } else if (action === 'lock' || action === 'unlock') {
      requestBody = buildUpdateExpirationBody({
        product,
        customer,
        payment,
        deviceUid: uid,
        ...(action === 'unlock' ? buildUnlockPolicy({ product, customer, payment, deviceUid: uid }) : buildLockPolicy({ product, customer, payment, deviceUid: uid }))
      }, action);
    } else if (action === 'release') {
      requestBody = buildReleaseBody({ product, deviceUid: uid });
    } else {
      requestBody = buildStatusBody({ product, deviceUid: uid });
    }
  }

  const path =
    action === 'register' ? config.registerPath :
    action === 'lock' || action === 'unlock' ? config.updatePath :
    action === 'release' ? config.releasePath :
    config.statusPath;

  const request = await trustonicRequest({
    method: action === 'release' ? 'PUT' : action === 'register' ? 'POST' : action === 'lock' || action === 'unlock' ? 'POST' : 'POST',
    path,
    body: requestBody,
    timeoutMs,
    action
  });

  const rowState = request.rows[0]?.lockStatus || request.rows[0]?.status || request.rows[0]?.state || '';
  if (uid && rowState) {
    rememberDeviceState({ deviceUid: uid, expiration: request.rows[0]?.expiration }, rowState, request.rows[0]);
  }

  return request;
}

export async function importDevice({ deviceInfos, registeredIds, body, product, customer, payment, timeoutMs } = {}) {
  const uid = buildDeviceUid({
    product,
    deviceUid: body?.deviceUid || body?.device_uid,
    registeredIds,
    registeredId: registeredIds?.[0] || body?.registeredId || body?.registered_id,
    lockerId: product?.locker_id || product?.lockerId,
    imei: product?.imei_1 || product?.imei1 || deviceInfos?.flat?.()?.[0],
    deviceInfos
  });
  const requestBody = body && typeof body === 'object'
    ? body
    : buildRegisterBody({
        product,
        customer,
        payment,
        deviceUid: uid,
        metadata: {
          deviceInfos
        }
      });

  return trustonicRequest({
    method: 'POST',
    path: validateTrustonicEnvironment().registerPath,
    body: requestBody,
    timeoutMs,
    action: 'register'
  });
}

export async function deliverLock({ product, customer, payment, registeredIds, deviceInfos, lockPolicy, body, timeoutMs } = {}) {
  const uid = buildDeviceUid({
    product,
    deviceUid: body?.deviceUid || body?.device_uid,
    registeredIds,
    registeredId: registeredIds?.[0] || body?.registeredId || body?.registered_id,
    lockerId: product?.locker_id || product?.lockerId,
    imei: product?.imei_1 || product?.imei1 || deviceInfos?.flat?.()?.[0],
    deviceInfos
  });
  const policy = body && typeof body === 'object'
    ? body
    : lockPolicy && typeof lockPolicy === 'object'
      ? lockPolicy
      : buildLockPolicy({ product, customer, payment, deviceUid: uid });

  const requestBody = buildUpdateExpirationBody({
    product,
    customer,
    payment,
    deviceUid: uid,
    ...policy,
    expiry: policy.expiry ?? policy.expiration
  }, 'lock');

  return trustonicRequest({
    method: 'POST',
    path: validateTrustonicEnvironment().updatePath,
    body: requestBody,
    timeoutMs,
    action: 'lock'
  });
}

export async function unlockDevice({ product, customer, payment, registeredIds, deviceInfos, unlockPolicy, body, timeoutMs } = {}) {
  const uid = buildDeviceUid({
    product,
    deviceUid: body?.deviceUid || body?.device_uid,
    registeredIds,
    registeredId: registeredIds?.[0] || body?.registeredId || body?.registered_id,
    lockerId: product?.locker_id || product?.lockerId,
    imei: product?.imei_1 || product?.imei1 || deviceInfos?.flat?.()?.[0],
    deviceInfos
  });
  const policy = body && typeof body === 'object'
    ? body
    : unlockPolicy && typeof unlockPolicy === 'object'
      ? unlockPolicy
      : buildUnlockPolicy({ product, customer, payment, deviceUid: uid });

  const config = validateTrustonicEnvironment();
  const balanceCandidates = [
    customer?.balance,
    payment?.balance,
    customer?.remainingBalance,
    payment?.remainingBalance
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const resolvedBalance = balanceCandidates.length > 0 ? Math.min(...balanceCandidates) : null;
  const hasAccountContext = Boolean(customer || payment);
  const isFinalRelease = resolvedBalance !== null && resolvedBalance <= 0 || [
    customer?.status,
    customer?.paygo_schedule_status
  ].some((value) => {
    const normalized = normalizeText(value).toLowerCase();
    return ['paid', 'completed', 'released', 'complete', 'done', 'success'].includes(normalized);
  });

  if (config.releaseOnUnlock && (!hasAccountContext || isFinalRelease)) {
    const requestBody = buildReleaseBody({ product, deviceUid: uid });
    return trustonicRequest({
      method: 'PUT',
      path: config.releasePath,
      body: requestBody,
      timeoutMs,
      action: 'unlock'
    });
  }

  const requestBody = buildUpdateExpirationBody({
    product,
    customer,
    payment,
    deviceUid: uid,
    ...policy,
    expiry: policy.expiry ?? policy.expiration ?? policy.nextDueAt ?? policy.nextDue
  }, 'unlock');

  return trustonicRequest({
    method: 'POST',
    path: config.updatePath,
    body: requestBody,
    timeoutMs,
    action: 'unlock'
  });
}

export async function queryDevice({ product, registeredId, deviceUid, deviceInfos, action = 'sync', timeoutMs } = {}) {
  const uid = buildDeviceUid({
    product,
    deviceUid,
    registeredId,
    lockerId: product?.locker_id || product?.lockerId,
    imei: product?.imei_1 || product?.imei1 || deviceInfos?.flat?.()?.[0],
    deviceInfos
  });

  const request = await trustonicRequest({
    method: 'POST',
    path: validateTrustonicEnvironment().statusPath,
    body: buildStatusBody({ product, deviceUid: uid }),
    timeoutMs,
    action,
    allowNotFound: true
  });

  const fallbackRows = request.rows.length > 0
    ? request.rows
    : buildFallbackRows(action, {
        deviceUid: uid
      }, request.body || {});
  const hasNotFoundRow = fallbackRows.some((row) => {
    const code = String(
      row?.resultCode ||
      row?.result_code ||
      row?.errorCode ||
      row?.error_code ||
      ''
    ).toLowerCase().replace(/[\s_-]+/g, '');
    if (code.includes('notfound')) return true;

    const message = String(
      row?.resultMessage ||
      row?.result_message ||
      row?.message ||
      row?.msg ||
      ''
    ).toLowerCase().replace(/[\s_-]+/g, '');
    return message.includes('notfound');
  });
  const notFoundFallbackState = request.body?.notFound || hasNotFoundRow ? 'unknown' : '';

  const normalizedRows = fallbackRows.map((row) => {
    const cached = getRememberedDeviceState(row.deviceUid || uid);
    const inferred = inferTrustonicState(row, action, validateTrustonicEnvironment()) || cached?.state || notFoundFallbackState || (action === 'lock' ? 'locked' : action === 'unlock' ? 'unlocked' : action === 'register' ? 'registered' : 'synced');
    return {
      ...row,
      status: inferred,
      state: inferred,
      result: inferred,
      resultStatus: inferred,
      taskStatus: inferred,
      operationStatus: inferred,
      lockStatus: inferred,
      operationType:
        inferred === 'unlocked' ? 4 :
        inferred === 'locked' ? 3 :
        inferred === 'registered' ? 1 :
        action === 'lock' ? 3 :
        action === 'unlock' ? 4 :
        action === 'register' ? 1 :
        row.operationType || 2,
      operationResult: row.error ? 1 : 0,
      expiration: row.expiration ?? cached?.expiration ?? null,
      expiry: row.expiry ?? cached?.expiration ?? null
    };
  });
  const firstNotFoundRow = hasNotFoundRow
    ? fallbackRows.find((row) => {
        const code = String(
          row?.resultCode ||
          row?.result_code ||
          row?.errorCode ||
          row?.error_code ||
          ''
        ).toLowerCase().replace(/[\s_-]+/g, '');
        if (code.includes('notfound')) return true;
        const message = String(
          row?.resultMessage ||
          row?.result_message ||
          row?.message ||
          row?.msg ||
          ''
        ).toLowerCase().replace(/[\s_-]+/g, '');
        return message.includes('notfound');
      })
    : null;

  const responseBody = {
    ...request.body,
    data: normalizedRows,
    devices: normalizedRows,
    deviceList: normalizedRows,
    code: request.body?.code ?? 20000000,
    message: request.body?.message || request.body?.msg || '',
    notFound: request.body?.notFound || hasNotFoundRow,
    warningCode: request.body?.warningCode || firstNotFoundRow?.resultCode || firstNotFoundRow?.result_code || firstNotFoundRow?.errorCode || firstNotFoundRow?.error_code || '',
    warningMessage: request.body?.warningMessage || firstNotFoundRow?.resultMessage || firstNotFoundRow?.result_message || firstNotFoundRow?.message || firstNotFoundRow?.msg || ''
  };

  return {
    ...request,
    body: responseBody,
    rows: normalizedRows,
    taskId: request.taskId || normalizedRows[0]?.deviceUid || uid || request.requestId
  };
}

export async function queryTask({ product, registeredId, deviceUid, deviceInfos, action = 'sync', timeoutMs } = {}) {
  return queryDevice({ product, registeredId, deviceUid, deviceInfos, action, timeoutMs });
}

export async function releaseDevice({ product, registeredId, deviceUid, deviceInfos, timeoutMs } = {}) {
  const uid = buildDeviceUid({
    product,
    deviceUid,
    registeredId,
    lockerId: product?.locker_id || product?.lockerId,
    imei: product?.imei_1 || product?.imei1 || deviceInfos?.flat?.()?.[0],
    deviceInfos
  });

  return trustonicRequest({
    method: 'PUT',
    path: validateTrustonicEnvironment().releasePath,
    body: buildReleaseBody({ product, deviceUid: uid }),
    timeoutMs,
    action: 'unlock'
  });
}

export function trustonicDiagnostics() {
  try {
    const config = validateTrustonicEnvironment();
    const authMode = config.bearerToken
      ? 'bearer'
      : config.apiKey
        ? 'api-key'
        : (config.username && config.password) || (config.clientId && config.clientSecret)
          ? 'credentials'
          : 'missing';
    return {
      provider: 'trustonic',
      configured: Boolean(config.apiBase && authMode !== 'missing' && config.assignedPolicy),
      baseUrl: config.apiBase,
      variant: config.variant,
      appIdConfigured: Boolean(config.tenantId || config.assignedPolicy),
      appIdMasked: maskSecret(config.tenantId || config.assignedPolicy),
      appKeyConfigured: Boolean(config.apiKey || config.bearerToken || config.username || config.password || config.clientId || config.clientSecret),
      appKeyMasked: maskSecret(config.apiKey || config.bearerToken || config.username || config.clientId),
      apiKeyConfigured: Boolean(config.apiKey),
      bearerTokenConfigured: Boolean(config.bearerToken),
      usernameConfigured: Boolean(config.username),
      passwordConfigured: Boolean(config.password),
      clientIdConfigured: Boolean(config.clientId),
      clientSecretConfigured: Boolean(config.clientSecret),
      authMode,
      apiKeyHeader: config.apiKeyHeader,
      tenantIdConfigured: Boolean(config.tenantId),
      serviceNameConfigured: Boolean(config.serviceName),
      assignedPolicyConfigured: Boolean(config.assignedPolicy),
      lockPolicyConfigured: Boolean(config.lockPolicy),
      unlockPolicyConfigured: Boolean(config.unlockPolicy),
      deviceType: config.deviceType,
      idType: config.idType,
      paymentMethod: config.paymentMethod,
      tokenPath: config.tokenPath,
      registerPath: config.registerPath,
      updatePath: config.updatePath,
      releasePath: config.releasePath,
      activatePath: config.activatePath,
      deletePath: config.deletePath,
      statusPath: config.statusPath,
      notifyPath: config.notifyPath,
      pinPath: config.pinPath,
      timeoutMs: config.timeoutMs,
      epochUnit: config.epochUnit,
      defaultExpiryHours: config.defaultExpiryHours,
      unlockValidityHours: config.unlockValidityHours,
      lockBufferMinutes: config.lockBufferMinutes,
      releaseOnUnlock: config.releaseOnUnlock
    };
  } catch (error) {
    const config = buildConfig();
    const authMode = config.bearerToken
      ? 'bearer'
      : config.apiKey
        ? 'api-key'
        : (config.username && config.password) || (config.clientId && config.clientSecret)
          ? 'credentials'
          : 'missing';
    return {
      provider: 'trustonic',
      configured: false,
      configError: error?.message || 'Trustonic is not configured.',
      baseUrl: config.apiBase,
      variant: config.variant || 'journey-v2',
      appIdConfigured: Boolean(config.tenantId || config.assignedPolicy),
      appIdMasked: '',
      appKeyConfigured: Boolean(config.apiKey || config.bearerToken || config.username || config.password || config.clientId || config.clientSecret),
      appKeyMasked: '',
      apiKeyConfigured: Boolean(config.apiKey),
      bearerTokenConfigured: Boolean(config.bearerToken),
      usernameConfigured: Boolean(config.username),
      passwordConfigured: Boolean(config.password),
      clientIdConfigured: Boolean(config.clientId),
      clientSecretConfigured: Boolean(config.clientSecret),
      authMode,
      apiKeyHeader: config.apiKeyHeader || 'x-api-key',
      tenantIdConfigured: Boolean(config.tenantId),
      serviceNameConfigured: Boolean(config.serviceName),
      assignedPolicyConfigured: Boolean(config.assignedPolicy),
      lockPolicyConfigured: Boolean(config.lockPolicy),
      unlockPolicyConfigured: Boolean(config.unlockPolicy),
      deviceType: config.deviceType || 'mobile',
      idType: config.idType || 'imei',
      paymentMethod: config.paymentMethod || 'prepaid',
      tokenPath: config.tokenPath || '/api/v2/authorization/token',
      registerPath: config.registerPath || '/api/v2/inventory/upload',
      updatePath: config.updatePath || '/api/v2/device/updateExpiration',
      releasePath: config.releasePath || '/api/v2/device/release',
      activatePath: config.activatePath || '/api/v2/service/activate',
      deletePath: config.deletePath || '/api/v2/service',
      statusPath: config.statusPath || '/api/v2/query/devices',
      notifyPath: config.notifyPath || '/api/v2/device/notify',
      pinPath: config.pinPath || '/api/v2/device/pinunlock',
      timeoutMs: config.timeoutMs || DEFAULT_TIMEOUT_MS,
      epochUnit: config.epochUnit || 'seconds',
      defaultExpiryHours: config.defaultExpiryHours || DEFAULT_EXPIRY_HOURS,
      unlockValidityHours: config.unlockValidityHours || DEFAULT_UNLOCK_VALIDITY_HOURS,
      lockBufferMinutes: config.lockBufferMinutes || 1,
      releaseOnUnlock: Boolean(config.releaseOnUnlock)
    };
  }
}
