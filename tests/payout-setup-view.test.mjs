import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { derivePayoutSetupView } from '../app/src/features/payouts/payoutSetupView.ts';

// slice 184. The Payouts screen used to key off nothing but the build-time feature flag, so it
// showed "Set up payouts" to every worker for ever — including one who had already finished.
// Three states, not two: the middle one (`pending`) is the whole reason this exists.

describe('derivePayoutSetupView', () => {
  it('invites a worker who has never started', () => {
    const view = derivePayoutSetupView(true, 'none');
    assert.equal(view.visible, true);
    assert.equal(view.actionLabel, 'Set up payouts');
    assert.equal(view.tone, 'action');
  });

  // The badly served worker: their payouts sit Pending by design (`tryTransferPayout` will not
  // send to an account Stripe has not cleared) and nothing on screen said why.
  it('explains the half-finished state, and that it resolves itself', () => {
    const view = derivePayoutSetupView(true, 'pending');
    assert.equal(view.visible, true);
    assert.equal(view.tone, 'waiting');
    assert.match(view.title, /not finished/i);
    assert.match(view.detail, /still verifying/i);
    assert.match(view.detail, /held/i);
    assert.match(view.detail, /automatically/i); // the backfill will flush them
    assert.equal(view.actionLabel, 'Finish payout setup');
  });

  it('does not invite an onboarded worker to set up payouts again', () => {
    const view = derivePayoutSetupView(true, 'enabled');
    assert.equal(view.visible, true);
    assert.equal(view.tone, 'done');
    assert.match(view.title, /active/i);
    // Still reachable — bank details change — but as housekeeping, not a call to action.
    assert.equal(view.actionLabel, 'Update payout details');
    assert.doesNotMatch(view.actionLabel, /^Set up/);
  });

  it('hides everything when the feature is off', () => {
    for (const status of ['none', 'pending', 'enabled']) {
      assert.equal(derivePayoutSetupView(false, status).visible, false);
    }
  });

  // A non-worker, or a profile we could not load. Guessing here would re-introduce the bug.
  it('hides the section when the status is unknown, rather than assuming "not set up"', () => {
    const view = derivePayoutSetupView(true, undefined);
    assert.equal(view.visible, false);
    assert.equal(view.actionLabel, null);
  });
});
