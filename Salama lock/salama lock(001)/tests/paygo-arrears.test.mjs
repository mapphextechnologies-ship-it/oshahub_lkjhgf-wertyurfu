import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaygoCustomerState } from '../api/_lib/paygo-flow.js';
import { computeCustomerArrears } from '../src/utils/paygo.js';

const now = new Date('2026-07-18T20:00:00.000Z');
const customer = {
  id: 'CUS-502E59C5E9',
  customer_name: 'Luther Pamba',
  total_payable: 260_000,
  paid_amount: 2_400,
  balance: 257_600,
  daily_installment: 400,
  due_date: '2026-07-15',
  overdue_days: 3,
  status: 'defaulted'
};

function payment(overrides = {}) {
  return {
    id: 'PAY-LUTHER-300',
    customer_id: customer.id,
    receipt: 'UGID203VJZ',
    status: 'paid',
    amount: 300,
    deposit_credit: 0,
    paygo_payment: 300,
    date: '2026-07-18T18:04:25.000Z',
    ...overrides
  };
}

test('a KES 300 partial payment reduces KES 1,200 arrears to KES 900 and three days to two', () => {
  const arrears = computeCustomerArrears({ customer, payments: [payment()], now });

  assert.equal(arrears.scheduledDays, 3);
  assert.equal(arrears.scheduledAmount, 1_200);
  assert.equal(arrears.paymentCredits, 300);
  assert.equal(arrears.overdueAmount, 900);
  assert.equal(arrears.overdueDays, 2);
  assert.equal(arrears.hasArrears, true);
});

test('the PAYGO update preserves the arrears due date after a partial payment', () => {
  const state = buildPaygoCustomerState(customer, [payment()], now);

  assert.equal(state.patch.due_date, '2026-07-15');
  assert.equal(state.patch.overdue_days, 2);
  assert.equal(state.nextStatus, 'active');
  assert.equal(state.arrears.overdueAmount, 900);
});

test('paying the full overdue amount clears the arrears', () => {
  const arrears = computeCustomerArrears({
    customer,
    payments: [payment({ amount: 1_200, paygo_payment: 1_200 })],
    now
  });

  assert.equal(arrears.overdueAmount, 0);
  assert.equal(arrears.overdueDays, 0);
  assert.equal(arrears.hasArrears, false);
});

test('deposit credit does not incorrectly reduce PAYGO arrears', () => {
  const arrears = computeCustomerArrears({
    customer,
    payments: [payment({ amount: 300, deposit_credit: 300, paygo_payment: 0 })],
    now
  });

  assert.equal(arrears.paymentCredits, 0);
  assert.equal(arrears.overdueAmount, 1_200);
  assert.equal(arrears.overdueDays, 3);
});

test('duplicate payment records are credited only once', () => {
  const arrears = computeCustomerArrears({
    customer,
    payments: [payment(), payment({ id: 'PAY-DUPLICATE' })],
    now
  });

  assert.equal(arrears.paymentCredits, 300);
  assert.equal(arrears.overdueAmount, 900);
});

test('a partial payment on the due day still counts as overdue shortfall', () => {
  const dueTodayCustomer = {
    ...customer,
    due_date: '2026-07-18',
    overdue_days: 0
  };

  const arrears = computeCustomerArrears({
    customer: dueTodayCustomer,
    payments: [{
      ...payment(),
      amount: 200,
      paygo_payment: 200
    }],
    now: new Date('2026-07-18T20:00:00.000Z')
  });

  assert.equal(arrears.scheduledDays, 1);
  assert.equal(arrears.scheduledAmount, 400);
  assert.equal(arrears.paymentCredits, 200);
  assert.equal(arrears.overdueAmount, 200);
  assert.equal(arrears.overdueDays, 1);
  assert.equal(arrears.hasArrears, true);
});
