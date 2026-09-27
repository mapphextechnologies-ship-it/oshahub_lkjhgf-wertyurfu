import { publicAppBaseUrl } from './africastalking.js';

const DARAJA_LIVE_URL = 'https://api.safaricom.co.ke';
const DARAJA_SANDBOX_URL = 'https://sandbox.safaricom.co.ke';
function envValue(name) {
  return String(process.env[name] || '').trim();
}

function useSandbox() {
  return ['1', 'true', 'yes', 'sandbox'].includes(String(envValue('DARAJA_ENV') || envValue('MPESA_ENV')).toLowerCase());
}

function baseUrl() {
  return useSandbox() ? DARAJA_SANDBOX_URL : DARAJA_LIVE_URL;
}

function consumerKey() {
  return envValue('DARAJA_CONSUMER_KEY') || envValue('MPESA_CONSUMER_KEY');
}

function consumerSecret() {
  return envValue('DARAJA_CONSUMER_SECRET') || envValue('MPESA_CONSUMER_SECRET');
}

function businessShortCode() {
  return envValue('DARAJA_BUSINESS_SHORT_CODE') || envValue('MPESA_SHORTCODE') || envValue('MPESA_BUSINESS_SHORT_CODE');
}

function c2bShortCode() {
  return envValue('DARAJA_C2B_SHORT_CODE') || envValue('MPESA_C2B_SHORT_CODE') || businessShortCode();
}

function passkey() {
  return envValue('DARAJA_PASSKEY') || envValue('MPESA_PASSKEY');
}

function tillOrPaybillType() {
  return envValue('DARAJA_TRANSACTION_TYPE') || envValue('MPESA_TRANSACTION_TYPE') || 'CustomerPayBillOnline';
}

function callbackUrl(path = '/api/mpesa/callback') {
  const direct = envValue('DARAJA_CALLBACK_URL') || envValue('MPESA_CALLBACK_URL');
  if (direct) return direct;

  const origin = publicAppBaseUrl();
  const secret = envValue('PAYMENT_CALLBACK_SECRET') || envValue('WEBHOOK_SECRET');
  const url = new URL(path, origin);
  if (secret) url.searchParams.set('secret', secret);
  return url.toString();
}

function normalizeC2BCallbackUrl(direct, fallbackPath) {
  if (!direct) return '';

  try {
    const url = new URL(direct);
    if (url.pathname.includes('/api/mpesa/')) {
      url.pathname = url.pathname.replace('/api/mpesa/', '/api/paybill/');
    }
    return url.toString();
  } catch {
    return direct.includes('/api/mpesa/')
      ? direct.replace('/api/mpesa/', '/api/paybill/')
      : direct;
  }
}

function payoutResultUrl() {
  return envValue('DARAJA_B2C_RESULT_URL') || envValue('MPESA_B2C_RESULT_URL') || callbackUrl('/api/commissions/payout-callback');
}

function payoutTimeoutUrl() {
  return envValue('DARAJA_B2C_TIMEOUT_URL') || envValue('MPESA_B2C_TIMEOUT_URL') || payoutResultUrl();
}

function c2bValidationUrl() {
  const direct = envValue('DARAJA_C2B_VALIDATION_URL') || envValue('MPESA_C2B_VALIDATION_URL');
  const safeDirect = normalizeC2BCallbackUrl(direct, '/api/paybill/validation');
  if (safeDirect) return safeDirect;
  return callbackUrl('/api/paybill/validation');
}

function c2bConfirmationUrl() {
  const direct = envValue('DARAJA_C2B_CONFIRMATION_URL') || envValue('MPESA_C2B_CONFIRMATION_URL');
  const safeDirect = normalizeC2BCallbackUrl(direct, '/api/paybill/confirmation');
  if (safeDirect) return safeDirect;
  return callbackUrl('/api/paybill/confirmation');
}

function timestamp() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0')
  ];
  return parts.join('');
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}

function normalizeReference(value) {
  return String(value || '')
    .trim()
    .replace(/[\s-]+/g, '');
}

