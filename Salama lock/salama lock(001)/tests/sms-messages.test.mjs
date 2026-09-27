import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildSmsDedupeKey,
  normalizeKenyanPhone,
  resetSmsIdempotencyMemoryForTests,
  sendAgentFollowUpSms,
  sendNextOfKinAcceptanceSms,
  sendPaymentConfirmedSms,
  sendPaymentReminderSms,
  sendPhoneLockedSms,
  sendOtpSms,
  sendSms
} from '../api/_lib/africastalking.js';

test('Kenyan SMS phone numbers allow common display separators', () => {
  assert.equal(normalizeKenyanPhone('0713 313612'), '+254713313612');
  assert.equal(normalizeKenyanPhone('+254 (713) 313-612'), '+254713313612');
  assert.equal(normalizeKenyanPhone('0713 ABC 612'), '');
});

test('next-of-kin acceptance SMS reaches the provider with a working acceptance link', async (t) => {
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    AFRICASTALKING_USERNAME: process.env.AFRICASTALKING_USERNAME,
    AFRICASTALKING_API_KEY: process.env.AFRICASTALKING_API_KEY,
    AFRICASTALKING_SANDBOX: process.env.AFRICASTALKING_SANDBOX,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  const previousFetch = globalThis.fetch;
  let requestBody = null;

  process.env.NODE_ENV = 'test';
  process.env.AFRICASTALKING_USERNAME = 'sandbox';
  process.env.AFRICASTALKING_API_KEY = 'test-api-key';
  process.env.AFRICASTALKING_SANDBOX = 'true';
  process.env.PUBLIC_APP_URL = 'https://www.SALAMA LOCKpay.com';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  resetSmsIdempotencyMemoryForTests();
  globalThis.fetch = async (_url, options = {}) => {
    requestBody = new URLSearchParams(String(options.body || ''));
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        SMSMessageData: {
          Recipients: [{ status: 'Success', statusCode: 101, messageId: 'nok-provider-1' }]
        }
      })
    };
  };

  t.after(() => {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetSmsIdempotencyMemoryForTests();
  });

  const result = await sendNextOfKinAcceptanceSms({
    phone: '+254700000003',
    customerName: 'Test Customer',
    customerId: 'customer-123',
    otp: '123456'
  });

  assert.equal(result.providerAccepted, true);
  assert.equal(result.delivered, false);
  assert.equal(result.providerMessageId, 'nok-provider-1');
  assert.match(requestBody.get('message'), /Test Customer named you next-of-kin/);
  assert.match(requestBody.get('message'), /https:\/\/www\.SALAMA LOCKpay\.com\/api\/k\?c=customer-123&o=123456/);
  assert.ok(requestBody.get('message').length <= 160);
});

test('two-day overdue customer receives a PAYGO payment reminder', async (t) => {
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    AFRICASTALKING_USERNAME: process.env.AFRICASTALKING_USERNAME,
    AFRICASTALKING_API_KEY: process.env.AFRICASTALKING_API_KEY,
    AFRICASTALKING_SANDBOX: process.env.AFRICASTALKING_SANDBOX,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  const previousFetch = globalThis.fetch;
  let requestBody = null;

  process.env.NODE_ENV = 'test';
  process.env.AFRICASTALKING_USERNAME = 'sandbox';
  process.env.AFRICASTALKING_API_KEY = 'test-api-key';
  process.env.AFRICASTALKING_SANDBOX = 'true';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  resetSmsIdempotencyMemoryForTests();
  globalThis.fetch = async (_url, options = {}) => {
    requestBody = new URLSearchParams(String(options.body || ''));
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        SMSMessageData: {
          Recipients: [{ status: 'Success', statusCode: 101, messageId: 'overdue-provider-1' }]
        }
      })
    };
  };

  t.after(() => {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetSmsIdempotencyMemoryForTests();
  });

  const result = await sendPaymentReminderSms({
    customer: { id: 'customer-123', customer_phone: '+254700000000', balance: 600 },
    amount: 300,
    overdueDays: 2
  });

  assert.equal(result.providerAccepted, true);
  assert.equal(result.delivered, false);
  assert.equal(result.providerMessageId, 'overdue-provider-1');
  assert.equal(result.purpose, 'payment_reminder');
  assert.match(requestBody.get('message'), /2 days overdue/);
  assert.match(requestBody.get('message'), /Overdue amount: KES 300/);
  assert.match(requestBody.get('message'), /Current balance: KES 600/);
});

