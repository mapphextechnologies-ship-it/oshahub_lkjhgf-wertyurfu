import crypto from 'node:crypto';
import './logging.js';

const DEFAULT_TIMEOUT_MS = 15_000;

function envValue(name) {
  return String(process.env[name] || '').trim();
}

function normalizeHonorCredential(value) {
  return String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/[,\s]+$/g, '');
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
  if (!trimmed) return '';
  return trimmed.replace(/\/api$/i, '');
}

function getMissingHonorConfigFields(config = {}) {
  const missing = [];
  if (!config.apiBase) missing.push('HONOR_API_BASE or HONOR_BASE_URL');
  if (!config.appId) missing.push('HONOR_APP_ID or HONOR_USERNAME');
  if (!config.appKey) missing.push('HONOR_APP_KEY or HONOR_PASSWORD');
  return missing;
}

function requireConfig() {
  const signAlgorithmRaw = coalesceEnv('HONOR_SIGN_ALGORITHM', 'PHONE_LOCKER_SIGN_ALGORITHM') || 'SHA256';
  const config = {
    apiBase: normalizeBaseUrl(coalesceEnv('HONOR_API_BASE', 'HONOR_BASE_URL', 'PHONE_LOCKER_BASE_URL')),
    appId: normalizeHonorCredential(coalesceEnv('HONOR_APP_ID', 'HONOR_USERNAME', 'PHONE_LOCKER_APP_ID')),
    appKey: normalizeHonorCredential(coalesceEnv('HONOR_APP_KEY', 'HONOR_PASSWORD', 'PHONE_LOCKER_APP_KEY')),
    contactNumber: coalesceEnv('HONOR_CONTACT_NUMBER', 'PHONE_LOCKER_CONTACT_NUMBER'),
    supportEmail: coalesceEnv('HONOR_SUPPORT_EMAIL', 'PHONE_LOCKER_SUPPORT_EMAIL'),
    allowIncomingList: coalesceEnv('HONOR_ALLOW_INCOMING_LIST', 'PHONE_LOCKER_ALLOW_INCOMING_LIST'),
    allowAppList: coalesceEnv('HONOR_ALLOW_APP_LIST', 'PHONE_LOCKER_ALLOW_APP_LIST'),
    lockContent: coalesceEnv('HONOR_LOCK_CONTENT', 'PHONE_LOCKER_LOCK_CONTENT'),
    unlockContent: coalesceEnv('HONOR_UNLOCK_CONTENT', 'PHONE_LOCKER_UNLOCK_CONTENT'),
    reminderTitle: coalesceEnv('HONOR_REMIND_TITLE', 'PHONE_LOCKER_REMIND_TITLE'),
    reminderContent: coalesceEnv('HONOR_REMIND_CONTENT', 'PHONE_LOCKER_REMIND_CONTENT'),
    signAlgorithm: normalizeHonorSignAlgorithm(signAlgorithmRaw),
    timeoutMs: Number(coalesceEnv('HONOR_TIMEOUT_MS', 'PHONE_LOCKER_TIMEOUT_MS')) || DEFAULT_TIMEOUT_MS
  };

  const missing = getMissingHonorConfigFields(config);
  if (missing.length > 0) {
    const error = new Error(`Honor locker is not configured. Set these environment variables: ${missing.join(', ')}.`);
    error.statusCode = 500;
    error.code = 'HONOR_CONFIG_MISSING';
    throw error;
  }

  return config;
}

function formatHonorTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function normalizeHonorPath(serviceUri = '') {
  const normalized = String(serviceUri || '').trim();
  if (!normalized) return '/';
  if (normalized === '/') return '/';
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return withLeadingSlash.replace(/^\/api(?=\/|$)/i, '');
}

function normalizeHonorSignAlgorithm(value) {
  const normalized = String(value || '').trim().toUpperCase();
  const collapsed = normalized.replace(/[\s_-]+/g, '');

  if (!collapsed) return 'SHA256';
  if (collapsed === 'AUTO' || collapsed === 'DEFAULT') return 'AUTO';
  if (collapsed === 'HMACSHA256' || collapsed === 'HMACSHA1') return 'HMAC-SHA256';
  if (collapsed === 'SHA256') return 'SHA256';
  return normalized;
}

