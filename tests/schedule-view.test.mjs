import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveScheduleView } from '../app/src/features/schedule/scheduleView.ts';
import { isFuture, parseLocalDateTime } from '../app/src/features/schedule/scheduleFormat.ts';

// slice 175: the app's view of the two-party visit negotiation. Only the OTHER party may
// confirm, and the UI must never offer an action the server would reject.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WHEN = '2030-08-01T14:30:00.000Z';

const CUSTOMER = { id: CUSTOMER_ID, role: 'customer' };
const WORKER = { id: WORKER_ID, role: 'worker' };
const ADMIN = { id: ADMIN_ID, role: 'admin' };

function makeRequest(overrides = {}) {
  return {
    id: '523e4567-e89b-12d3-a456-426614174000',
    customerId: CUSTOMER_ID,
    workerId: WORKER_ID,
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    location: { latitude: 25.03, longitude: 121.56 },
    status: 'matched',
    createdAt: '2026-06-22T00:00:00.000Z',
    scheduleStatus: 'unset',
    ...overrides,
  };
}

describe('deriveScheduleView', () => {
  it('lets a party propose when nothing is on the table, with nothing to confirm', () => {
    const view = deriveScheduleView({ principal: WORKER, request: makeRequest() });
    assert.equal(view.visible, true);
    assert.equal(view.canPropose, true);
    assert.equal(view.canConfirm, false);
    assert.equal(view.proposeLabel, 'Propose a time');
    assert.match(view.summary, /No visit time agreed/);
  });

  it('lets the OTHER party confirm a proposal', () => {
    const request = makeRequest({
      scheduledAt: WHEN,
      scheduleStatus: 'proposed',
      scheduleProposedBy: 'customer',
    });
    // The worker did not propose it, so the worker may confirm.
    const workerView = deriveScheduleView({ principal: WORKER, request });
    assert.equal(workerView.canConfirm, true);
    assert.match(workerView.summary, /The customer proposed/);
  });

  it('does not let you confirm your own proposal', () => {
    const request = makeRequest({
      scheduledAt: WHEN,
      scheduleStatus: 'proposed',
      scheduleProposedBy: 'customer',
    });
    const customerView = deriveScheduleView({ principal: CUSTOMER, request });
    assert.equal(customerView.canConfirm, false);
    // ...but they can still change their mind and propose another time.
    assert.equal(customerView.canPropose, true);
    assert.match(customerView.summary, /You proposed/);
    assert.match(customerView.summary, /waiting for the worker/);
  });

  it('offers a reschedule once a time is confirmed', () => {
    const request = makeRequest({
      scheduledAt: WHEN,
      scheduleStatus: 'confirmed',
      scheduleProposedBy: 'customer',
    });
    const view = deriveScheduleView({ principal: WORKER, request });
    assert.equal(view.canConfirm, false);
    assert.equal(view.canPropose, true);
    assert.equal(view.proposeLabel, 'Propose a new time');
    assert.match(view.summary, /Confirmed for/);
  });

  it('shows an admin the time read-only — they are not a party to the appointment', () => {
    const request = makeRequest({
      scheduledAt: WHEN,
      scheduleStatus: 'proposed',
      scheduleProposedBy: 'customer',
    });
    const view = deriveScheduleView({ principal: ADMIN, request });
    assert.equal(view.visible, true);
    assert.equal(view.canPropose, false);
    assert.equal(view.canConfirm, false);
    assert.match(view.summary, /not yet confirmed/);
  });

  it('offers nothing on a closed job, or one with no worker to agree with', () => {
    for (const overrides of [{ status: 'completed' }, { status: 'cancelled' }]) {
      const view = deriveScheduleView({ principal: WORKER, request: makeRequest(overrides) });
      assert.equal(view.canPropose, false);
      assert.equal(view.canConfirm, false);
    }
    const unassigned = makeRequest({ workerId: undefined, status: 'pending' });
    const view = deriveScheduleView({ principal: CUSTOMER, request: unassigned });
    assert.equal(view.canPropose, false);
    assert.equal(view.visible, false);
  });
});

describe('parseLocalDateTime', () => {
  it('parses YYYY-MM-DD HH:MM (and the T form) as local time, returning ISO', () => {
    const iso = parseLocalDateTime('2030-08-01 14:30');
    assert.notEqual(iso, null);
    const back = new Date(iso);
    assert.equal(back.getFullYear(), 2030);
    assert.equal(back.getMonth(), 7); // August
    assert.equal(back.getDate(), 1);
    assert.equal(back.getHours(), 14);
    assert.equal(back.getMinutes(), 30);
    assert.equal(parseLocalDateTime('2030-08-01T14:30'), iso);
  });

  it('rejects malformed input and impossible calendar dates', () => {
    assert.equal(parseLocalDateTime(''), null);
    assert.equal(parseLocalDateTime('tomorrow'), null);
    assert.equal(parseLocalDateTime('2030-08-01'), null); // no time
    assert.equal(parseLocalDateTime('2030-8-1 14:30'), null); // unpadded
    assert.equal(parseLocalDateTime('2030-02-31 10:00'), null); // would roll over to March
    assert.equal(parseLocalDateTime('2030-08-01 25:00'), null); // not an hour
  });
});

describe('isFuture', () => {
  it('is true only for a time still ahead of now', () => {
    assert.equal(isFuture('2030-08-01T14:30:00.000Z'), true);
    assert.equal(isFuture('2020-08-01T14:30:00.000Z'), false);
  });
});
