import { sendJson } from '../_lib/http.js';
import { isCallbackAuthorized } from '../_lib/callbackAuth.js';
import { logInfo, logWarn } from '../_lib/logging.js';
import { upsertSmsDeliveryReport } from '../_lib/sms-delivery-reports.js';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      const contentType = String(req.headers['content-type'] || '').toLowerCase();

      if (contentType.includes('application/json')) {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch (error) {
          reject(error);
        }
        return;
      }

      resolve(Object.fromEntries(new URLSearchParams(body)));
    });

    req.on('error', reject);
  });
}

function readQuery(req) {
  try {
    return Object.fromEntries(new URL(req.url, 'https://local.vercel.app').searchParams.entries());
  } catch {
    return {};
  }
}

function withoutSecrets(payload = {}) {
  const redacted = { ...(payload || {}) };
  for (const key of ['secret', 'token', 'apiKey', 'apikey', 'password']) {
    if (redacted[key] !== undefined) redacted[key] = '[redacted]';
  }
  return redacted;
}

function deliveryReportSecretMatches(req) {
  return isCallbackAuthorized(
    req,
    ['AFRICASTALKING_DELIVERY_REPORT_SECRET', 'AFRICAS_TALKING_DELIVERY_REPORT_SECRET']
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    const bodyParams = await readBody(req);
    const params = {
      ...readQuery(req),
      ...bodyParams
    };

    if (!deliveryReportSecretMatches(req)) {
      sendJson(res, 403, { message: 'Unauthorized.' });
      return;
    }

    const providerMessageId = params.messageId || params.id || params.message_id || params.smsMessageId;
    const recipientPhone = params.phoneNumber || params.number || params.msisdn || params.to || params.phone;
    const providerStatus = params.providerStatus || params.provider_status || params.status || params.deliveryStatus || params.delivery_status;
    const providerStatusCode = params.providerStatusCode || params.provider_status_code || params.statusCode || params.status_code;
    const deliveryStatus = params.deliveryStatus || params.delivery_status || params.finalStatus || providerStatus;
    const networkCode = params.networkCode || params.network_code || params.network || params.mccmnc || params.mccMnc || '';

    if (!providerMessageId) {
      sendJson(res, 400, { message: 'Missing messageId.' });
      return;
    }

    const report = await upsertSmsDeliveryReport({
      providerMessageId,
      recipientPhone,
      providerStatus,
      providerStatusCode,
      deliveryStatus,
      deliveryStatusCode: params.deliveryStatusCode || params.delivery_status_code || providerStatusCode,
      failureReason: params.failureReason || params.failure_reason || params.reason || '',
      networkCode,
      deliveredAt: params.deliveredAt || params.delivered_at || params.deliveryTime || params.delivery_time || null,
      rawPayload: withoutSecrets(params)
    });

    if (!report) {
      logWarn('sms.delivery.unknown_message_id', {
        providerMessageId,
        deliveryStatus: deliveryStatus || 'unknown',
        hasRecipientPhone: Boolean(recipientPhone)
      });
      sendJson(res, 200, {
        ok: true,
        stored: false,
        message: 'Delivery report received but no matching SMS log was found.'
      });
      return;
    }

    logInfo('sms_delivery_report_received', {
      providerMessageId: report.providerMessageId,
      recipientPhone: report.recipientPhone,
      deliveryStatus: report.deliveryStatus || 'unknown',
      failureReason: report.failureReason || '',
      networkCode: report.networkCode || networkCode || ''
    });

    logInfo('sms.delivery.report_received', {
      providerMessageId: report.providerMessageId,
      recipientPhone: report.recipientPhone,
      purpose: report.purpose || 'general',
      providerAckStatus: report.providerAckStatus || 'unknown',
      providerAckStatusCode: report.providerAckStatusCode ?? null,
      providerStatus: report.providerStatus || 'unknown',
      providerStatusCode: report.providerStatusCode ?? null,
      networkCode: report.networkCode || networkCode || '',
      deliveryStatus: report.deliveryStatus || 'unknown',
      deliveryStatusCode: report.deliveryStatusCode ?? null
    });

    if (['failed', 'rejected'].includes(String(report.deliveryStatus || '').toLowerCase())) {
      logWarn('sms.delivery.report_failed', {
        providerMessageId: report.providerMessageId,
        recipientPhone: report.recipientPhone,
        purpose: report.purpose || 'general',
        providerAckStatus: report.providerAckStatus || 'unknown',
        providerAckStatusCode: report.providerAckStatusCode ?? null,
        providerStatus: report.providerStatus || 'unknown',
        providerStatusCode: report.providerStatusCode ?? null,
        deliveryStatus: report.deliveryStatus || 'unknown',
        deliveryStatusCode: report.deliveryStatusCode ?? null,
        failureReason: report.failureReason || ''
      });
    }

    sendJson(res, 200, {
      ok: true,
      report
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      message: error.message || 'Could not save delivery report.'
    });
  }
}