function buildHonorSignAlgorithmCandidates(value) {
  const normalized = normalizeHonorSignAlgorithm(value);
  if (normalized === 'AUTO') return ['SHA256', 'HMAC-SHA256'];
  if (normalized === 'HMAC-SHA256') return ['HMAC-SHA256', 'SHA256'];
  if (normalized === 'SHA256') return ['SHA256', 'HMAC-SHA256'];
  if (normalized.startsWith('HMAC')) return [normalized, 'SHA256'];
  return [normalized, 'SHA256'];
}

function buildHonorSignAlgoHeaderValue(signAlgorithm) {
  const normalized = normalizeHonorSignAlgorithm(signAlgorithm);
  if (!normalized.startsWith('HMAC')) return '';
  return 'HmacSHA256';
}

function asciiCompare(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  const length = Math.min(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const diff = a.charCodeAt(index) - b.charCodeAt(index);
    if (diff !== 0) return diff;
  }

  return a.length - b.length;
}

function flattenHonorParameters(value, prefix = '', output = []) {
  if (value === undefined || value === null || value === '') {
    return output;
  }

  if (value instanceof URLSearchParams) {
    return flattenHonorParameters(Object.fromEntries([...value.entries()]), prefix, output);
  }

  if (Array.isArray(value)) {
    if (value.every((item) => item === null || item === undefined || ['string', 'number', 'boolean'].includes(typeof item))) {
      if (prefix) {
        output.push([prefix, value.map((item) => String(item)).join(',')]);
      }
      return output;
    }

    value.forEach((item, index) => {
      const nextPrefix = prefix ? `${prefix}.${index}` : String(index);
      flattenHonorParameters(item, nextPrefix, output);
    });
    return output;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null && item !== '');
    entries.sort(([leftKey], [rightKey]) => asciiCompare(leftKey, rightKey));

    for (const [key, item] of entries) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      flattenHonorParameters(item, nextPrefix, output);
    }
    return output;
  }

  if (prefix) {
    output.push([prefix, String(value)]);
  }

  return output;
}

function canonicalHonorParameters(input = {}) {
  const flattened = flattenHonorParameters(input)
    .filter(([key]) => key)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyDiff = asciiCompare(leftKey, rightKey);
      if (keyDiff !== 0) return keyDiff;
      const left = String(leftValue);
      const right = String(rightValue);
      return asciiCompare(left, right);
    });

  return flattened.map(([key, value]) => `${key}=${value}`).join('|');
}

export { canonicalHonorParameters };
export { getMissingHonorConfigFields };

function generateSignature({
  serviceUri,
  httpMethod,
  parameters = '',
  timestamp,
  appId,
  appKey,
  signAlgorithm = 'SHA256'
} = {}) {
  const normalizedServiceUri = normalizeHonorPath(serviceUri);
  const normalizedMethod = String(httpMethod || 'GET').toUpperCase();
  const normalizedParameters = String(parameters || '').trim();
  const normalizedTimestamp = String(timestamp || '').trim();
  const normalizedAppId = String(appId || '').trim();
  const normalizedAppKey = String(appKey || '').trim();
  const algorithm = normalizeHonorSignAlgorithm(signAlgorithm);

  if (algorithm.startsWith('HMAC')) {
    const segments = [
      normalizedServiceUri,
      normalizedMethod
    ];

    if (normalizedParameters) {
      segments.push(normalizedParameters);
    }

    segments.push(
      normalizedTimestamp,
      normalizedAppId
    );

    const text = segments.join('|');
    return crypto.createHmac('sha256', normalizedAppKey).update(text).digest('hex');
  }

  const segments = [
    normalizedServiceUri,
    normalizedMethod
  ];

  if (normalizedParameters) {
    segments.push(normalizedParameters);
  }

  segments.push(
    normalizedTimestamp,
    normalizedAppId,
    normalizedAppKey
  );

  return crypto.createHash('sha256').update(segments.join('|')).digest('hex');
}

