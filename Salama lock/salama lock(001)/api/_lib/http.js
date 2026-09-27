export function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.end(JSON.stringify(data));
}

export function sendOptions(res, methods = 'GET,POST,OPTIONS') {
  res.statusCode = 204;
  res.setHeader('Allow', methods);
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end();
}

export function readJson(req, { maxBytes = 32 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let settled = false;

    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        const error = new Error('Request body is too large.');
        error.statusCode = 413;
        done(reject, error);
        req.destroy(error);
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        done(resolve, {});
        return;
      }

      try {
        done(resolve, JSON.parse(body));
      } catch (parseError) {
        const error = new Error('Request body must be valid JSON.');
        error.statusCode = 400;
        error.cause = parseError;
        done(reject, error);
      }
    });
    req.on('error', (error) => {
      done(reject, error);
    });
  });
}
