import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import { verifyPaymentWebhook } from '../server/src/services/paymentWebhookService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('verifyPaymentWebhook', () => {
  const body = Buffer.from(JSON.stringify({ type: 'payment.succeeded', providerRef: 'mock_x' }));
  const sign = (secret, buf) => createHmac('sha256', secret).update(buf).digest('hex');

  it('accepts a valid HMAC signature over the raw body and rejects a wrong/missing one', () => {
    const env = { PAYMENTS_WEBHOOK_SECRET: 'sek', NODE_ENV: 'production' };
    assert.doesNotThrow(() => verifyPaymentWebhook(body, sign('sek', body), env));
    assert.throws(
      () => verifyPaymentWebhook(body, sign('wrong-secret', body), env),
      (e) => e.statusCode === 401,
    );
    assert.throws(
      () => verifyPaymentWebhook(body, undefined, env),
      (e) => e.statusCode === 401,
    );
    // A tampered body no longer matches the signature computed over the original.
    assert.throws(
      () => verifyPaymentWebhook(Buffer.from('{"tampered":true}'), sign('sek', body), env),
      (e) => e.statusCode === 401,
    );
  });

  it('without a configured secret, allows outside production but blocks in production', () => {
    assert.doesNotThrow(() =>
      verifyPaymentWebhook(body, undefined, {
        PAYMENTS_WEBHOOK_SECRET: undefined,
        NODE_ENV: 'test',
      }),
    );
    assert.throws(
      () =>
        verifyPaymentWebhook(body, undefined, {
          PAYMENTS_WEBHOOK_SECRET: undefined,
          NODE_ENV: 'production',
        }),
      (e) => e.statusCode === 401,
    );
  });
});

describe('POST /webhooks/payments', () => {
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
    return { requestId: request.id, providerRef: payment.providerRef };
  }

  function webhook(body) {
    return fetch(`${baseUrl}/webhooks/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function getPayment(requestId) {
    return fetch(`${baseUrl}/service-requests/${requestId}/payment`, {
      headers: headers(CUSTOMER_ID, 'customer'),
    });
  }

  it('confirms a pending payment as paid, idempotently', async () => {
    const { requestId, providerRef } = await pendingPayment();

    const res = await webhook({ type: 'payment.succeeded', providerRef });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { received: true });

    assert.equal((await (await getPayment(requestId)).json()).status, 'paid');

    // A retried delivery is a no-op success (still paid).
    assert.equal((await webhook({ type: 'payment.succeeded', providerRef })).status, 200);
    assert.equal((await (await getPayment(requestId)).json()).status, 'paid');
  });

  it('ignores an unhandled event type without settling the payment', async () => {
    const { requestId, providerRef } = await pendingPayment();

    assert.equal((await webhook({ type: 'payment.processing', providerRef })).status, 200);
    assert.equal((await (await getPayment(requestId)).json()).status, 'pending');
  });

  it('returns 404 for an unknown provider reference and 422 for an invalid payload', async () => {
    assert.equal(
      (await webhook({ type: 'payment.succeeded', providerRef: 'mock_unknown' })).status,
      404,
    );
    assert.equal((await webhook({ type: 'payment.succeeded' })).status, 422);
  });
});
