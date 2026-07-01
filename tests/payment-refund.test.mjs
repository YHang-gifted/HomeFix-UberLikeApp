import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('Payment refund', () => {
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
    return { requestId: request.id, paymentId: payment.id, providerRef: payment.providerRef };
  }

  async function paidPayment() {
    const ids = await pendingPayment();
    await fetch(`${baseUrl}/service-requests/${ids.requestId}/payment/pay`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    return ids;
  }

  function refund(requestId, who = headers(ADMIN_ID, 'admin')) {
    return fetch(`${baseUrl}/service-requests/${requestId}/payment/refund`, {
      method: 'POST',
      headers: who,
    });
  }

  function getPayment(requestId) {
    return fetch(`${baseUrl}/service-requests/${requestId}/payment`, {
      headers: headers(CUSTOMER_ID, 'customer'),
    });
  }

  function webhook(body) {
    return fetch(`${baseUrl}/webhooks/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('lets an admin refund a paid payment', async () => {
    const { requestId } = await paidPayment();
    const res = await refund(requestId);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'refunded');
    assert.equal((await (await getPayment(requestId)).json()).status, 'refunded');
  });

  it('forbids a non-admin and rejects refunding an unpaid payment', async () => {
    const paid = await paidPayment();
    assert.equal((await refund(paid.requestId, headers(CUSTOMER_ID, 'customer'))).status, 403);

    const pending = await pendingPayment();
    assert.equal((await refund(pending.requestId)).status, 409);
  });

  it('confirms a refund from a webhook, idempotently', async () => {
    const { requestId, providerRef } = await paidPayment();

    assert.equal((await webhook({ type: 'payment.refunded', providerRef })).status, 200);
    assert.equal((await (await getPayment(requestId)).json()).status, 'refunded');

    // A retried delivery stays refunded.
    assert.equal((await webhook({ type: 'payment.refunded', providerRef })).status, 200);
    assert.equal((await (await getPayment(requestId)).json()).status, 'refunded');
  });
});
