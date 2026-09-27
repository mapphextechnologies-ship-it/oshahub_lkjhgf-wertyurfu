import { sendJson } from '../_lib/http.js';
import { assertRateLimit } from '../_lib/security.js';
import { getSupabase, requirePortalUser } from '../_lib/supabase.js';

const MAX_MEDIA_BYTES = 3 * 1024 * 1024;
const ALLOWED_FIELDS = new Set([
  'passportPhotoUrl',
  'idFrontUrl',
  'idBackUrl',
  'nextOfKinPassportPhotoUrl',
  'nextOfKinIdFrontUrl',
  'nextOfKinIdBackUrl'
]);
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function readLimitedJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = '';

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        const error = new Error('Media file is too large. Use a clear image under 3 MB.');
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        const error = new Error('Invalid media upload payload.');
        error.statusCode = 400;
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    const error = new Error('Capture a valid image before uploading.');
    error.statusCode = 400;
    throw error;
  }

  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    const error = new Error('Only JPEG, PNG, or WebP images are allowed.');
    error.statusCode = 400;
    throw error;
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_MEDIA_BYTES) {
    const error = new Error('Media file is too large. Use a clear image under 3 MB.');
    error.statusCode = 413;
    throw error;
  }

  return { buffer, mimeType };
}

function extensionFor(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    await assertRateLimit(req, { scope: 'agent-customer-media', limit: 30, windowMs: 60_000 });
    const user = await requirePortalUser(req, ['agent']);
    const body = await readLimitedJson(req, MAX_MEDIA_BYTES + 64 * 1024);
    const field = String(body.field || '').trim();

    if (!ALLOWED_FIELDS.has(field)) {
      sendJson(res, 400, { message: 'Choose a valid customer media field.' });
      return;
    }

    const { buffer, mimeType } = parseDataUrl(body.dataUrl);
    const bucket = process.env.SUPABASE_CUSTOMER_MEDIA_BUCKET || 'customer-kyc';
    const now = new Date();
    const folder = now.toISOString().slice(0, 10);
    const safeField = field.replace(/[^a-zA-Z0-9_-]/g, '');
    const path = `${user.id}/${folder}/${safeField}-${Date.now()}.${extensionFor(mimeType)}`;

    const upload = await getSupabase().storage.from(bucket).upload(path, buffer, {
      contentType: mimeType,
      upsert: false
    });

    if (upload.error) throw upload.error;

    sendJson(res, 201, {
      bucket,
      path,
      reference: `storage://${bucket}/${path}`
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
