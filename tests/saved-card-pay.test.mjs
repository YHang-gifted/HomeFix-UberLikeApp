import assert from 'node:assert/strict';
import process from 'node:process';
import { after, before, beforeEach, describe, it } from 'node:test';

import Stripe from 'stripe';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import {
  resetPayments,
  resetPaymentProviderForTests,
  resetSavedCardChargerForTests,
  setPaymentProviderForTests,
  setSavedCardChargerForTests,
} from '../server/src/services/paymentService.ts';
import {
  resetSavedCardSeamsForTests,
  setSavedCardSeamsForTests,
} from '../server/src/services/paymentMethodService.ts';
import { resetPayouts } from '../server/src/services/payoutService.ts';

/**
 * End-to-end for the Uber-style saved-card pay path (Phase 3) over the real HTTP API. A saved
 * card is charged off-session; the payment settles ONLY via the verified `payment_intent.succeeded`
 * webhook (never synchronously) — the same single-settlement-authority rule as hosted checkout.
 * Every Stripe call is a fake (no network): the payment provider, the card-setup seams (to give
 * the customer a Stripe Customer), and the off-session charger.
 */

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const QUOTE_CENTS = 150000;
// Platform fee 15% (1500 bps): floor(150000 * 1500 / 10000) = 22500.
const EXPECTED_WORKER_NET_CENTS = QUOTE_CENTS - 22500;

const WEBHOOK_SECRET = 'whsec_saved';

