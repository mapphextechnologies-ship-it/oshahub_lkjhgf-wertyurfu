import assert from 'node:assert/strict';
import test from 'node:test';
import { activationPhoneCandidates } from '../api/customer/auth/activation-otp.js';

test('activation phone lookup accepts the supported Kenyan phone formats', () => {
  const expected = [
    '+254712345678',
    '254712345678',
    '0712345678',
    '712345678'
  ];

  assert.deepEqual(activationPhoneCandidates('0712345678'), expected);
  assert.deepEqual(activationPhoneCandidates('+254712345678'), expected);
  assert.deepEqual(activationPhoneCandidates('254712345678'), expected);
});

test('activation phone lookup rejects incomplete or non-Kenyan numbers', () => {
  assert.deepEqual(activationPhoneCandidates('071234'), []);
  assert.deepEqual(activationPhoneCandidates('+256712345678'), []);
  assert.deepEqual(activationPhoneCandidates('not-a-phone'), []);
});
