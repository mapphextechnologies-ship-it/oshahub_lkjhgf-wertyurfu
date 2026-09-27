import test from 'node:test';
import assert from 'node:assert/strict';
import { getRepaymentHealth } from '../src/utils/repaymentHealth.js';

test('a locked PAYGO state with zero overdue days is not marked bad', () => {
  const health = getRepaymentHealth({
    paygoState: 'locked',
    overdueDays: 0,
    dailyTarget: 400,
    balance: 249200
  });

  assert.equal(health.key, 'average');
  assert.match(health.note, /verify the current due date/i);
});

test('a large remaining balance alone does not make an account overdue', () => {
  const health = getRepaymentHealth({
    paygoState: 'active',
    overdueDays: 0,
    dailyTarget: 400,
    balance: 249200
  });

  assert.equal(health.key, 'good');
});

test('two overdue days marks the repayment account bad', () => {
  const health = getRepaymentHealth({
    paygoState: 'active',
    overdueDays: 2,
    dailyTarget: 400,
    balance: 800
  });

  assert.equal(health.key, 'bad');
  assert.equal(health.overdueDays, 2);
});

test('one overdue day remains red while overdue debt is unpaid', () => {
  const health = getRepaymentHealth({
    paygoState: 'active',
    overdueDays: 1,
    overdueAmount: 400,
    dailyTarget: 400,
    balance: 257_200
  });

  assert.equal(health.key, 'bad');
  assert.equal(health.isRedFlag, true);
  assert.equal(health.overdueAmount, 400);
});

test('a partial overdue amount remains red even below one full overdue day', () => {
  const health = getRepaymentHealth({
    paygoState: 'active',
    overdueDays: 0,
    overdueAmount: 100,
    dailyTarget: 400,
    balance: 256_900
  });

  assert.equal(health.key, 'bad');
  assert.equal(health.isRedFlag, true);
  assert.match(health.note, /KES 100 overdue/i);
});

test('an authoritative zero overdue amount removes red after the debt is cleared', () => {
  const health = getRepaymentHealth({
    paygoState: 'active',
    overdueDays: 1,
    overdueAmount: 0,
    dailyTarget: 400,
    balance: 256_800
  });

  assert.equal(health.key, 'good');
  assert.equal(health.isRedFlag, false);
  assert.equal(health.overdueAmount, 0);
});

test('Luther remains red while the KES 900 arrears are unpaid', () => {
  const health = getRepaymentHealth({
    paygoState: 'active',
    overdueDays: 2,
    overdueAmount: 900,
    dailyTarget: 400,
    balance: 257_600
  });

  assert.equal(health.key, 'bad');
  assert.equal(health.overdueAmount, 900);
  assert.equal(health.note, 'KES 900 overdue');
});

test('a defaulted customer remains bad even without a calculated overdue day', () => {
  const health = getRepaymentHealth({
    paygoState: 'active',
    repaymentStatus: 'defaulted',
    overdueDays: 0
  });

  assert.equal(health.key, 'bad');
});