/** A fake Stripe hosted-checkout provider (no network), so create-payment yields a stripe payment. */
const fakeExternalProvider = {
  id: 'stripe',
  usesExternalCheckout: true,
  createCharge(input) {
    const ref = input.idempotencyKey ?? input.paymentId;
    return Promise.resolve({
      providerRef: `pi_${ref}`,
      checkoutUrl: `https://checkout.stripe.com/pay/cs_${ref}`,
    });
  },
};

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('saved-card pay is unavailable when Stripe is not configured', () => {
  let server;
  let baseUrl;
  let previousSecretKey;

  before(async () => {
    // No STRIPE_SECRET_KEY and no charger override → the off-session charger is off.
    previousSecretKey = process.env['STRIPE_SECRET_KEY'];
    delete process.env['STRIPE_SECRET_KEY'];
    resetSavedCardChargerForTests();
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (previousSecretKey === undefined) {
      delete process.env['STRIPE_SECRET_KEY'];
    } else {
      process.env['STRIPE_SECRET_KEY'] = previousSecretKey;
    }
    await new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  it('returns 400 (not any random uuid 404) before touching the payment', async () => {
    const res = await fetch(`${baseUrl}/service-requests/${CUSTOMER_ID}/payment/pay-saved`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
      body: JSON.stringify({ paymentMethodId: 'pm_1' }),
    });
    assert.equal(res.status, 400);
  });
});

describe('POST /service-requests/:id/payment/pay-saved', () => {
  let server;
  let baseUrl;
  let previousSecretKey;
  let previousWebhookSecret;
  const stripe = new Stripe('sk_test_saved');

  before(async () => {
    previousSecretKey = process.env['STRIPE_SECRET_KEY'];
    previousWebhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_saved';
    process.env['STRIPE_WEBHOOK_SECRET'] = WEBHOOK_SECRET;
    setPaymentProviderForTests(fakeExternalProvider);

    await resetServiceRequests();
    await resetQuotes();
    await resetPayments();
    await resetPayouts();

    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    resetPaymentProviderForTests();
    resetSavedCardChargerForTests();
    resetSavedCardSeamsForTests();
    if (previousSecretKey === undefined) {
      delete process.env['STRIPE_SECRET_KEY'];
    } else {
      process.env['STRIPE_SECRET_KEY'] = previousSecretKey;
    }
    if (previousWebhookSecret === undefined) {
      delete process.env['STRIPE_WEBHOOK_SECRET'];
    } else {
      process.env['STRIPE_WEBHOOK_SECRET'] = previousWebhookSecret;
    }
    await new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  beforeEach(() => {
    resetSavedCardChargerForTests();
  });

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** Drive a request to an accepted quote and create its pending payment; returns the payment. */
  async function pendingPayment() {
    const request = await (
      await api(CUSTOMER_ID, 'customer', 'POST', '/service-requests', {
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'Leaking sink',
        location: { latitude: 25.03, longitude: 121.56 },
      })
    ).json();
    await api(ADMIN_ID, 'admin', 'PATCH', `/service-requests/${request.id}/assignment`, {
      workerId: WORKER_ID,
    });
    await api(WORKER_ID, 'worker', 'POST', `/service-requests/${request.id}/quote`, {
      amountCents: QUOTE_CENTS,
    });
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${request.id}/quote/accept`);
    const payment = await (
      await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${request.id}/payment`, {
        amountCents: QUOTE_CENTS,
      })
    ).json();
    return { requestId: request.id, payment };
  }

  /** Give the demo customer a Stripe Customer via the card-setup endpoint (fake seams). */
  async function ensureSavedCard() {
    setSavedCardSeamsForTests({
      customerCreator: () => Promise.resolve('cus_saved'),
      setupSessionCreator: () => Promise.resolve({ url: 'https://checkout.stripe.com/setup/x' }),
    });
    await api(CUSTOMER_ID, 'customer', 'POST', '/me/payment-methods/setup');
  }

  /** Deliver a signed `payment_intent.succeeded` for our payment id + intent id. */
  function deliverIntentSucceeded(paymentId, intentId) {
    const payload = JSON.stringify({
      id: 'evt_pi',
      type: 'payment_intent.succeeded',
      data: { object: { object: 'payment_intent', id: intentId, metadata: { paymentId } } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    return fetch(`${baseUrl}/webhooks/stripe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
      body: payload,
    });
  }

  // MUST run before any card is saved: once ensureSavedCard() has run, the demo customer keeps a
  // Stripe Customer id for the rest of the file (a shared in-memory repo).
  it('requires a saved card on file (409) when the customer has none', async () => {
    const { requestId } = await pendingPayment();
    const res = await api(
      CUSTOMER_ID,
      'customer',
      'POST',
      `/service-requests/${requestId}/payment/pay-saved`,
      { paymentMethodId: 'pm_1' },
    );
    assert.equal(res.status, 409);
  });

  it('charges the saved card and settles via the payment_intent.succeeded webhook, with a payout', async () => {
    await ensureSavedCard();
    const seen = [];
    setSavedCardChargerForTests((params) => {
      seen.push(params);
      return Promise.resolve({ status: 'succeeded', providerRef: 'pi_saved_1' });
    });

    const { requestId, payment } = await pendingPayment();
    const res = await api(
      CUSTOMER_ID,
      'customer',
      'POST',
      `/service-requests/${requestId}/payment/pay-saved`,
      { paymentMethodId: 'pm_card_1' },
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'succeeded' });
    // The charger got the customer + method + our payment id in metadata.
    assert.equal(seen[0].customerId, 'cus_saved');
    assert.equal(seen[0].paymentMethodId, 'pm_card_1');
    assert.equal(seen[0].metadata.paymentId, payment.id);

    // Not settled synchronously — still pending until the webhook lands.
    const beforeHook = await (
      await api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${requestId}/payment`)
    ).json();
    assert.equal(beforeHook.status, 'pending');
    assert.equal(beforeHook.providerRef, 'pi_saved_1'); // the intent id was stored

    assert.equal((await deliverIntentSucceeded(payment.id, 'pi_saved_1')).status, 200);

    const settled = await (
      await api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${requestId}/payment`)
    ).json();
    assert.equal(settled.status, 'paid');
    assert.equal(settled.providerRef, 'pi_saved_1');

    const { items } = await (await api(WORKER_ID, 'worker', 'GET', '/payouts')).json();
    const payout = items.find((p) => p.paymentId === payment.id);
    assert.ok(payout, 'a payout should be scheduled for the worker');
    assert.equal(payout.amountCents, EXPECTED_WORKER_NET_CENTS);
    assert.equal(payout.status, 'pending');
  });

  it('returns requires_action + a client secret when the card needs SCA', async () => {
    await ensureSavedCard();
    setSavedCardChargerForTests(() =>
      Promise.resolve({
        status: 'requires_action',
        providerRef: 'pi_sca_1',
        clientSecret: 'pi_sca_1_secret',
      }),
    );

    const { requestId } = await pendingPayment();
    const res = await api(
      CUSTOMER_ID,
      'customer',
      'POST',
      `/service-requests/${requestId}/payment/pay-saved`,
      { paymentMethodId: 'pm_card_1' },
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      status: 'requires_action',
      clientSecret: 'pi_sca_1_secret',
    });

    // Still pending — it settles only once SCA completes and the webhook for that intent lands.
    const still = await (
      await api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${requestId}/payment`)
    ).json();
    assert.equal(still.status, 'pending');
  });

  it('maps a declined card to 402', async () => {
    await ensureSavedCard();
    setSavedCardChargerForTests(() =>
      Promise.reject(
        Object.assign(new Error('Your card was declined.'), { type: 'StripeCardError' }),
      ),
    );

    const { requestId } = await pendingPayment();
    const res = await api(
      CUSTOMER_ID,
      'customer',
      'POST',
      `/service-requests/${requestId}/payment/pay-saved`,
      { paymentMethodId: 'pm_card_1' },
    );
    assert.equal(res.status, 402);
    assert.match((await res.json()).error, /declined/i);
  });

  it('forbids a non-customer (403)', async () => {
    await ensureSavedCard();
    setSavedCardChargerForTests(() =>
      Promise.resolve({ status: 'succeeded', providerRef: 'pi_x' }),
    );
    const { requestId } = await pendingPayment();
    const res = await api(
      WORKER_ID,
      'worker',
      'POST',
      `/service-requests/${requestId}/payment/pay-saved`,
      { paymentMethodId: 'pm_card_1' },
    );
    assert.equal(res.status, 403);
  });

  it('rejects an invalid payload (422)', async () => {
    const { requestId } = await pendingPayment();
    const res = await api(
      CUSTOMER_ID,
      'customer',
      'POST',
      `/service-requests/${requestId}/payment/pay-saved`,
      {},
    );
    assert.equal(res.status, 422);
  });
});