function sanitizeHeaders(headers = {}) {
  const output = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowered = key.toLowerCase();
    if (['x-ry-signature', 'x-ry-sign'].includes(lowered)) {
      const text = String(value || '');
      output[key] = text ? `${text.slice(0, 8)}...${text.slice(-8)}` : '';
      continue;
    }
    if (['authorization'].includes(lowered)) continue;
    if (['x-ry-id', 'x-requestid', 'x-request-id'].includes(lowered)) {
      output[key] = String(value || '').slice(0, 8) ? `${String(value).slice(0, 6)}...` : '';
      continue;
    }
    output[key] = value;
  }
  return output;
}

function isHonorAuthorizationFailure(responseBody = {}, fallbackMessage = '') {
  const message = String(responseBody?.message || responseBody?.msg || fallbackMessage || '').trim().toLowerCase();
  return Number(responseBody?.code || 0) === 401 || message.includes('authorization failure') || message.includes('authorization failed');
}

function safeJsonClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function normalizeDeviceIds(value) {
  return [...new Set((Array.isArray(value) ? value : [value]).map((item) => String(item || '').trim()).filter(Boolean))];
}

function normalizeHonorList(value) {
  return String(value || '')
    .split(/[;, \n\r\t]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(';');
}

function normalizeHonorBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseHonorResponseBody(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Honor response body was empty.' };
  }

  const code = Number(data.code || 0);
  const message = data.message || data.msg || '';
  const rows = Array.isArray(data.data)
    ? data.data
    : data.data && typeof data.data === 'object'
      ? [data.data]
      : [];

  const failedRow = rows.find((row) => {
    if (!row || typeof row !== 'object') return false;
    if (Object.prototype.hasOwnProperty.call(row, 'code')) {
      return Number(row.code || 0) !== 20000000;
    }
    if (Object.prototype.hasOwnProperty.call(row, 'resultCode')) {
      return Number(row.resultCode || 0) !== 0;
    }
    if (Object.prototype.hasOwnProperty.call(row, 'errorCode')) {
      return Number(row.errorCode || 0) !== 0;
    }
    if (Object.prototype.hasOwnProperty.call(row, 'operationResult')) {
      return Number(row.operationResult || 0) !== 0;
    }
    return false;
  });
  if (failedRow) {
    return {
      ok: false,
      error: failedRow.message || message || 'Honor returned an error.',
      rows,
      code
    };
  }

  if (code && code !== 20000000) {
    return {
      ok: false,
      error: message || 'Honor returned an error.',
      rows,
      code
    };
  }

  return {
    ok: true,
    rows,
    code
  };
}