test('assigned agent receives the automatic overdue follow-up SMS', async (t) => {
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    AFRICASTALKING_USERNAME: process.env.AFRICASTALKING_USERNAME,
    AFRICASTALKING_API_KEY: process.env.AFRICASTALKING_API_KEY,
    AFRICASTALKING_SANDBOX: process.env.AFRICASTALKING_SANDBOX,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  const previousFetch = globalThis.fetch;
  let requestBody = null;

  process.env.NODE_ENV = 'test';
  process.env.AFRICASTALKING_USERNAME = 'sandbox';
  process.env.AFRICASTALKING_API_KEY = 'test-api-key';
  process.env.AFRICASTALKING_SANDBOX = 'true';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  resetSmsIdempotencyMemoryForTests();
  globalThis.fetch = async (_url, options = {}) => {
    requestBody = new URLSearchParams(String(options.body || ''));
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        SMSMessageData: {
          Recipients: [{ status: 'Success', statusCode: 101, messageId: 'agent-provider-1' }]
        }
      })
    };
  };

  t.after(() => {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetSmsIdempotencyMemoryForTests();
  });

  const result = await sendAgentFollowUpSms({
    agentPhone: '+254700000004',
    customerId: 'customer-123',
    customerName: 'Test Customer',
    customerPhone: '+254700000000',
    overdueDays: 2,
    amount: 800,
    balance: 249200,
    reminderDate: '2026-07-15'
  });

  assert.equal(result.providerAccepted, true);
  assert.equal(result.providerMessageId, 'agent-provider-1');
  assert.equal(result.purpose, 'agent_follow_up');
  assert.match(requestBody.get('message'), /Test Customer/);
  assert.match(requestBody.get('message'), /2 days overdue/);
  assert.match(requestBody.get('message'), /Overdue amount: KES 800/);
});

test('phone lock SMS notifications stay disabled', async () => {
  const result = await sendPhoneLockedSms({
    customer: { id: 'customer-123', customer_phone: '+254700000000' },
    product: { id: 'phone-123', locker_id: 'locker-123' },
    balance: 600,
    overdueDays: 2
  });

  assert.equal(result.sent, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'lock_sms_disabled');
  assert.equal(result.purpose, 'phone_locked');
});

