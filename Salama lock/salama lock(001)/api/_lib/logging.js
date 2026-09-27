const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

const FULL_REDACT_KEY_PATTERNS = [
  /authorization/i,
  /\bauthori[sz]ation\b/i,
  /api[_-]?key/i,
  /app[_-]?key/i,
  /client[_-]?secret/i,
  /client[_-]?password/i,
  /\bpassword\b/i,
  /\bsecret\b/i,
  /\bbearer\b/i,
  /\btoken\b/i,
  /passkey/i
];

const PARTIAL_MASK_KEY_PATTERNS = [
  /imei/i,
  /device[_-]?uid/i,
  /registered[_-]?id/i,
  /locker[_-]?id/i,
  /request[_-]?id/i,
  /task[_-]?id/i,
  /payment[_-]?id/i,
  /customer[_-]?id/i,
  /\bphone\b/i,
  /national[_-]?id/i,
  /account[_-]?reference/i,
  /receipt/i
];

function shouldFullRedact(key = '') {
  return FULL_REDACT_KEY_PATTERNS.some((pattern) => pattern.test(String(key || '')));
}

function shouldPartialMask(key = '') {
  return PARTIAL_MASK_KEY_PATTERNS.some((pattern) => pattern.test(String(key || '')));
}

function maskSecret(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= 8) return '[redacted]';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function redactText(value) {
  const text = String(value ?? '');
  if (!text) return text;

  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(["']?(?:authorization|x-api-key|api-key|apikey|apiKey|appKey|clientSecret|client_secret|password|secret|token)["']?\s*[:=]\s*["'])([^"'\s,}]+)(["'])?/gi, '$1[redacted]$3')
    .replace(/(\b(?:authorization|x-api-key|api-key|apikey|apiKey|appKey|clientSecret|client_secret|password|secret|token)\b\s*[:=]\s*)([^\s,}]+)/gi, '$1[redacted]');
}

function sanitizeValue(value, key = '') {
  if (value instanceof Error) return serializeError(value);
  if (shouldFullRedact(key)) return '[redacted]';
  if (shouldPartialMask(key)) return maskSecret(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, item]) => [entryKey, sanitizeValue(item, entryKey)])
    );
  }
  if (typeof value === 'string') return redactText(value);
  return value;
}

function serializeError(error) {
  if (!error) return null;
  return {
    name: error.name || 'Error',
    message: redactText(error.message || String(error)),
    statusCode: error.statusCode || null,
    provider: error.provider || null,
    providerCode: error.providerCode || null,
    providerResponse: sanitizeValue(error.providerResponse || null)
  };
}

function sanitizeConsoleArg(value) {
  if (value instanceof Error) return serializeError(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return JSON.stringify(sanitizeValue(JSON.parse(trimmed)));
      } catch {
        return redactText(value);
      }
    }
    return redactText(value);
  }
  return sanitizeValue(value);
}

function installConsoleRedaction() {
  if (globalThis.__SALAMA_LOCKConsoleRedactionInstalled) return;
  globalThis.__SALAMA_LOCKConsoleRedactionInstalled = true;

  console.log = (...args) => originalConsole.log(...args.map(sanitizeConsoleArg));
  console.info = (...args) => originalConsole.info(...args.map(sanitizeConsoleArg));
  console.warn = (...args) => originalConsole.warn(...args.map(sanitizeConsoleArg));
  console.error = (...args) => originalConsole.error(...args.map(sanitizeConsoleArg));
}

function emit(level, event, details = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitizeValue(details)
  };
  const line = JSON.stringify(payload);

  if (level === 'error') {
    originalConsole.error(line);
    return;
  }

  if (level === 'warn') {
    originalConsole.warn(line);
    return;
  }

  originalConsole.log(line);
}

installConsoleRedaction();

export const logInfo = (event, details) => emit('info', event, details);
export const logWarn = (event, details) => emit('warn', event, details);
export const logError = (event, details) => emit('error', event, details);
