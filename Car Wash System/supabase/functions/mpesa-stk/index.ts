import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const projectUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

let accessToken = '';
let tokenExpiresAt = 0;

function mpesaConfig() {
  const environment = (Deno.env.get('MPESA_ENV') || 'sandbox').toLowerCase();
  const baseUrl = environment === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  const consumerKey = Deno.env.get('MPESA_CONSUMER_KEY');
  const consumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET');
  const shortcode = Deno.env.get('MPESA_SHORTCODE');
  const passkey = Deno.env.get('MPESA_PASSKEY');
  const transactionType = Deno.env.get('MPESA_TRANSACTION_TYPE') || 'CustomerPayBillOnline';
  const callbackUrl = Deno.env.get('MPESA_CALLBACK_URL') || `${projectUrl}/functions/v1/mpesa-stk?callback=1`;
  if (!consumerKey || !consumerSecret || !shortcode || !passkey) throw new Error('Daraja STK Push is not configured. Add the M-Pesa secrets to Supabase Functions.');
  if (!callbackUrl.startsWith('https://')) throw new Error('MPESA_CALLBACK_URL must use HTTPS.');
  if (!['CustomerPayBillOnline', 'CustomerBuyGoodsOnline'].includes(transactionType)) throw new Error('MPESA_TRANSACTION_TYPE must be CustomerPayBillOnline or CustomerBuyGoodsOnline.');
  return { baseUrl, consumerKey, consumerSecret, shortcode, passkey, transactionType, callbackUrl };
}