test('payment callbacks and phone monitor do not trigger SMS directly', async () => {
  const callbackPaths = [
    '../api/mpesa/callback.js',
    '../api/mpesa/confirmation.js',
    '../api/paybill/confirmation.js',
    '../api/payments/callback.js',
    '../api/africastalking/payments-callback.js'
  ];

  for (const callbackPath of callbackPaths) {
    const source = await readFile(new URL(callbackPath, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /sendPaymentConfirmedSms\s*\(/);
  }

  const databaseSource = await readFile(new URL('../api/_lib/database.js', import.meta.url), 'utf8');
  assert.doesNotMatch(databaseSource, /sendPhoneLockedSms\s*\(/);
  assert.match(databaseSource, /async function queuePaymentNotifications[\s\S]*sendPaymentConfirmedSms\s*\(/);
});

test('one SMS event is sent at most once and identical content has a 24-hour cooldown', async (t) => {
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    AFRICASTALKING_USERNAME: process.env.AFRICASTALKING_USERNAME,
    AFRICASTALKING_API_KEY: process.env.AFRICASTALKING_API_KEY,
    AFRICASTALKING_SANDBOX: process.env.AFRICASTALKING_SANDBOX,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  const previousFetch = globalThis.fetch;
  let providerCalls = 0;

  process.env.NODE_ENV = 'test';
  process.env.AFRICASTALKING_USERNAME = 'sandbox';
  process.env.AFRICASTALKING_API_KEY = 'test-api-key';
  process.env.AFRICASTALKING_SANDBOX = 'true';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  resetSmsIdempotencyMemoryForTests();
  globalThis.fetch = async () => {
    providerCalls += 1;
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        SMSMessageData: {
          Recipients: [{ status: 'Success', statusCode: 101, messageId: `provider-${providerCalls}` }]
        }
      })
    };
  };

  t.after(() => {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetSmsIdempotencyMemoryForTests();
  });

  const base = {
    to: '+254700000001',
    purpose: 'test_event',
    customerId: 'customer-1',
    message: 'SALAMA LOCK Paygo test notification.'
  };
  const first = await sendSms({ ...base, eventId: 'event-1' });
  const sameEvent = await sendSms({ ...base, eventId: 'event-1', message: 'Changed event content.' });
  const sameContent = await sendSms({ ...base, eventId: 'event-2' });
  const changedContent = await sendSms({ ...base, eventId: 'event-3', message: 'SALAMA LOCK Paygo changed notification.' });

  assert.equal(first.providerAccepted, true);
  assert.equal(sameEvent.duplicate, true);
  assert.equal(sameEvent.duplicateReason, 'duplicate_event');
  assert.equal(sameContent.duplicate, true);
  assert.equal(sameContent.duplicateReason, 'duplicate_content_24h');
  assert.equal(changedContent.providerAccepted, true);
  assert.equal(providerCalls, 2);

  globalThis.fetch = async () => {
    providerCalls += 1;
    return {
      ok: false,
      status: 502,
      text: async () => JSON.stringify({ message: 'Provider timeout after request submission.' })
    };
  };
  await assert.rejects(
    sendSms({ ...base, eventId: 'event-4', message: 'Failure-path notification.' }),
    /Provider timeout/i
  );
  globalThis.fetch = async () => {
    providerCalls += 1;
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        SMSMessageData: {
          Recipients: [{ status: 'Success', statusCode: 101, messageId: `provider-${providerCalls}` }]
        }
      })
    };
  };
  const failedRetry = await sendSms({ ...base, eventId: 'event-4', message: 'Failure-path notification.' });
  assert.equal(failedRetry.providerAccepted, true);
  assert.equal(failedRetry.duplicate, false);
  assert.equal(providerCalls, 4);

  process.env.NODE_ENV = 'production';
  const failClosed = await sendSms({
    ...base,
    eventId: 'event-production-no-ledger',
    message: 'Production idempotency store check.'
  });
  process.env.NODE_ENV = 'test';
  assert.equal(failClosed.sent, false);
  assert.equal(failClosed.reason, 'idempotency_store_unavailable');
  assert.equal(providerCalls, 4);
});

test('payment callback retries resolve to the same global SMS event', () => {
  const first = buildSmsDedupeKey({
    phone: '+254700000001',
    purpose: 'payment_confirmation',
    eventId: 'payment_confirmation:TXN-123',
    message: 'First balance'
  });
  const retried = buildSmsDedupeKey({
    phone: '+254711111111',
    purpose: 'payment_confirmation',
    eventId: 'payment_confirmation:TXN-123',
    message: 'Changed balance after retry'
  });

  assert.equal(first, retried);
});

