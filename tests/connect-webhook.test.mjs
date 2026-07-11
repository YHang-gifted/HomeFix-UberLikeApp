import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, beforeEach, describe, it } from 'node:test';

import Stripe from 'stripe';

import { createApp } from '../server/src/app.ts';
import { userRepository } from '../server/src/repositories/userRepository.ts';
import {
  handleConnectWebhook,
  selectConnectEventConstructor,
  stripeConnectEventConstructor,
} from '../server/src/services/connectWebhookService.ts';

// slice 166: a Stripe Connect `account.updated` webhook records whether a worker's
// connected account can receive payouts (`payouts_enabled`) — the platform only transfers
// once it is true.

const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const ACCOUNT_ID = 'acct_cw_test';

describe('stripeConnectEventConstructor', () => {
  // constructEvent verifies the signature locally (no network), so a dummy key is fine.
  const stripe = new Stripe('sk_test_dummy');
  const secret = 'whsec_test';
  const config = { secretKey: 'sk_test_dummy', webhookSecret: secret };

  function signedHeader(payload) {
    return stripe.webhooks.generateTestHeaderString({ payload, secret });
  }

  it('verifies a valid signature and reduces account.updated to {type, accountId, payoutsEnabled}', () => {
    const payload = JSON.stringify({
      id: 'evt_1',
      type: 'account.updated',
      data: { object: { id: 'acct_1', payouts_enabled: true } },
    });
    const event = stripeConnectEventConstructor(config)(
      Buffer.from(payload),
      signedHeader(payload),
    );
    assert.equal(event.type, 'account.updated');
    assert.equal(event.accountId, 'acct_1');
    assert.equal(event.payoutsEnabled, true);
  });

  it('reports payoutsEnabled false when the account cannot yet receive payouts', () => {
    const payload = JSON.stringify({
      id: 'evt_2',
      type: 'account.updated',
      data: { object: { id: 'acct_1', payouts_enabled: false } },
    });
    const event = stripeConnectEventConstructor(config)(
      Buffer.from(payload),
      signedHeader(payload),
    );
    assert.equal(event.payoutsEnabled, false);
  });

  it('rejects a bad signature with 401', () => {
    const payload = JSON.stringify({ id: 'evt_3', type: 'account.updated', data: { object: {} } });
    assert.throws(
      () => stripeConnectEventConstructor(config)(Buffer.from(payload), 't=1,v1=deadbeef'),
      (e) => e.statusCode === 401,
    );
  });
});

describe('selectConnectEventConstructor', () => {
  it('is disabled (undefined) unless both the key and the Connect webhook secret are set', () => {
    assert.equal(selectConnectEventConstructor({}), undefined);
    assert.equal(selectConnectEventConstructor({ STRIPE_SECRET_KEY: 'sk_test_x' }), undefined);
    assert.equal(
      selectConnectEventConstructor({ STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_x' }),
      undefined,
    );
    assert.notEqual(
      selectConnectEventConstructor({
        STRIPE_SECRET_KEY: 'sk_test_x',
        STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_x',
      }),
      undefined,
    );
  });
});

describe('handleConnectWebhook', () => {
  beforeEach(async () => {
    await userRepository.setStripeAccountId(WORKER_ID, ACCOUNT_ID);
    await userRepository.setStripePayoutsEnabled(WORKER_ID, false);
  });

  it('records payouts enabled for the worker who owns the account', async () => {
    await handleConnectWebhook({
      type: 'account.updated',
      accountId: ACCOUNT_ID,
      payoutsEnabled: true,
    });
    assert.equal((await userRepository.findById(WORKER_ID))?.stripePayoutsEnabled, true);
  });

  it('ignores an untracked account and non-account.updated events (no throw)', async () => {
    await handleConnectWebhook({
      type: 'account.updated',
      accountId: 'acct_unknown',
      payoutsEnabled: true,
    });
    await handleConnectWebhook({
      type: 'account.application.deauthorized',
      accountId: ACCOUNT_ID,
      payoutsEnabled: true,
    });
    // The tracked worker is untouched (still disabled from the beforeEach reset).
    assert.equal((await userRepository.findById(WORKER_ID))?.stripePayoutsEnabled, false);
  });
});

describe('POST /webhooks/connect', () => {
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
    await new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  it('is disabled (404) when Connect webhooks are not configured', async () => {
    const res = await fetch(`${baseUrl}/webhooks/connect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
      body: JSON.stringify({ type: 'account.updated' }),
    });
    assert.equal(res.status, 404);
  });
});