function nairobiTimestamp() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}${value.hour}${value.minute}${value.second}`;
}

function normalizePhone(input: unknown) {
  const raw = String(input ?? '').trim().replace(/[\s()+-]/g, '');
  const normalized = raw.startsWith('0') ? `254${raw.slice(1)}` : raw.startsWith('7') || raw.startsWith('1') ? `254${raw}` : raw;
  if (!/^254(?:7|1)\d{8}$/.test(normalized)) throw new Error('Enter a valid Kenyan M-Pesa number, such as 0712 345 678.');
  return normalized;
}

async function getAccessToken(config: ReturnType<typeof mpesaConfig>) {
  if (accessToken && tokenExpiresAt > Date.now() + 60_000) return accessToken;
  const credentials = btoa(`${config.consumerKey}:${config.consumerSecret}`);
  const response = await fetch(`${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` }, signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.errorMessage || 'Safaricom could not authorize the STK Push request.');
  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + Math.max(60, Number(data.expires_in || 3599) - 60) * 1000;
  return accessToken;
}

async function darajaPost(path: string, body: Record<string, unknown>) {
  const config = mpesaConfig();
  const token = await getAccessToken(config);
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.errorMessage || data.ResponseDescription || data.ResponseDesc || 'Safaricom could not process the STK Push request.');
  return data;
}

function stkPassword(shortcode: string, passkey: string, timestamp: string) {
  return btoa(`${shortcode}${passkey}${timestamp}`);
}

async function queryDaraja(checkoutRequestId: string) {
  const config = mpesaConfig();
  const timestamp = nairobiTimestamp();
  return await darajaPost('/mpesa/stkpushquery/v1/query', {
    BusinessShortCode: config.shortcode,
    Password: stkPassword(config.shortcode, config.passkey, timestamp),
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  });
}

function callbackItems(callback: any) {
  const items = callback?.Body?.stkCallback?.CallbackMetadata?.Item || [];
  return Object.fromEntries(items.map((item: any) => [item.Name, item.Value]));
}

function callbackPhone(value: unknown) {
  return value == null ? null : String(value).replace(/\D/g, '');
}

async function completeIfSafaricomConfirms(checkoutRequestId: string, saved: Record<string, any>) {
  const query = await queryDaraja(checkoutRequestId);
  if (String(query.ResultCode) !== '0' || !saved.MpesaReceiptNumber || !saved.Amount || !saved.PhoneNumber) {
    return { paid: false, query };
  }
  const { data, error } = await admin.rpc('carwash_complete_mpesa_billing', {
    p_checkout_request_id: checkoutRequestId,
    p_amount_kes: Number(saved.Amount),
    p_receipt: String(saved.MpesaReceiptNumber),
    p_phone: callbackPhone(saved.PhoneNumber),
  });
  if (error) throw error;
  return { paid: true, request: data, query };
}

async function handleCallback(request: Request) {
  const body = await request.json();
  const callback = body?.Body?.stkCallback;
  const checkoutRequestId = String(callback?.CheckoutRequestID || '');
  if (!checkoutRequestId) return json({ ResultCode: 0, ResultDesc: 'Callback received.' });

  const { data: billing, error } = await admin.from('carwash_billing_requests')
    .select('id,status,mpesa_payment_status,mpesa_expected_amount_kes,mpesa_phone')
    .eq('mpesa_checkout_request_id', checkoutRequestId).maybeSingle();
  if (error || !billing) return json({ ResultCode: 0, ResultDesc: 'Callback received for an unrecognized checkout.' });
  if (billing.mpesa_payment_status === 'PAID' || billing.status === 'APPROVED') return json({ ResultCode: 0, ResultDesc: 'Payment already recorded.' });

  const resultCode = Number(callback.ResultCode);
  if (resultCode !== 0) {
    await admin.from('carwash_billing_requests').update({ mpesa_payment_status: 'FAILED', mpesa_result_code: String(resultCode) }).eq('id', billing.id);
    return json({ ResultCode: 0, ResultDesc: 'Payment result recorded.' });
  }

  const metadata = callbackItems(body);
  const phone = callbackPhone(metadata.PhoneNumber);
  const amount = Number(metadata.Amount);
  if (!metadata.MpesaReceiptNumber || !Number.isFinite(amount) || amount !== Number(billing.mpesa_expected_amount_kes) || phone !== billing.mpesa_phone) {
    await admin.from('carwash_billing_requests').update({ mpesa_result_code: 'CALLBACK_MISMATCH' }).eq('id', billing.id);
    return json({ ResultCode: 0, ResultDesc: 'Payment is being checked.' });
  }

  await admin.from('carwash_billing_requests').update({
    mpesa_receipt: String(metadata.MpesaReceiptNumber),
    mpesa_paid_amount_kes: amount,
    mpesa_paid_phone: phone,
    mpesa_result_code: '0',
  }).eq('id', billing.id);
  try {
    const result = await completeIfSafaricomConfirms(checkoutRequestId, metadata);
    if (!result.paid) return json({ ResultCode: 0, ResultDesc: 'Payment confirmation is pending.' });
  } catch (error) {
    console.error('M-Pesa callback verification failed:', error instanceof Error ? error.message : error);
  }
  return json({ ResultCode: 0, ResultDesc: 'Payment callback processed.' });
}

async function authenticatedRequest(request: Request) {
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token) throw new Response(JSON.stringify({ error: 'Sign in to request an M-Pesa payment.' }), { status: 401 });
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!anonKey) throw new Error('Supabase anonymous key is missing from the Edge Function environment.');
  const userClient = createClient(projectUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) throw new Response(JSON.stringify({ error: 'Your sign-in has expired. Sign in again and retry.' }), { status: 401 });
  return { user: data.user, userId: data.user.id };
}

async function getOwnedRequest(requestId: string, userId: string) {
  const { data: row, error } = await admin.from('carwash_billing_requests').select('*').eq('id', requestId).maybeSingle();
  if (error) throw error;
  if (!row || row.user_id !== userId || row.request_type !== 'PLAN_PURCHASE') throw new Response(JSON.stringify({ error: 'Plan payment request not found.' }), { status: 404 });
  const { data: membership, error: membershipError } = await admin.from('carwash_memberships').select('id')
    .eq('user_id', userId).eq('tenant_id', row.tenant_id).eq('role', 'BUSINESS_ADMIN').eq('status', 'ACTIVE').maybeSingle();
  if (membershipError || !membership) throw new Response(JSON.stringify({ error: 'An active business administrator is required.' }), { status: 403 });
  return row;
}

async function startPush(body: any, request: Request) {
  const { userId } = await authenticatedRequest(request);
  const row = await getOwnedRequest(String(body.billingRequestId || ''), userId);
  if (row.status !== 'PENDING') throw new Response(JSON.stringify({ error: 'This plan payment request is no longer pending.' }), { status: 409 });
  if (row.mpesa_payment_status === 'PAID') return json({ status: 'PAID', requestId: row.id });
  if (row.mpesa_payment_status === 'INITIATED') throw new Response(JSON.stringify({ error: 'An STK prompt is already waiting. Check your phone or use Check payment status.' }), { status: 409 });

  const phone = normalizePhone(body.phone || row.mpesa_phone);
  const config = mpesaConfig();
  const { data: existingPayments, error: paymentsError } = await admin.from('carwash_subscription_payments').select('id').eq('tenant_id', row.tenant_id).limit(1);
  if (paymentsError) throw paymentsError;
  const paymentStage = existingPayments.length === 0 ? 'ONBOARDING' : 'SUBSCRIPTION';
  const amount = Math.round(Number(paymentStage === 'ONBOARDING' ? row.onboarding_fee_kes : row.plan_amount_kes));
  if (!Number.isFinite(amount) || amount < 1) throw new Error('The payment amount is invalid. Refresh the plan and try again.');
  const { data: plan, error: planError } = await admin.from('carwash_plans').select('name').eq('id', row.plan_id).single();
  if (planError) throw planError;

  const { data: prepared, error: prepareError } = await admin.from('carwash_billing_requests').update({
    mpesa_phone: phone, mpesa_expected_amount_kes: amount,
    payment_stage: paymentStage, payment_method: 'M-PESA', mpesa_payment_status: 'INITIATED', mpesa_result_code: null,
    mpesa_receipt: null, mpesa_paid_amount_kes: null, mpesa_paid_phone: null,
    mpesa_checkout_request_id: null, mpesa_merchant_request_id: null,
  }).eq('id', row.id).eq('status', 'PENDING').in('mpesa_payment_status', ['NOT_STARTED', 'FAILED']).select('id').maybeSingle();
  if (prepareError) throw prepareError;
  if (!prepared) throw new Response(JSON.stringify({ error: 'An M-Pesa prompt is already being prepared for this request.' }), { status: 409 });

  const timestamp = nairobiTimestamp();
  let response;
  try {
    response = await darajaPost('/mpesa/stkpush/v1/processrequest', {
      BusinessShortCode: config.shortcode,
      Password: stkPassword(config.shortcode, config.passkey, timestamp),
      Timestamp: timestamp,
      TransactionType: config.transactionType,
      Amount: amount,
      PartyA: phone,
      PartyB: config.shortcode,
      PhoneNumber: phone,
      CallBackURL: config.callbackUrl,
      AccountReference: `OSHA${row.id.replaceAll('-', '').slice(0, 8).toUpperCase()}`,
      TransactionDesc: paymentStage === 'ONBOARDING' ? 'OSHA SETUP' : 'OSHA PLAN',
    });
  } catch (error) {
    await admin.from('carwash_billing_requests').update({ mpesa_payment_status: 'FAILED', mpesa_result_code: 'REQUEST_FAILED' }).eq('id', row.id);
    throw error;
  }
  if (!response.CheckoutRequestID || !response.MerchantRequestID) {
    await admin.from('carwash_billing_requests').update({ mpesa_payment_status: 'FAILED', mpesa_result_code: 'NO_CHECKOUT_ID' }).eq('id', row.id);
    throw new Error(response.ResponseDescription || 'Safaricom did not create a payment prompt. Check the phone number and try again.');
  }
  const { error: saveError } = await admin.from('carwash_billing_requests').update({
    mpesa_checkout_request_id: response.CheckoutRequestID,
    mpesa_merchant_request_id: response.MerchantRequestID,
  }).eq('id', row.id);
  if (saveError) throw saveError;
  return json({ status: 'INITIATED', requestId: row.id, checkoutRequestId: response.CheckoutRequestID, amountKes: amount, paymentStage, planName: plan.name });
}

async function checkPayment(body: any, request: Request) {
  const { userId } = await authenticatedRequest(request);
  const row = await getOwnedRequest(String(body.billingRequestId || ''), userId);
  if (row.mpesa_payment_status === 'PAID' || row.status === 'APPROVED') return json({ status: 'PAID', requestId: row.id });
  if (!row.mpesa_checkout_request_id) return json({ status: row.mpesa_payment_status || 'NOT_STARTED', requestId: row.id });
  const saved = {
    MpesaReceiptNumber: row.mpesa_receipt,
    Amount: row.mpesa_paid_amount_kes,
    PhoneNumber: row.mpesa_paid_phone,
  };
  try {
    const result = await completeIfSafaricomConfirms(row.mpesa_checkout_request_id, saved);
    if (result.paid) return json({ status: 'PAID', requestId: row.id });
  } catch (error) {
    console.error('M-Pesa status check failed:', error instanceof Error ? error.message : error);
  }
  return json({ status: row.mpesa_payment_status || 'INITIATED', requestId: row.id, message: 'Waiting for M-Pesa confirmation.' });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Use POST for this endpoint.' }, 405);
  const url = new URL(request.url);
  if (url.searchParams.get('callback') === '1') return await handleCallback(request);
  try {
    const body = await request.json();
    if (body.action === 'check') return await checkPayment(body, request);
    return await startPush(body, request);
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    console.error('M-Pesa STK request failed:', error instanceof Error ? error.message : error);
    return json({ error: error instanceof Error ? error.message : 'Unable to start the M-Pesa payment.' }, 400);
  }
});
