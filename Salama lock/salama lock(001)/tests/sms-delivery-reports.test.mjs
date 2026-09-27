import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeSmsDeliveryReportPayload,
  normalizeAfricasTalkingDeliveryStatus
} from '../api/_lib/sms-delivery-reports.js';

test('Africa\'s Talking Success is gateway acceptance on send and handset delivery on callback', () => {
  assert.equal(normalizeAfricasTalkingDeliveryStatus('Success'), 'provider_accepted');
  assert.equal(normalizeAfricasTalkingDeliveryStatus('Success', { callback: true }), 'delivered');
});

test('delivery callback preserves next-of-kin SMS metadata', () => {
  const existing = {
    providerMessageId: 'ATXid_next_of_kin_1',
    requestId: 'next-of-kin-request-1',
    recipientPhone: '+254700000003',
    purpose: 'next_of_kin_acceptance',
    sourcePortal: 'agent',
    senderMode: 'configured',
    senderId: 'SALAMA LOCKPAYGO',
    providerAckStatus: 'Success',
    providerAckStatusCode: 101,
    deliveryStatus: 'provider_accepted'
  };

  const report = mergeSmsDeliveryReportPayload({
    messageId: 'ATXid_next_of_kin_1',
    phoneNumber: '+254700000003',
    status: 'Success',
    networkCode: '63902'
  }, existing, '2026-07-17T08:00:00.000Z');

  assert.equal(report.deliveryStatus, 'delivered');
  assert.equal(report.deliveredAt, '2026-07-17T08:00:00.000Z');
  assert.equal(report.purpose, 'next_of_kin_acceptance');
  assert.equal(report.requestId, 'next-of-kin-request-1');
  assert.equal(report.senderId, 'SALAMA LOCKPAYGO');
  assert.equal(report.providerAckStatusCode, 101);
});

test('a late non-final callback cannot downgrade a delivered SMS', () => {
  const report = mergeSmsDeliveryReportPayload({
    messageId: 'ATXid_delivered_1',
    status: 'Submitted'
  }, {
    providerMessageId: 'ATXid_delivered_1',
    recipientPhone: '+254700000003',
    deliveryStatus: 'delivered',
    deliveredAt: '2026-07-17T08:00:00.000Z'
  }, '2026-07-17T08:05:00.000Z');

  assert.equal(report.deliveryStatus, 'delivered');
  assert.equal(report.deliveredAt, '2026-07-17T08:00:00.000Z');
});
