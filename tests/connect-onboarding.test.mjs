import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { AppError } from '../server/src/errors/appError.ts';
import {
  resetConnectOnboarderForTests,
  setConnectOnboarderForTests,
} from '../server/src/services/connectService.ts';
import { EXPRESS_ACCOUNT_PARAMS } from '../server/src/services/paymentProvider.ts';

// slice 163: a worker starts Stripe Connect payout onboarding — the platform creates/reuses
// their connected account (id stored) and returns the hosted onboarding URL.

// slice 171: the connected account MUST request the `transfers` capability. Without it Stripe
// never activates transfers, so `payouts_enabled` never turns on and — behind the slice-166
// gate — every payout would sit pending for ever, silently. The real `accounts.create` call
// needs the network (it runs only in the go-live dry run), so we lock the parameters instead.
describe('Express connected-account parameters', () => {
  it('requests the transfers capability', () => {
    assert.equal(EXPRESS_ACCOUNT_PARAMS.type, 'express');
    assert.equal(EXPRESS_ACCOUNT_PARAMS.capabilities?.transfers?.requested, true);
  });

  it('does not request card_payments (the worker only receives transfers)', () => {
    assert.equal(EXPRESS_ACCOUNT_PARAMS.capabilities?.card_payments, undefined);
  });
});

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('POST /me/connect/onboard', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    resetConnectOnboarderForTests();
    await new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  beforeEach(() => {
    resetConnectOnboarderForTests();
  });

  function onboard(id, role) {
    return fetch(`${baseUrl}/me/connect/onboard`, { method: 'POST', headers: headers(id, role) });
  }

  it('creates a connected account, stores its id, and returns the onboarding URL', async () => {
    const seen = [];
    setConnectOnboarderForTests((existing) => {
      seen.push(existing);
      return Promise.resolve({
        accountId: 'acct_1',
        url: 'https://connect.stripe.com/onboard/x',
      });
    });

    const res = await onboard(WORKER_ID, 'worker');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).url, 'https://connect.stripe.com/onboard/x');
    assert.equal(seen[0], undefined); // no existing account on the first call

    // A second call reuses the stored account id.
    await onboard(WORKER_ID, 'worker');
    assert.equal(seen[1], 'acct_1');
  });

  it('forbids a non-worker (403)', async () => {
    setConnectOnboarderForTests(() =>
      Promise.resolve({ accountId: 'acct_1', url: 'https://connect.stripe.com/onboard/x' }),
    );
    assert.equal((await onboard(CUSTOMER_ID, 'customer')).status, 403);
  });

  it('is unavailable (400) when payouts are not configured', async () => {
    // No override and no Connect env → onboarding is off.
    assert.equal((await onboard(WORKER_ID, 'worker')).status, 400);
  });

  // slice 178: found by the go-live dry run. The Stripe SDK's own error used to reach the
  // error boundary unmapped, so a provider rejection came back as a bare 500 "Internal Server
  // Error" — blaming us, and telling the worker nothing. It must map like every other
  // provider adapter: 502 (the upstream refused) with a message about payout setup.
  describe('when the provider rejects the request', () => {
    /** A Stripe SDK error, structurally: an Error carrying `type` / `code` / `requestId`. */
    function stripeError(message) {
      return Object.assign(new Error(message), {
        type: 'StripeInvalidRequestError',
        code: 'account_invalid',
        requestId: 'req_123',
      });
    }

    it('maps the failure to 502, not 500', async () => {
      setConnectOnboarderForTests(() =>
        Promise.reject(
          stripeError("You can only create new accounts if you've signed up for Connect"),
        ),
      );

      const res = await onboard(WORKER_ID, 'worker');
      assert.equal(res.status, 502);

      const { error } = await res.json();
      assert.match(error, /payout setup/i);
      // The provider's wording describes OUR configuration; it is not repeated to the worker.
      assert.doesNotMatch(error, /Connect/);
      assert.doesNotMatch(error, /Internal Server Error/i);
    });

    it('passes an AppError from the provider through unchanged', async () => {
      // A deliberate, already-mapped failure keeps its own status — it is not flattened to 502.
      setConnectOnboarderForTests(() =>
        Promise.reject(new AppError('Payouts are closed in your region', 403)),
      );

      const res = await onboard(WORKER_ID, 'worker');
      assert.equal(res.status, 403);
      assert.equal((await res.json()).error, 'Payouts are closed in your region');
    });
  });
});
