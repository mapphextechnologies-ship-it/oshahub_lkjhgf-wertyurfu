import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLastSevenDayCollectionTrend } from '../src/utils/collectionTrend.js';

test('collections graph contains exactly the latest seven calendar days', () => {
  const trend = buildLastSevenDayCollectionTrend([
    { date: '2026-07-08', amount: 9_999 },
    { date: '2026-07-09', amount: 100 },
    { date: '2026-07-14', amount: 400 },
    { date: '2026-07-15', amount: 800 },
    { date: '2026-07-16', amount: 7_777 }
  ], new Date('2026-07-15T12:00:00.000Z'));

  assert.equal(trend.length, 7);
  assert.deepEqual(trend.map((item) => item.date), [
    '2026-07-09',
    '2026-07-10',
    '2026-07-11',
    '2026-07-12',
    '2026-07-13',
    '2026-07-14',
    '2026-07-15'
  ]);
  assert.deepEqual(trend.map((item) => item.amount), [100, 0, 0, 0, 0, 400, 800]);
});

test('same-day collection points are combined without duplicate graph days', () => {
  const trend = buildLastSevenDayCollectionTrend([
    { date: '2026-07-15T08:00:00.000Z', amount: 400, records: 1, customers: ['Customer A'] },
    { date: '2026-07-15T14:00:00.000Z', amount: 600, records: 2, customers: ['Customer A', 'Customer B'] }
  ], new Date('2026-07-15T16:00:00.000Z'));
  const today = trend.at(-1);

  assert.equal(today.amount, 1_000);
  assert.equal(today.records, 3);
  assert.deepEqual(today.customers, ['Customer A', 'Customer B']);
});
