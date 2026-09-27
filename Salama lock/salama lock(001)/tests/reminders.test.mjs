import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRepaymentDueAt } from '../api/_lib/reminders.js';

test('legacy PAYGO customers become due one day after their last payment', () => {
  const dueAt = resolveRepaymentDueAt({
    last_payment_date: '2026-07-12',
    paygo_next_due_at: '2027-12-31T00:00:00.000Z',
    paygo_schedule_status: ''
  });

  assert.equal(dueAt, '2026-07-13T00:00:00.000Z');
});

test('current PAYGO schedules use the stored next due timestamp', () => {
  const dueAt = resolveRepaymentDueAt({
    last_payment_date: '2026-07-12',
    paygo_next_due_at: '2026-07-16T08:00:00.000Z',
    paygo_schedule_status: 'active'
  });

  assert.equal(dueAt, '2026-07-16T08:00:00.000Z');
});
