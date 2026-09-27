function normalizeText(value) {
  return String(value || '').trim();
}

function responseStatusFrom(result = {}) {
  return result?.status ?? result?.httpStatus ?? result?.body?.status ?? result?.response?.status ?? null;
}

function requestIdFrom(result = {}) {
  return result?.requestId ?? result?.taskId ?? result?.body?.requestId ?? result?.body?.taskId ?? result?.response?.requestId ?? null;
}

function responseStatusFromError(error = {}) {
  return error?.statusCode ?? error?.response?.status ?? error?.response?.code ?? null;
}

export async function traceProviderCall({
  provider,
  imei = '',
  endpoint = '',
  operation = '',
  run
} = {}) {
  const startedAt = Date.now();
  let resolvedRequestId = null;

  try {
    const result = await run();
    resolvedRequestId = requestIdFrom(result);
    console.info('[locker-provider-call]', JSON.stringify({
      provider,
      imei: normalizeText(imei),
      endpoint,
      requestId: resolvedRequestId,
      responseStatus: responseStatusFrom(result),
      durationMs: Date.now() - startedAt,
      success: true,
      operation
    }));
    return result;
  } catch (error) {
    console.error('[locker-provider-call]', JSON.stringify({
      provider,
      imei: normalizeText(imei),
      endpoint,
      requestId: error?.requestId || resolvedRequestId || null,
      responseStatus: responseStatusFromError(error),
      durationMs: Date.now() - startedAt,
      success: false,
      operation,
      error: error?.message || String(error)
    }));
    throw error;
  }
}
