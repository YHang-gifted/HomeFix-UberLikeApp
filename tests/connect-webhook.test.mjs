import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, describe, it } from 'node:test';

import Stripe from 'stripe';

import { createApp } from '../server/src/app.ts';
import {
  handleConnectWebhook,
  selectConnectEventConstructor,
  stripeConnectEventConstructor,
} from '../server/src/services/connectWebhookService.ts';

// slice 166: a Stripe Connect `account.updated` webhook records whether a worker's
// connected account can receive payouts (`payouts_enabled`) — the platform only transfers
// once it is true. The record-then-transfer effect is covered end-to-end (through the app)
// in connect-payout.test.mjs; here we cover the signature/reduce, the config gating, the
// ignore branches, and the endpoint being off when unconfigured.

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
  // A non-account.updated event, and an account.updated for an account no worker owns, are
  // acknowledged with no effect (and no throw). We assert only that these resolve — the
  // persist-then-transfer effect is proven end-to-end in connect-payout.test.mjs, which
  // avoids asserting on the repository singleton (a direct .mjs import can be a separate
  // module instance from the app graph under tsx — the same reason injections are
  // globalThis-anchored).
  it('ignores an untracked account and non-account.updated events without throwing', async () => {
    await handleConnectWebhook({
      type: 'account.updated',
      accountId: 'acct_owned_by_nobody',
      payoutsEnabled: true,
    });
    await handleConnectWebhook({
      type: 'account.application.deauthorized',
      accountId: 'acct_owned_by_nobody',
      payoutsEnabled: true,
    });
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