function requireConfig(fields) {
  const missing = fields.filter(([name, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    const error = new Error(`Daraja is not configured. Missing ${missing.join(', ')}.`);
    error.statusCode = 500;
    throw error;
  }
}

function hasDarajaPaymentConfig() {
  return Boolean(consumerKey() && consumerSecret() && businessShortCode() && passkey() && callbackUrl());
}

export function darajaPaymentDiagnostics() {
  return {
    configured: hasDarajaPaymentConfig(),
    consumerKeyConfigured: Boolean(consumerKey()),
    consumerSecretConfigured: Boolean(consumerSecret()),
    businessShortCodeConfigured: Boolean(businessShortCode()),
    passkeyConfigured: Boolean(passkey()),
    callbackUrlConfigured: Boolean(callbackUrl()),
    b2cConfigured: Boolean(
      consumerKey() &&
      consumerSecret() &&
      envValue('DARAJA_B2C_INITIATOR_NAME') &&
      envValue('DARAJA_B2C_SECURITY_CREDENTIAL') &&
      (envValue('DARAJA_B2C_SHORT_CODE') || businessShortCode()) &&
      payoutResultUrl()
    ),
    c2bConfigured: Boolean(consumerKey() && consumerSecret() && c2bShortCode() && c2bValidationUrl() && c2bConfirmationUrl()),
    c2bValidationUrlConfigured: Boolean(c2bValidationUrl()),
    c2bConfirmationUrlConfigured: Boolean(c2bConfirmationUrl()),
    sandbox: useSandbox(),
    baseUrl: baseUrl()
  };
}

async function accessToken() {
  requireConfig([
    ['DARAJA_CONSUMER_KEY', consumerKey()],
    ['DARAJA_CONSUMER_SECRET', consumerSecret()]
  ]);

  const credentials = Buffer.from(`${consumerKey()}:${consumerSecret()}`).toString('base64');
  const response = await fetch(`${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.access_token) {
    const error = new Error(data.errorMessage || data.error || 'Daraja OAuth token request failed.');
    error.statusCode = 502;
    error.providerResponse = data;
    throw error;
  }

  return data.access_token;
}

async function darajaPost(path, payload) {
  const token = await accessToken();
  const response = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.errorCode) {
    const error = new Error(data.errorMessage || data.ResponseDescription || data.ResultDesc || 'Daraja request failed.');
    error.statusCode = 502;
    error.providerResponse = data;
    throw error;
  }

  return data;
}

export async function initiateStkPush({ amount, phone, accountReference, transactionDescription }) {
  if (!hasDarajaPaymentConfig()) {
    return { configured: false, status: 'queued', providerResponse: null };
  }

  const normalizedAccountReference = String(accountReference || '').trim();

  const requestTimestamp = timestamp();
  const shortcode = businessShortCode();
  const payload = {
    BusinessShortCode: shortcode,
    Password: Buffer.from(`${shortcode}${passkey()}${requestTimestamp}`).toString('base64'),
    Timestamp: requestTimestamp,
    TransactionType: tillOrPaybillType(),
    Amount: Math.trunc(Number(amount)),
    PartyA: normalizePhone(phone),
    PartyB: shortcode,
    PhoneNumber: normalizePhone(phone),
    CallBackURL: callbackUrl(),
    AccountReference: normalizedAccountReference.slice(0, 12),
    TransactionDesc: String(transactionDescription || 'SALAMA LOCK Paygo payment').slice(0, 100)
  };

  requireConfig([
    ['DARAJA_BUSINESS_SHORT_CODE', payload.BusinessShortCode],
    ['DARAJA_PASSKEY', passkey()],
    ['DARAJA_CALLBACK_URL or PUBLIC_APP_URL', payload.CallBackURL],
    ['payment phone', payload.PhoneNumber],
    ['account reference', payload.AccountReference]
  ]);

  const data = await darajaPost('/mpesa/stkpush/v1/processrequest', payload);
  const accepted = String(data.ResponseCode || '') === '0' || Boolean(data.CheckoutRequestID);

  if (!accepted) {
    const error = new Error(data.ResponseDescription || data.errorMessage || 'Daraja STK push request was not accepted.');
    error.statusCode = 502;
    error.providerResponse = data;
    throw error;
  }

  return {
    configured: true,
    status: 'processing',
    checkoutRequestId: data.CheckoutRequestID || null,
    merchantRequestId: data.MerchantRequestID || null,
    transactionId: data.CheckoutRequestID || null,
    providerResponse: data
  };
}

export async function initiateB2CPayout({ amount, phone, remarks, occasion }) {
  const initiatorName = envValue('DARAJA_B2C_INITIATOR_NAME') || envValue('MPESA_B2C_INITIATOR_NAME');
  const securityCredential = envValue('DARAJA_B2C_SECURITY_CREDENTIAL') || envValue('MPESA_B2C_SECURITY_CREDENTIAL');
  const shortcode = envValue('DARAJA_B2C_SHORT_CODE') || envValue('MPESA_B2C_SHORT_CODE') || businessShortCode();

  if (!consumerKey() || !consumerSecret() || !initiatorName || !securityCredential || !shortcode || !payoutResultUrl()) {
    return { configured: false, status: 'queued', providerResponse: null };
  }

  const data = await darajaPost('/mpesa/b2c/v1/paymentrequest', {
    InitiatorName: initiatorName,
    SecurityCredential: securityCredential,
    CommandID: envValue('DARAJA_B2C_COMMAND_ID') || 'BusinessPayment',
    Amount: Math.trunc(Number(amount)),
    PartyA: shortcode,
    PartyB: normalizePhone(phone),
    Remarks: String(remarks || 'SALAMA LOCK Paygo payout').slice(0, 100),
    QueueTimeOutURL: payoutTimeoutUrl(),
    ResultURL: payoutResultUrl(),
    Occasion: String(occasion || 'Commission payout').slice(0, 100)
  });

  return {
    configured: true,
    status: 'processing',
    conversationId: data.ConversationID || null,
    originatorConversationId: data.OriginatorConversationID || null,
    providerResponse: data
  };
}

export async function registerC2BUrls() {
  const shortcode = c2bShortCode();
  const validationUrl = c2bValidationUrl();
  const confirmationUrl = c2bConfirmationUrl();

  requireConfig([
    ['DARAJA_C2B_SHORT_CODE or MPESA_SHORTCODE or DARAJA_BUSINESS_SHORT_CODE', shortcode],
    ['DARAJA_C2B_VALIDATION_URL or PUBLIC_APP_URL', validationUrl],
    ['DARAJA_C2B_CONFIRMATION_URL or PUBLIC_APP_URL', confirmationUrl]
  ]);

  const data = await darajaPost('/mpesa/c2b/v2/registerurl', {
    ShortCode: shortcode,
    ResponseType: envValue('DARAJA_C2B_RESPONSE_TYPE') || envValue('MPESA_C2B_RESPONSE_TYPE') || 'Completed',
    ConfirmationURL: confirmationUrl,
    ValidationURL: validationUrl
  });

  return {
    status: String(data.ResponseCode || '') === '0' ? 'registered' : 'submitted',
    providerResponse: data,
    validationUrl,
    confirmationUrl
  };
}

export async function simulateC2BPayment({ amount, phone, accountReference, commandId } = {}) {
  const shortcode = c2bShortCode();
  const normalizedAccountReference = String(accountReference || '').trim();

  requireConfig([
    ['DARAJA_C2B_SHORT_CODE or MPESA_SHORTCODE or DARAJA_BUSINESS_SHORT_CODE', shortcode],
    ['payment phone', normalizePhone(phone)],
    ['amount', Number(amount) > 0 ? amount : ''],
    ['account reference', normalizedAccountReference]
  ]);

  const data = await darajaPost('/mpesa/c2b/v1/simulate', {
    ShortCode: shortcode,
    CommandID: commandId || envValue('DARAJA_C2B_COMMAND_ID') || envValue('MPESA_C2B_COMMAND_ID') || 'CustomerPayBillOnline',
    Amount: Math.trunc(Number(amount)),
    Msisdn: normalizePhone(phone),
    BillRefNumber: normalizedAccountReference.slice(0, 20)
  });

  return {
    status: String(data.ResponseCode || '') === '0' ? 'submitted' : 'processing',
    providerResponse: data
  };
}

function metadataValue(items, name) {
  const item = (items || []).find((entry) => entry?.Name === name);
  return item?.Value;
}

export function parseDarajaStkCallback(body) {
  const callback = body?.Body?.stkCallback || body?.stkCallback;
  if (!callback) return null;

  const items = callback.CallbackMetadata?.Item || [];
  const receipt = metadataValue(items, 'MpesaReceiptNumber');
  const amount = metadataValue(items, 'Amount');
  const phone = metadataValue(items, 'PhoneNumber');

  return {
    merchantRequestId: callback.MerchantRequestID || '',
    checkoutRequestId: callback.CheckoutRequestID || '',
    transactionId: receipt || callback.CheckoutRequestID || callback.MerchantRequestID || '',
    receipt,
    amount,
    phone,
    success: Number(callback.ResultCode) === 0,
    resultCode: callback.ResultCode,
    resultDescription: callback.ResultDesc,
    raw: body
  };
}

export function parseDarajaC2BConfirmation(body) {
  const transactionId = body.TransID || body.TransId || body.transactionId || '';
  if (!transactionId) return null;

  return {
    transactionId,
    amount: body.TransAmount || body.amount,
    phone: body.MSISDN || body.phone,
    accountReference: normalizeReference(body.BillRefNumber || body.AccountReference || body.accountReference),
    paidAt: body.TransTime || null,
    raw: body
  };
}