test('password-reset OTP still reaches the provider when the shared SMS ledger is unavailable', async (t) => {
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    AFRICASTALKING_USERNAME: process.env.AFRICASTALKING_USERNAME,
    AFRICASTALKING_API_KEY: process.env.AFRICASTALKING_API_KEY,
    AFRICASTALKING_SANDBOX: process.env.AFRICASTALKING_SANDBOX,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  const previousFetch = globalThis.fetch;
  let providerCalls = 0;

  process.env.NODE_ENV = 'test';
  process.env.AFRICASTALKING_USERNAME = 'sandbox';
  process.env.AFRICASTALKING_API_KEY = 'test-api-key';
  process.env.AFRICASTALKING_SANDBOX = 'true';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  resetSmsIdempotencyMemoryForTests();
  process.env.NODE_ENV = 'production';

  globalThis.fetch = async () => {
    providerCalls += 1;
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        SMSMessageData: {
          Recipients: [{ status: 'Success', statusCode: 101, messageId: 'otp-provider-1' }]
        }
      })
    };
  };

  t.after(() => {
    globalThis.fetch = previousFetch;
    process.env.NODE_ENV = 'test';
    resetSmsIdempotencyMemoryForTests();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const result = await sendOtpSms({
    phone: '+254700000002',
    otp: '123456',
    requestId: 'password-reset-request-1',
    sourcePortal: 'customer'
  });

  assert.equal(result.providerAccepted, true);
  assert.equal(result.providerMessageId, 'otp-provider-1');
  assert.equal(providerCalls, 1);
});

test('payment confirmation uses the updated database balance without a customer greeting', async (t) => {
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    AFRICASTALKING_USERNAME: process.env.AFRICASTALKING_USERNAME,
    AFRICASTALKING_API_KEY: process.env.AFRICASTALKING_API_KEY,
    AFRICASTALKING_SANDBOX: process.env.AFRICASTALKING_SANDBOX,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  const previousFetch = globalThis.fetch;
  let requestBody = null;

  process.env.NODE_ENV = 'test';
  process.env.AFRICASTALKING_USERNAME = 'sandbox';
  process.env.AFRICASTALKING_API_KEY = 'test-api-key';
  process.env.AFRICASTALKING_SANDBOX = 'true';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  resetSmsIdempotencyMemoryForTests();
  globalThis.fetch = async (_url, options = {}) => {
    requestBody = new URLSearchParams(String(options.body || ''));
    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        SMSMessageData: {
          Recipients: [{ status: 'Success', statusCode: 101, messageId: 'payment-provider-1' }]
        }
      })
    };
  };

  t.after(() => {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetSmsIdempotencyMemoryForTests();
  });

  const result = await sendPaymentConfirmedSms({
    customer: {
      id: 'customer-123',
      customer_name: 'Robert Omurunga Namayi',
      customer_phone: '+254700000000'
    },
    paymentId: 'payment-123',
    receipt: 'TXN-123',
    amount: 500,
    balance: 235300,
    repaymentPct: 50,
    accountReference: 'customer-123'
  });

  assert.equal(result.eventId, 'payment_confirmation:TXN-123');
  assert.equal(result.providerAccepted, true);
  assert.match(requestBody.get('message'), /^Payment confirmed for Robert Omurunga Namayi!/);
  assert.match(requestBody.get('message'), /KES 500 received/);
  assert.match(requestBody.get('message'), /New balance: KES 235,300/);
});

test('next-of-kin OTP is dispatched before slow device registration', async () => {
  const databaseSource = await readFile(new URL('../api/_lib/database.js', import.meta.url), 'utf8');
  const registrationStart = databaseSource.indexOf('export async function createAgentCustomer');
  const registrationSource = databaseSource.slice(registrationStart);
  const otpSend = registrationSource.indexOf('nextOfKinOtpDelivery = await sendNextOfKinAcceptanceSms');
  const deviceSync = registrationSource.indexOf('honorRegistration = await syncPhoneLockerForCustomer');

  assert.ok(otpSend >= 0);
  assert.ok(deviceSync >= 0);
  assert.ok(otpSend < deviceSync);
});
