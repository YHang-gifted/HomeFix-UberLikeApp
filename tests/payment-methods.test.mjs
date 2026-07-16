import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { AppError } from '../server/src/errors/appError.ts';
import {
  resetSavedCardSeamsForTests,
  setSavedCardSeamsForTests,
} from '../server/src/services/paymentMethodService.ts';

// Phase 2a: Uber-style saved cards, server side. A customer saves a card once via a one-time
// hosted Checkout Session in setup mode (Option B — reuses the proven hosted-checkout infra, no
// raw card data touches us), attached to a per-customer Stripe Customer that is created and
// stored on first use; the saved cards are read back off that Customer. The three Stripe calls
// are injected seams so this exercises the persistence + plumbing without the network.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('/me/payment-methods', () => {
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
    resetSavedCardSeamsForTests();
    await new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  beforeEach(() => {
    resetSavedCardSeamsForTests();
  });

  function setup(id, role) {
    return fetch(`${baseUrl}/me/payment-methods/setup`, {
      method: 'POST',
      headers: headers(id, role),
    });
  }

  function list(id, role) {
    return fetch(`${baseUrl}/me/payment-methods`, { headers: headers(id, role) });
  }

  it('saves a card: creates + stores a Stripe Customer, returns the checkout URL, then reuses the Customer', async () => {
    const created = [];
    const setupCalls = [];
    setSavedCardSeamsForTests({
      customerCreator: ({ email, userId }) => {
        created.push({ email, userId });
        return Promise.resolve('cus_test1');
      },
      setupSessionCreator: ({ customerId }, { idempotencyKey }) => {
        setupCalls.push({ customerId, idempotencyKey });
        return Promise.resolve({ url: 'https://checkout.stripe.com/setup/x' });
      },
    });

    const res = await setup(CUSTOMER_ID, 'customer');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).checkoutUrl, 'https://checkout.stripe.com/setup/x');
    assert.equal(created.length, 1); // Customer created on first use
    assert.equal(setupCalls[0].customerId, 'cus_test1');

    // A second "add card" reuses the stored Customer (no second create) but must open a fresh
    // session — a setup session expires, so the idempotency key must differ from the first.
    const res2 = await setup(CUSTOMER_ID, 'customer');
    assert.equal(res2.status, 200);
    assert.equal(created.length, 1);
    assert.equal(setupCalls.length, 2);
    assert.notEqual(setupCalls[0].idempotencyKey, setupCalls[1].idempotencyKey);
  });

  it('lists the saved cards (safe display fields)', async () => {
    setSavedCardSeamsForTests({
      customerCreator: () => Promise.resolve('cus_test2'),
      setupSessionCreator: () => Promise.resolve({ url: 'https://checkout.stripe.com/setup/y' }),
      cardLister: (customerId) =>
        Promise.resolve([
          { id: `pm_1_${customerId}`, brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 },
        ]),
    });

    // Ensure the customer has a Stripe Customer, then list.
    await setup(CUSTOMER_ID, 'customer');
    const res = await list(CUSTOMER_ID, 'customer');
    assert.equal(res.status, 200);
    const cards = await res.json();
    assert.equal(cards.length, 1);
    assert.equal(cards[0].brand, 'visa');
    assert.equal(cards[0].last4, '4242');
    assert.equal(cards[0].expMonth, 12);
  });

  it('lists an empty array when saved cards are not configured', async () => {
    // No cardLister override and no Stripe env → listing is inert, not an error, so the screen
    // renders cleanly whether or not the customer has ever saved a card.
    const res = await list(CUSTOMER_ID, 'customer');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  });

  it('forbids a non-customer from saving (403) and from listing (403)', async () => {
    setSavedCardSeamsForTests({
      customerCreator: () => Promise.resolve('cus_x'),
      setupSessionCreator: () => Promise.resolve({ url: 'https://checkout.stripe.com/setup/z' }),
      cardLister: () => Promise.resolve([]),
    });
    assert.equal((await setup(WORKER_ID, 'worker')).status, 403);
    assert.equal((await list(WORKER_ID, 'worker')).status, 403);
  });

  it('is unavailable (400) when saved cards are not configured', async () => {
    // No override and no Stripe env → the setup-session creator is off, so saving is refused
    // before any Customer is touched.
    assert.equal((await setup(CUSTOMER_ID, 'customer')).status, 400);
  });

  it('maps a provider failure to 502, not 500', async () => {
    setSavedCardSeamsForTests({
      customerCreator: () => Promise.resolve('cus_test3'),
      setupSessionCreator: () =>
        Promise.reject(
          Object.assign(new Error('Stripe is down'), {
            type: 'StripeAPIError',
            requestId: 'req_9',
          }),
        ),
    });
    const res = await setup(CUSTOMER_ID, 'customer');
    assert.equal(res.status, 502);
    const { error } = await res.json();
    assert.match(error, /saving your card/i);
    assert.doesNotMatch(error, /Internal Server Error/i);
  });

  it('passes an AppError from the provider through unchanged', async () => {
    setSavedCardSeamsForTests({
      customerCreator: () => Promise.resolve('cus_test4'),
      setupSessionCreator: () =>
        Promise.reject(new AppError('Cards are closed in your region', 403)),
    });
    const res = await setup(CUSTOMER_ID, 'customer');
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'Cards are closed in your region');
  });

  it('requires authentication', async () => {
    assert.equal(
      (
        await fetch(`${baseUrl}/me/payment-methods`, {
          headers: { 'content-type': 'application/json' },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/me/payment-methods/setup`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        })
      ).status,
      401,
    );
  });
});
