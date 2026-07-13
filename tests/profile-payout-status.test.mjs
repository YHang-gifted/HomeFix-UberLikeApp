import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import {
  resetConnectOnboarderForTests,
  setConnectOnboarderForTests,
} from '../server/src/services/connectService.ts';
import { handleConnectWebhook } from '../server/src/services/connectWebhookService.ts';

// slice 184: `GET /me` now tells a worker where they stand with payout onboarding, so the app
// can stop offering "Set up payouts" to someone who has already done it — and can explain the
// half-finished state instead of leaving their money sitting Pending with no reason given.
//
// Driven entirely over HTTP: under tsx a `.mjs` test importing a repository directly gets a
// different instance than the app's, so state set up that way is invisible behind the API.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('GET /me — payout account status', () => {
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

  function me(id, role) {
    return fetch(`${baseUrl}/me`, { headers: headers(id, role) }).then((res) => res.json());
  }

  async function onboard() {
    setConnectOnboarderForTests(() =>
      Promise.resolve({ accountId: 'acct_1', url: 'https://connect.stripe.com/onboard/x' }),
    );
    await fetch(`${baseUrl}/me/connect/onboard`, {
      method: 'POST',
      headers: headers(WORKER_ID, 'worker'),
    });
  }

  // Runs first, while the seeded worker still has no connected account.
  it("is 'none' before the worker has started", async () => {
    assert.equal((await me(WORKER_ID, 'worker')).payoutAccountStatus, 'none');
  });

  // The state the old screen could not express. Having an account is NOT being able to receive
  // money: returning from the hosted onboarding proves nothing, only `account.updated` does.
  it("is 'pending' once an account exists but Stripe has not cleared it", async () => {
    await onboard();
    assert.equal((await me(WORKER_ID, 'worker')).payoutAccountStatus, 'pending');
  });

  it("becomes 'enabled' only when account.updated says payouts are on", async () => {
    await onboard();
    await handleConnectWebhook({
      type: 'account.updated',
      accountId: 'acct_1',
      payoutsEnabled: true,
    });
    assert.equal((await me(WORKER_ID, 'worker')).payoutAccountStatus, 'enabled');
  });

  it('falls back to pending if Stripe withdraws the capability', async () => {
    await onboard();
    await handleConnectWebhook({
      type: 'account.updated',
      accountId: 'acct_1',
      payoutsEnabled: false,
    });
    assert.equal((await me(WORKER_ID, 'worker')).payoutAccountStatus, 'pending');
  });

  it('is absent for a customer — nobody else can be paid out', async () => {
    const profile = await me(CUSTOMER_ID, 'customer');
    assert.equal(profile.payoutAccountStatus, undefined);
    assert.equal(profile.role, 'customer');
  });
});
