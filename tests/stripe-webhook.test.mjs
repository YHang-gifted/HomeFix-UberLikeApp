import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, beforeEach, describe, it } from 'node:test';

import Stripe from 'stripe';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import {
  handleStripeWebhook,
  selectStripeEventConstructor,
  stripeEventConstructor,
} from '../server/src/services/stripeWebhookService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('stripeEventConstructor', () => {
  // constructEvent verifies the signature locally (no network), so a dummy key is fine.
  const stripe = new Stripe('sk_test_dummy');
  const secret = 'whsec_test';
  const payload = JSON.stringify({
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { metadata: { paymentId: 'pay_123' } } },
  });

  it('verifies a valid Stripe signature and reduces the event to {type, paymentId}', () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const construct = stripeEventConstructor({ secretKey: 'sk_test_dummy', webhookSecret: secret });
    const event = construct(Buffer.from(payload), header);
    assert.equal(event.type, 'checkout.session.completed');
    assert.equal(event.paymentId, 'pay_123');
  });

  it('rejects a bad signature with 401', () => {
    const construct = stripeEventConstructor({ secretKey: 'sk_test_dummy', webhookSecret: secret });
    assert.throws(
      () => construct(Buffer.from(payload), 't=1,v1=deadbeef'),
      (e) => e.statusCode === 401,
    );
  });

  it('yields a null paymentId when the event carries no metadata', () => {
    const noMeta = JSON.stringify({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: { object: {} },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload: noMeta, secret });
    const construct = stripeEventConstructor({ secretKey: 'sk_test_dummy', webhookSecret: secret });
    assert.equal(construct(Buffer.from(noMeta), header).paymentId, null);
  });
});

describe('selectStripeEventConstructor', () => {
  it('is disabled (undefined) unless both the key and the webhook secret are set', () => {
    assert.equal(selectStripeEventConstructor({}), undefined);
    assert.equal(selectStripeEventConstructor({ STRIPE_SECRET_KEY: 'sk_test_x' }), undefined);
    assert.equal(selectStripeEventConstructor({ STRIPE_WEBHOOK_SECRET: 'whsec_x' }), undefined);
    assert.notEqual(
      selectStripeEventConstructor({
        STRIPE_SECRET_KEY: 'sk_test_x',
        STRIPE_WEBHOOK_SECRET: 'whsec_x',
      }),
      undefined,
    );
  });
});

describe('handleStripeWebhook', () => {
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

  beforeEach(async () => {
    await resetServiceRequests();
    await resetPayments();
    await resetQuotes();
  });

  async function pendingPayment() {
    const request = await (
      await fetch(`${baseUrl}/service-requests`, {
        method: 'POST',
        headers: headers(CUSTOMER_ID, 'customer'),
        body: JSON.stringify({
          customerId: CUSTOMER_ID,
          category: 'plumbing',
          description: 'Leaking sink',
          location: { latitude: 25.03, longitude: 121.56 },
        }),
      })
    ).json();
    await fetch(`${baseUrl}/service-requests/${request.id}/assignment`, {
      method: 'PATCH',
      headers: headers(ADMIN_ID, 'admin'),
      body: JSON.stringify({ workerId: WORKER_ID }),
    });
    await fetch(`${baseUrl}/service-requests/${request.id}/quote`, {
      method: 'POST',
      headers: headers(WORKER_ID, 'worker'),
      body: JSON.stringify({ amountCents: 150000 }),
    });
    await fetch(`${baseUrl}/service-requests/${request.id}/quote/accept`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    const payment = await (
      await fetch(`${baseUrl}/service-requests/${request.id}/payment`, {
        method: 'POST',
        headers: headers(CUSTOMER_ID, 'customer'),
        body: JSON.stringify({ amountCents: 150000 }),
      })
    ).json();
    return { requestId: request.id, paymentId: payment.id };
  }

  function paymentStatus(requestId) {
    return fetch(`${baseUrl}/service-requests/${requestId}/payment`, {
      headers: headers(CUSTOMER_ID, 'customer'),
    })
      .then((res) => res.json())
      .then((body) => body.status);
  }

  it('settles the matching payment on checkout.session.completed, idempotently', async () => {
    const { requestId, paymentId } = await pendingPayment();

    await handleStripeWebhook({ type: 'checkout.session.completed', paymentId });
    assert.equal(await paymentStatus(requestId), 'paid');

    // A retried delivery is a no-op (still paid, no throw).
    await handleStripeWebhook({ type: 'checkout.session.completed', paymentId });
    assert.equal(await paymentStatus(requestId), 'paid');
  });

  it('ignores an event without our payment id and other event types', async () => {
    const { requestId, paymentId } = await pendingPayment();

    await handleStripeWebhook({ type: 'checkout.session.completed', paymentId: null });
    await handleStripeWebhook({ type: 'payment_intent.succeeded', paymentId });
    assert.equal(await paymentStatus(requestId), 'pending');
  });
});
