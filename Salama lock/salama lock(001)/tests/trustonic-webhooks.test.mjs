import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizeTrustonicWebhook,
  buildMomaniWebhookRequest,
  classifyMomaniDeliveryStatus,
  deliverMomaniWebhook,
  identifyTrustonicEvent,
  nextWebhookAttemptAt,
  processTrustonicWebhookQueue
} from '../api/_lib/trustonic-webhooks.js';

function request({ url = '/api/trustonic/webhook', headers = {} } = {}) {
  return { url, headers };
}

const relayEnv = {
  MOMANI_TRUSTONIC_WEBHOOK_URL: 'https://momani.example.test/trustonic/webhook',
  MOMANI_TRUSTONIC_WEBHOOK_AUTH_MODE: 'query',
  MOMANI_TRUSTONIC_WEBHOOK_TOKEN: 'new-momani-token',
  MOMANI_TRUSTONIC_WEBHOOK_TOKEN_PARAM: 'token',
  MOMANI_TRUSTONIC_WEBHOOK_MAX_ATTEMPTS: '3'
};

test('Trustonic webhook requires a configured matching secret', () => {
  assert.deepEqual(authorizeTrustonicWebhook(request(), {}), {
    configured: false,
    authorized: false
  });
  assert.equal(authorizeTrustonicWebhook(
    request({ url: '/api/trustonic/webhook?token=correct-secret' }),
    { TRUSTONIC_WEBHOOK_SECRET: 'correct-secret' }
  ).authorized, true);
  assert.equal(authorizeTrustonicWebhook(
    request({ headers: { authorization: 'Bearer wrong-secret' } }),
    { TRUSTONIC_WEBHOOK_SECRET: 'correct-secret' }
  ).authorized, false);
});

test('Momani delivery worker stays safely disabled until its URL is configured', async () => {
  const result = await processTrustonicWebhookQueue({ env: {} });
  assert.equal(result.disabled, true);
  assert.equal(result.checked, 0);
});

test('Trustonic event identity deduplicates the same tenant event', () => {
  const first = identifyTrustonicEvent({
    rawBody: '{"eventId":"evt-10","tenantId":"tenant-a","state":"LOCKED"}',
    payload: { eventId: 'evt-10', tenantId: 'tenant-a', state: 'LOCKED' }
  });
  const repeated = identifyTrustonicEvent({
    rawBody: '{"state":"UNLOCKED","tenantId":"tenant-a","eventId":"evt-10"}',
    payload: { state: 'UNLOCKED', tenantId: 'tenant-a', eventId: 'evt-10' }
  });
  const otherTenant = identifyTrustonicEvent({
    rawBody: '{"eventId":"evt-10","tenantId":"tenant-b"}',
    payload: { eventId: 'evt-10', tenantId: 'tenant-b' }
  });

  assert.equal(first.eventKey, repeated.eventKey);
  assert.notEqual(first.eventKey, otherTenant.eventKey);
  assert.equal(first.externalEventId, 'evt-10');
});

test('Momani relay preserves the raw event and signature while adding configured query auth', () => {
  const requestDetails = buildMomaniWebhookRequest({
    id: 'stored-event-id',
    attempt_count: 1,
    raw_body: '{"eventId":"evt-11"}',
    source_headers: {
      'x-trustonic-signature': 'signature-value',
      authorization: 'must-not-be-forwarded'
    }
  }, relayEnv);

  assert.equal(requestDetails.url.searchParams.get('token'), 'new-momani-token');
  assert.equal(requestDetails.options.body, '{"eventId":"evt-11"}');
  assert.equal(requestDetails.options.headers['x-trustonic-signature'], 'signature-value');
  assert.equal(requestDetails.options.headers.Authorization, undefined);
  assert.equal(requestDetails.options.headers.authorization, undefined);
  assert.equal(requestDetails.options.headers['X-SALAMA LOCK-Webhook-Attempt'], '2');
});

test('delivery classification stops retrying authorization and other permanent client failures', () => {
  assert.equal(classifyMomaniDeliveryStatus(202), 'delivered');
  assert.equal(classifyMomaniDeliveryStatus(403), 'dead_letter');
  assert.equal(classifyMomaniDeliveryStatus(404), 'dead_letter');
  assert.equal(classifyMomaniDeliveryStatus(429), 'retry');
  assert.equal(classifyMomaniDeliveryStatus(503), 'retry');
});

test('Momani 403 is dead-lettered after one attempt', async () => {
  const result = await deliverMomaniWebhook({
    id: 'event-403',
    attempt_count: 0,
    raw_body: '{}'
  }, {
    env: relayEnv,
    fetchImpl: async () => ({ status: 403 }),
    now: new Date('2026-07-15T12:00:00.000Z')
  });

  assert.deepEqual(result, {
    status: 'dead_letter',
    attemptCount: 1,
    httpStatus: 403,
    error: 'Momani returned HTTP 403.',
    nextAttemptAt: null
  });
});

test('temporary Momani failure is rescheduled with bounded backoff', async () => {
  const now = new Date('2026-07-15T12:00:00.000Z');
  const result = await deliverMomaniWebhook({
    id: 'event-503',
    attempt_count: 1,
    raw_body: '{}'
  }, {
    env: relayEnv,
    fetchImpl: async () => ({ status: 503 }),
    now
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.attemptCount, 2);
  assert.equal(result.nextAttemptAt, '2026-07-15T12:02:00.000Z');
  assert.equal(nextWebhookAttemptAt(20, now), '2026-07-16T00:00:00.000Z');
});
