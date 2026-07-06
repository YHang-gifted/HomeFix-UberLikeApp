import assert from 'node:assert/strict';
import process from 'node:process';
import { after, before, describe, it } from 'node:test';

import Stripe from 'stripe';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import {
  resetPayments,
  resetPaymentProviderForTests,
  setPaymentProviderForTests,
} from '../server/src/services/paymentService.ts';
import { resetPayouts } from '../server/src/services/payoutService.ts';

/**
 * End-to-end regression for the Stripe hosted-checkout branch over the real HTTP
 * API — the path the unit tests only cover piecewise. A fake external-checkout
 * provider is injected (so no network), and the webhook is delivered to the real
 * `/webhooks/stripe` route with a genuine Stripe signature. It proves the three
 * pieces built in 130c/d/e hold together: create returns a `checkoutUrl` (never a
 * `clientSecret`), the mock `/pay` is blocked (409), and only the signed webhook
 * settles the payment and schedules the worker payout.
 */

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const QUOTE_CENTS = 150000;
// Platform fee 15% (1500 bps): floor(150000 * 1500 / 10000) = 22500.
const EXPECTED_WORKER_NET_CENTS = QUOTE_CENTS - 22500;

const WEBHOOK_SECRET = 'whsec_e2e';

/** A fake provider that behaves like Stripe hosted checkout without any network. */
const fakeExternalProvider = {
  usesExternalCheckout: true,
  createCharge(input) {
    return Promise.resolve({
      providerRef: `pi_${input.paymentId}`,
      checkoutUrl: `https://checkout.stripe.com/pay/cs_${input.paymentId}`,
    });
  },
};

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('end-to-end: Stripe hosted-checkout branch', () => {
  let server;
  let baseUrl;
  let previousSecretKey;
  let previousWebhookSecret;
  const stripe = new Stripe('sk_test_e2e');

  before(async () => {
    // Configure the Stripe webhook endpoint (verified locally, no network) and swap
    // in the fake external provider so create/pay behave as they would with Stripe.
    previousSecretKey = process.env['STRIPE_SECRET_KEY'];
    previousWebhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_e2e';
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

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** Drive a request to an accepted quote and return its id. */
  async function acceptedRequest() {
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
    return request.id;
  }

  /** Deliver a signed `checkout.session.completed` for our payment id. */
  function deliverWebhook(paymentId) {
    const payload = JSON.stringify({
      id: 'evt_e2e',
      type: 'checkout.session.completed',
      data: { object: { metadata: { paymentId } } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
    return fetch(`${baseUrl}/webhooks/stripe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
      body: payload,
    });
  }

  it('create returns a checkoutUrl (and never a clientSecret) in external mode', async () => {
    const requestId = await acceptedRequest();
    const res = await api(
      CUSTOMER_ID,
      'customer',
      'POST',
      `/service-requests/${requestId}/payment`,
      {
        amountCents: QUOTE_CENTS,
      },
    );
    assert.equal(res.status, 201);
    const payment = await res.json();
    assert.equal(payment.status, 'pending');
    assert.equal(payment.checkoutUrl, `https://checkout.stripe.com/pay/cs_${payment.id}`);
    assert.equal(payment.clientSecret, undefined);
  });

  it('blocks the mock /pay with 409 while an external provider is active', async () => {
    const requestId = await acceptedRequest();
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${requestId}/payment`, {
      amountCents: QUOTE_CENTS,
    });

    const res = await api(
      CUSTOMER_ID,
      'customer',
      'POST',
      `/service-requests/${requestId}/payment/pay`,
    );
    assert.equal(res.status, 409);

    // Still pending — the direct pay did not settle it.
    const payment = await (
      await api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${requestId}/payment`)
    ).json();
    assert.equal(payment.status, 'pending');
  });

  it('settles only via the signed webhook and schedules the worker payout, idempotently', async () => {
    const requestId = await acceptedRequest();
    const payment = await (
      await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${requestId}/payment`, {
        amountCents: QUOTE_CENTS,
      })
    ).json();

    const hookRes = await deliverWebhook(payment.id);
    assert.equal(hookRes.status, 200);
    assert.deepEqual(await hookRes.json(), { received: true });

    const settled = await (
      await api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${requestId}/payment`)
    ).json();
    assert.equal(settled.status, 'paid');

    const { items } = await (await api(WORKER_ID, 'worker', 'GET', '/payouts')).json();
    const payout = items.find((p) => p.paymentId === payment.id);
    assert.ok(payout, 'a payout should be scheduled for the worker');
    assert.equal(payout.workerId, WORKER_ID);
    assert.equal(payout.amountCents, EXPECTED_WORKER_NET_CENTS);
    assert.equal(payout.status, 'pending');

    // A retried webhook delivery is a no-op success (still paid).
    assert.equal((await deliverWebhook(payment.id)).status, 200);
    assert.equal(
      (
        await (
          await api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${requestId}/payment`)
        ).json()
      ).status,
      'paid',
    );
  });

  it('rejects a webhook with a bad signature (401)', async () => {
    const res = await fetch(`${baseUrl}/webhooks/stripe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
      body: JSON.stringify({ type: 'checkout.session.completed', data: { object: {} } }),
    });
    assert.equal(res.status, 401);
  });
});