function buildUrl(path, query = {}) {
  const config = requireConfig();
  const base = config.apiBase.endsWith('/api') ? config.apiBase : `${config.apiBase}/api`;
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

export function validateHonorEnvironment() {
  return requireConfig();
}

function getTaskId(result = {}, rows = [], fallbackRequestId = '') {
  const rowTaskId = rows.find((row) => row && (row.taskId || row.task_id || row.requestId || row.request_id || row.registeredId || row.registered_id));
  return (
    rowTaskId?.taskId ||
    rowTaskId?.task_id ||
    rowTaskId?.requestId ||
    rowTaskId?.request_id ||
    rowTaskId?.registeredId ||
    rowTaskId?.registered_id ||
    result.taskId ||
    result.task_id ||
    result.requestId ||
    result.request_id ||
    result.registeredId ||
    result.registered_id ||
    fallbackRequestId ||
    ''
  );
}

export async function honorRequest({
  method = 'GET',
  path,
  query = {},
  body,
  headers = {},
  timeoutMs,
  retryCount = 3
} = {}) {
  const config = requireConfig();
  const url = buildUrl(path, query);
  const requestTimeoutMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : (config.timeoutMs || DEFAULT_TIMEOUT_MS);
  let lastError = null;
  const startTime = Date.now();

  const signAlgorithmCandidates = buildHonorSignAlgorithmCandidates(config.signAlgorithm);

  for (let candidateIndex = 0; candidateIndex < signAlgorithmCandidates.length; candidateIndex += 1) {
    const signAlgorithm = signAlgorithmCandidates[candidateIndex];
    const requestId = crypto.randomUUID();
    const timestamp = formatHonorTimestamp();
    const parameters = method.toUpperCase() === 'GET'
      ? canonicalHonorParameters(Object.fromEntries(url.searchParams.entries()))
      : '';
    const signature = generateSignature({
      serviceUri: url.pathname,
      httpMethod: method,
      parameters,
      timestamp,
      appId: config.appId,
      appKey: config.appKey,
      signAlgorithm
    });

    const requestHeaders = {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=UTF-8',
      'X-RY-ID': config.appId,
      'X-RY-DATE': timestamp,
      'X-RY-SIGN': signature,
      ...(buildHonorSignAlgoHeaderValue(signAlgorithm)
        ? {
            'X-RY-SIGN-ALGOS': buildHonorSignAlgoHeaderValue(signAlgorithm),
            'x-ry-sign-algos': buildHonorSignAlgoHeaderValue(signAlgorithm)
          }
        : {}),
      'x-requestId': requestId,
      'x-request-id': requestId,
      ...headers
    };

    const safePayload = body && typeof body === 'object' ? safeJsonClone(body) : body ?? null;
    const safeHeaders = sanitizeHeaders(requestHeaders);
    let attempt = 0;

    while (attempt < retryCount) {
      attempt += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

      try {
        console.info('[honor-request]', JSON.stringify({
          attempt,
          method: method.toUpperCase(),
          url: url.toString(),
          headers: safeHeaders,
          payload: safePayload,
          signatureInput: {
            serviceUri: normalizeHonorPath(url.pathname),
            method: method.toUpperCase(),
            parameters,
            timestamp,
            signAlgorithm
          }
        }));

        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          ...(method.toUpperCase() === 'GET' ? {} : { body: JSON.stringify(body || {}) }),
          signal: controller.signal
        });

        const rawText = await response.text();
        let parsedBody = {};
        try {
          parsedBody = rawText ? JSON.parse(rawText) : {};
        } catch {
          parsedBody = { raw: rawText };
        }

        console.info('[honor-response]', JSON.stringify({
          attempt,
          url: url.toString(),
          status: response.status,
          body: parsedBody,
          executionTimeMs: Date.now() - startTime
        }));

        if (!response.ok) {
          const error = new Error(parsedBody.message || parsedBody.error || `Honor request failed with HTTP ${response.status}.`);
          error.statusCode = response.status;
          error.response = parsedBody;
          error.requestId = requestId;

          if (response.status === 401 && candidateIndex < signAlgorithmCandidates.length - 1) {
            console.warn('[honor-auth-fallback]', JSON.stringify({
              attempt,
              url: url.toString(),
              from: signAlgorithm,
              to: signAlgorithmCandidates[candidateIndex + 1],
              status: response.status
            }));
            lastError = error;
            break;
          }

          throw error;
        }

        const parsedResult = parseHonorResponseBody(parsedBody);
        if (!parsedResult.ok) {
          const error = new Error(parsedResult.error);
          error.statusCode = response.status;
          error.response = parsedBody;
          error.requestId = requestId;

          if (isHonorAuthorizationFailure(parsedBody, error.message) && candidateIndex < signAlgorithmCandidates.length - 1) {
            console.warn('[honor-auth-fallback]', JSON.stringify({
              attempt,
              url: url.toString(),
              from: signAlgorithm,
              to: signAlgorithmCandidates[candidateIndex + 1],
              status: response.status
            }));
            lastError = error;
            break;
          }

          throw error;
        }

        return {
          success: true,
          requestId,
          url: url.toString(),
          status: response.status,
          body: parsedBody,
          rows: parsedResult.rows,
          taskId: getTaskId(parsedBody, parsedResult.rows, requestId),
          executionTimeMs: Date.now() - startTime
        };
      } catch (error) {
        lastError = error;
        const retryable = error?.name === 'TypeError' || error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT';
        console.error('[honor-error]', JSON.stringify({
          attempt,
          url: url.toString(),
          error: error.message,
          executionTimeMs: Date.now() - startTime
        }));

        if (!retryable || attempt >= retryCount) {
          error.requestId = requestId;
          error.url = url.toString();
          error.executionTimeMs = Date.now() - startTime;
          if ((error.statusCode === 401 || isHonorAuthorizationFailure(error.response || {}, error.message)) && candidateIndex < signAlgorithmCandidates.length - 1) {
            break;
          }
          throw error;
        }

        const backoffMs = 250 * (2 ** (attempt - 1));
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      } finally {
        clearTimeout(timer);
      }
    }
  }

  throw lastError || new Error('Honor request failed.');
}

