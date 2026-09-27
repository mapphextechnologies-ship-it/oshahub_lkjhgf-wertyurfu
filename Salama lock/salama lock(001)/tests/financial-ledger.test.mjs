import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupeFinancialPayments,
  financialCustomerCollectedAmount,
  financialCustomerPaymentSummary,
  financialPaymentAmount,
  normalizeDashboardSummary,
  sumFinancialPayments,
  sumFinancialCustomerCollections,
  uniqueFinancialAccounts
} from '../src/utils/financialLedger.js';

test('split deposit and PAYGO values are the canonical transaction amount', () => {
  const payment = {
    deposit_credit: 1_000,
    paygo_payment: 400,
    amount: 2_800,
    paid_amount: 99_000
  };

  assert.equal(financialPaymentAmount(payment), 1_400);
});

test('the collected total includes only successful backend transactions', () => {
  const payments = [
    { id: 'paid', status: 'paid', amount: 1_000 },
    { id: 'complete', status: 'completed', amount: 400 },
    { id: 'success', status: 'success', amount: 250 },
    { id: 'pending', status: 'pending', amount: 8_000 },
    { id: 'unpaid', status: 'unpaid', amount: 5_000 }
  ];

  assert.equal(sumFinancialPayments(payments), 1_650);
});

test('payments sharing any provider or receipt identity are counted once', () => {
  const payments = [
    {
      id: 'first',
      provider_transaction_id: 'provider-1',
      receipt: 'RCP-100',
      status: 'paid',
      amount: 700
    },
    {
      id: 'second',
      provider_transaction_id: 'provider-2',
      receipt: 'RCP-100',
      status: 'paid',
      amount: 700
    }
  ];

  assert.equal(dedupeFinancialPayments(payments).length, 1);
  assert.equal(sumFinancialPayments(payments), 700);
});

test('rapid duplicate manual submissions are counted once', () => {
  const payments = [
    {
      id: 'MAN-ONE',
      receipt: 'SALAMA LOCK-CM-ONE',
      customer_id: 'customer-1',
      product_model: 'HONOR X5B',
      deposit_credit: 500,
      paygo_payment: 400,
      method: 'manual',
      source_portal: 'Manual payment',
      status: 'paid',
      date: '2026-07-15T10:00:00.000Z',
      created_at: '2026-07-15T10:00:01.000Z'
    },
    {
      id: 'MAN-TWO',
      receipt: 'SALAMA LOCK-CM-TWO',
      customer_id: 'customer-1',
      product_model: 'HONOR X5B',
      deposit_credit: 500,
      paygo_payment: 400,
      method: 'manual',
      source_portal: 'Manual payment',
      status: 'paid',
      date: '2026-07-15T10:00:02.000Z',
      created_at: '2026-07-15T10:00:02.000Z'
    }
  ];

  assert.equal(dedupeFinancialPayments(payments).length, 1);
  assert.equal(sumFinancialPayments(payments), 900);
});

test('separate manual payments outside the duplicate window remain separate', () => {
  const payments = [
    {
      id: 'MAN-ONE',
      receipt: 'SALAMA LOCK-CM-ONE',
      customer_id: 'customer-1',
      amount: 400,
      method: 'manual',
      status: 'paid',
      date: '2026-07-15T10:00:00.000Z'
    },
    {
      id: 'MAN-TWO',
      receipt: 'SALAMA LOCK-CM-TWO',
      customer_id: 'customer-1',
      amount: 400,
      method: 'manual',
      status: 'paid',
      date: '2026-07-15T10:03:00.000Z'
    }
  ];

  assert.equal(dedupeFinancialPayments(payments).length, 2);
  assert.equal(sumFinancialPayments(payments), 800);
});

test('expected balances use one account per customer', () => {
  const accounts = uniqueFinancialAccounts([
    { id: 'payment-1', customer_id: 'customer-1', total_payable: 250_000 },
    { id: 'payment-2', customer_id: 'customer-1', total_payable: 250_000 },
    { id: 'payment-3', customer_id: 'customer-2', total_payable: 100_000 }
  ]);

  assert.equal(accounts.length, 2);
  assert.equal(accounts.reduce((total, account) => total + account.total_payable, 0), 350_000);
});

test('dashboard normalization keeps the backend collected total authoritative', () => {
  const summary = normalizeDashboardSummary({
    total_collected: 15_000,
    expected_amount: 250_000,
    pending_payments: 100_000,
    unpaid_commissions: 7_000,
    bike_unpaid_commissions: 4_000,
    phone_unpaid_commissions: 3_000
  });

  assert.equal(summary.totalCollected, 15_000);
  assert.equal(summary.expectedAmount, 250_000);
  assert.equal(summary.pendingPayments, 100_000);
  assert.equal(summary.unpaidCommissions, 7_000);
  assert.equal(summary.bikeUnpaidCommissions, 4_000);
  assert.equal(summary.phoneUnpaidCommissions, 3_000);
});

test('dashboard collected total follows customer account balances, not a smaller ledger total', () => {
  const customers = [
    { id: 'customer-1', total_payable: 300_000, balance: 20_000 },
    { id: 'customer-2', total_payable: 250_000, balance: 27_000 },
    { id: 'rejected', total_payable: 100_000, balance: 0, application_status: 'rejected' }
  ];

  assert.equal(financialCustomerCollectedAmount(customers[0]), 280_000);
  assert.equal(sumFinancialCustomerCollections(customers), 503_000);
  assert.notEqual(sumFinancialCustomerCollections(customers), 484_655);
});

test('customer collected amount falls back to paid amount when no payable total exists', () => {
  assert.equal(financialCustomerCollectedAmount({ paid_amount: 18_500 }), 18_500);
  assert.equal(financialCustomerCollectedAmount({ total_payable: 250_000, paid_amount: 18_500 }), 18_500);
});

test('customer portal summary follows confirmed payment rows instead of a manually overridden balance', () => {
  const summary = financialCustomerPaymentSummary({
    total_payable: 260_000,
    paid_amount: 24_700,
    balance: 235_300
  }, [
    { id: 'deposit', status: 'paid', paid_amount: 20_000 },
    { id: 'payments', status: 'paid', paid_amount: 4_250 }
  ]);

  assert.deepEqual(summary, {
    totalPayable: 260_000,
    totalPaid: 24_250,
    balance: 235_750,
    progress: 9
  });
});

test('superseded payment revisions never contribute to account balances', () => {
  const summary = financialCustomerPaymentSummary({ total_payable: 10_000 }, [
    { id: 'original', status: 'paid', paid_amount: 5_000, ledger_state: 'superseded' },
    { id: 'revision', status: 'paid', paid_amount: 4_500, ledger_state: 'active', revision_of: 'original' }
  ]);

  assert.deepEqual(summary, {
    totalPayable: 10_000,
    totalPaid: 4_500,
    balance: 5_500,
    progress: 45
  });
});

test('finance balance adjustments keep the ledger equal to an entered balance', () => {
  const summary = financialCustomerPaymentSummary({ total_payable: 260_000 }, [
    { id: 'payments', status: 'paid', paid_amount: 24_250 },
    { id: 'balance-adjustment', status: 'paid', paid_amount: 208_700, source_portal: 'finance_balance_adjustment' }
  ]);

  assert.equal(summary.totalPaid, 232_950);
  assert.equal(summary.balance, 27_050);
});
