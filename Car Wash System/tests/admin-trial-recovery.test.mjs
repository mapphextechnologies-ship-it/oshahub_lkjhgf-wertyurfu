import test from 'node:test';
import assert from 'node:assert/strict';
import { getTrialRequestState } from '../src/carwash/trialRequestState.js';

const now = Date.parse('2026-10-14T10:00:00Z');

test('expired unpaid trial can request an extension after earlier requests were resolved', () => {
  const state = getTrialRequestState(
    { status: 'EXPIRED', ends_at: '2026-10-01T10:00:00Z' },
    [{ request_type: 'TRIAL_EXTENSION', status: 'DECLINED' }],
    [],
    now,
  );

  assert.equal(state.trialExpired, true);
  assert.equal(state.trialRequestPending, false);
  assert.equal(state.canRequestTrialExtension, true);
});

test('only a genuinely pending trial request is shown as pending', () => {
  const state = getTrialRequestState(
    { status: 'TRIAL', ends_at: '2026-10-01T10:00:00Z' },
    [{ request_type: 'TRIAL_EXTENSION', status: 'PENDING' }],
    [],
    now,
  );

  assert.equal(state.trialRequestPending, true);
  assert.equal(state.canRequestTrialExtension, false);
});

test('active trials, paid tenants, and tenants with another pending request cannot submit a trial request', () => {
  assert.equal(getTrialRequestState({ status: 'TRIAL', ends_at: '2026-10-20T10:00:00Z' }, [], [], now).canRequestTrialExtension, false);
  assert.equal(getTrialRequestState({ status: 'EXPIRED', ends_at: '2026-10-01T10:00:00Z' }, [], [{ id: 'paid' }], now).canRequestTrialExtension, false);
  assert.equal(getTrialRequestState({ status: 'EXPIRED', ends_at: '2026-10-01T10:00:00Z' }, [{ request_type: 'PLAN_PURCHASE', status: 'PENDING' }], [], now).canRequestTrialExtension, false);
});