export async function importDevice({ deviceInfos, registeredIds, body, timeoutMs } = {}) {
  const payload = body && typeof body === 'object'
    ? body
    : {
        deviceInfos: Array.isArray(deviceInfos) ? deviceInfos : [normalizeDeviceIds(registeredIds)]
      };

  return honorRequest({
    method: 'POST',
    path: '/api/devicelock/v1/devices/import',
    body: payload,
    timeoutMs
  });
}

export async function deliverLock({ registeredIds, lockPolicy, timeoutMs } = {}) {
  return honorRequest({
    method: 'POST',
    path: '/api/devicelock/v1/lock/deliver',
    body: {
      registeredIds: normalizeDeviceIds(registeredIds),
      lockPolicy: buildLockPolicy(lockPolicy)
    },
    timeoutMs
  });
}

export async function unlockDevice({ registeredIds, unlockPolicy, timeoutMs } = {}) {
  return honorRequest({
    method: 'POST',
    path: '/api/devicelock/v1/unlock/deliver',
    body: {
      registeredIds: normalizeDeviceIds(registeredIds),
      unlockPolicy: buildUnlockPolicy(unlockPolicy)
    },
    timeoutMs
  });
}

export async function queryDevice({ registeredId, pageNum = 1, pageSize = 10, timeoutMs } = {}) {
  return honorRequest({
    method: 'GET',
    path: '/api/devicelock/v1/devices',
    query: {
      registeredId,
      pageNum,
      pageSize
    },
    timeoutMs
  });
}

export async function queryTask({ registeredId, pageNum = 1, pageSize = 10, timeoutMs } = {}) {
  return honorRequest({
    method: 'GET',
    path: '/api/devicelock/v1/devices/operationlogs',
    query: {
      registeredId,
      pageNum,
      pageSize
    },
    timeoutMs
  });
}

export function buildLockPolicy({
  content,
  contactNumber,
  supportEmail,
  forbidIncomingCall = false,
  allowIncomingList,
  supportUserRefresh = true,
  allowApp = true,
  allowAppList
} = {}) {
  const config = validateHonorEnvironment();
  const resolvedAllowIncomingList = normalizeHonorList(allowIncomingList ?? config.allowIncomingList);
  const resolvedAllowAppList = normalizeHonorList(allowAppList ?? config.allowAppList);
  const resolvedContactNumber = String(contactNumber ?? config.contactNumber ?? '').trim();
  const resolvedSupportEmail = String(supportEmail ?? config.supportEmail ?? '').trim();

  return {
    content: content || 'PAYGO lock active. Contact support to restore access.',
    ...(resolvedContactNumber ? { contactNumber: resolvedContactNumber } : {}),
    ...(resolvedSupportEmail ? { emailAddress: resolvedSupportEmail } : {}),
    forbidIncomingCall: Boolean(forbidIncomingCall),
    ...(resolvedAllowIncomingList ? { allowIncomingList: resolvedAllowIncomingList } : {}),
    supportUserRefresh,
    allowApp: normalizeHonorBoolean(allowApp, true),
    ...(resolvedAllowAppList ? { allowAppList: resolvedAllowAppList } : {})
  };
}

export function buildUnlockPolicy({ content } = {}) {
  const config = validateHonorEnvironment();
  const resolvedContent = String(content ?? config.unlockContent ?? '').trim();

  return {
    content: resolvedContent || 'Your device has been unlocked.'
  };
}

export function buildHonorRegistrationPayload({
  product = {},
  customer = null
} = {}) {
  const deviceId = String(
    product.imei_1 ||
    product.imei1 ||
    product.serial_number ||
    product.serialNumber ||
    product.chassis_number ||
    product.chassisNumber ||
    product.id ||
    ''
  ).trim();

  return {
    customerId: String(customer?.id || '').trim(),
    deviceId,
    deviceInfos: deviceId ? [[deviceId]] : []
  };
}
