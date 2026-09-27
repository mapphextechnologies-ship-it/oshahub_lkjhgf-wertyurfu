import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSaleCommissionsFromPayments,
  commissionMatchesProductScope,
  mergeDashboardCommissionRecords,
  summarizeUnpaidCommissionAmounts
} from '../api/_lib/database.js';
import {
  inferCommissionProductType,
  matchesCommissionProductScope,
  summarizeUnpaidCommissions
} from '../src/utils/commission.js';

test('sale commissions use each customer’s first successful bike or phone payment', () => {
  const commissions = buildSaleCommissionsFromPayments([
    {
      id: 'phone-first',
      receipt: 'PHONE-001',
      customer_id: 'customer-phone',
      customer_name: 'Phone Customer',
      agent_id: 'AG-001',
      agent_name: 'Phone Agent',
      product_type: 'product',
      product_model: 'Samsung A15',
      deposit_credit: 3_000,
      status: 'paid',
      date: '2026-07-01T09:00:00.000Z'
    },
    {
      id: 'phone-later',
      receipt: 'PHONE-002',
      customer_id: 'customer-phone',
      customer_name: 'Phone Customer',
      agent_id: 'AG-001',
      agent_name: 'Phone Agent',
      product_type: 'phone',
      product_model: 'Samsung A15',
      paygo_payment: 500,
      status: 'paid',
      date: '2026-07-02T09:00:00.000Z'
    },
    {
      id: 'bike-first',
      receipt: 'BIKE-001',
      customer_id: 'customer-bike',
      customer_name: 'Bike Customer',
      agent_id: 'AG-002',
      agent_name: 'Bike Agent',
      product_type: 'bike',
      product_model: 'TVS HLX 150',
      deposit_credit: 5_000,
      status: 'completed',
      date: '2026-07-03T09:00:00.000Z'
    },
    {
      id: 'bike-pending',
      receipt: 'BIKE-002',
      customer_id: 'customer-bike-pending',
      customer_name: 'Pending Customer',
      agent_id: 'AG-003',
      agent_name: 'Pending Agent',
      product_type: 'bike',
      product_model: 'Boxer 150',
      deposit_credit: 5_000,
      status: 'pending',
      date: '2026-07-04T09:00:00.000Z'
    }
  ]);

  assert.equal(commissions.length, 2);
  assert.deepEqual(
    commissions.map((commission) => ({
      paymentId: commission.payment_id,
      productType: commission.product_type,
      amount: commission.amount
    })),
    [
      { paymentId: 'phone-first', productType: 'phone', amount: 90 },
      { paymentId: 'bike-first', productType: 'bike', amount: 200 }
    ]
  );
});

test('sale commissions use customer fallback fields for generic payment rows', () => {
  const commissions = buildSaleCommissionsFromPayments(
    [
      {
        id: 'generic-phone-payment',
        receipt: 'GEN-PHONE-001',
        customer_id: 'customer-phone-generic',
        product_type: 'product',
        deposit_credit: 6_000,
        status: 'paid',
        date: '2026-07-05T09:00:00.000Z'
      }
    ],
    [
      {
        id: 'customer-phone-generic',
        customer_name: 'Fallback Phone Customer',
        agent_id: 'AG-004',
        agent_name: 'Fallback Agent',
        product_type: 'phone',
        product_model: 'Honor X7'
      }
    ]
  );

  assert.equal(commissions.length, 1);
  assert.equal(commissions[0].product_type, 'phone');
  assert.equal(commissions[0].amount, 180);
  assert.equal(commissions[0].agent_code, 'AG-004');
});

test('phone and bike commission scopes never include each other', () => {
  const legacyPhoneCommission = {
    product_type: 'product',
    product_model: 'Samsung A15',
    serial_number: '356789123456789'
  };
  const legacyBikeCommission = {
    product_type: 'product',
    product_model: 'TVS HLX 150',
    chassis_number: 'MD625MF54P1A90841'
  };
  const unknownCommission = {
    product_type: 'product',
    product_model: 'Product'
  };

  assert.equal(commissionMatchesProductScope(legacyPhoneCommission, 'phone'), true);
  assert.equal(commissionMatchesProductScope(legacyPhoneCommission, 'bike'), false);
  assert.equal(commissionMatchesProductScope(legacyBikeCommission, 'bike'), true);
  assert.equal(commissionMatchesProductScope(legacyBikeCommission, 'phone'), false);
  assert.equal(commissionMatchesProductScope(unknownCommission, 'phone'), false);
  assert.equal(commissionMatchesProductScope(unknownCommission, 'bike'), false);

  assert.equal(inferCommissionProductType(legacyPhoneCommission), 'phone');
  assert.equal(inferCommissionProductType(legacyBikeCommission), 'bike');
  assert.equal(matchesCommissionProductScope(legacyPhoneCommission, 'bike'), false);
  assert.equal(matchesCommissionProductScope(legacyBikeCommission, 'phone'), false);
});

test('dashboard commission totals enrich legacy rows and display bike and phone amounts', () => {
  const storedCommissions = [
    {
      id: 'COM-SALE-BIKE-001',
      payment_id: 'bike-payment',
      product_type: 'product',
      amount: 200,
      status: 'earned'
    },
    {
      id: 'COM-SALE-PHONE-001',
      payment_id: 'phone-payment',
      product_type: 'product',
      amount: 90,
      status: 'earned'
    },
    {
      id: 'COM-SALE-PAID-001',
      payment_id: 'paid-bike-payment',
      product_type: 'bike',
      amount: 500,
      status: 'paid'
    }
  ];
  const generatedCommissions = [
    {
      id: 'COM-SALE-BIKE-001',
      payment_id: 'bike-payment',
      product_type: 'bike',
      product_model: 'TVS HLX 150',
      chassis_number: 'MD625MF54P1A90841',
      amount: 200,
      status: 'earned'
    },
    {
      id: 'COM-SALE-PHONE-001',
      payment_id: 'phone-payment',
      product_type: 'phone',
      product_model: 'Honor X7',
      serial_number: '356789123456789',
      amount: 90,
      status: 'earned'
    }
  ];

  const merged = mergeDashboardCommissionRecords(storedCommissions, generatedCommissions);
  const backendTotals = summarizeUnpaidCommissionAmounts(merged);
  const frontendTotals = summarizeUnpaidCommissions(merged);

  assert.equal(merged.find((commission) => commission.id === 'COM-SALE-BIKE-001').product_type, 'bike');
  assert.equal(merged.find((commission) => commission.id === 'COM-SALE-PHONE-001').product_type, 'phone');
  assert.deepEqual(backendTotals, { total: 290, bike: 200, phone: 90 });
  assert.deepEqual(frontendTotals, {
    unpaidCommissions: 290,
    bikeUnpaidCommissions: 200,
    phoneUnpaidCommissions: 90
  });
});
