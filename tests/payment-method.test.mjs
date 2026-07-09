import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';

// slice 153: a payment records WHICH provider took it, and the customer's chosen
// `method` selects the provider. PayPal is not wired yet, so it is rejected (400)
// rather than silently charged through another provider.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const AMOUNT = 150000;

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('payment provider selection by method', () => {
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

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** Drive a request to an accepted quote so a payment can be created. */
  async function readyForPayment() {
    const request = await (
      await api(CUSTOMER_ID, 'customer', 'POST', '/service-requests', {
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'Leaking kitchen sink',
        location: { latitude: 25.03, longitude: 121.56 },
      })
    ).json();
    await api(ADMIN_ID, 'admin', 'PATCH', `/service-requests/${request.id}/assignment`, {
      workerId: WORKER_ID,
    });
    await api(WORKER_ID, 'worker', 'POST', `/service-requests/${request.id}/quote`, {
      amountCents: AMOUNT,
    });
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${request.id}/quote/accept`);
    return request.id;
  }

  function createPayment(requestId, body) {
    return api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${requestId}/payment`, body);
  }

  it('records the mock provider when no method is given (no real provider configured)', async () => {
    const requestId = await readyForPayment();
    const res = await createPayment(requestId, { amountCents: AMOUNT });
    assert.equal(res.status, 201);
    assert.equal((await res.json()).provider, 'mock');
  });

  it('accepts the card method and records the mock provider (no Stripe key in test)', async () => {
    const requestId = await readyForPayment();
    const res = await createPayment(requestId, { amountCents: AMOUNT, method: 'card' });
    assert.equal(res.status, 201);
    assert.equal((await res.json()).provider, 'mock');
  });

  it('rejects the paypal method until it is wired (400) and creates no payment', async () => {
    const requestId = await readyForPayment();
    const res = await createPayment(requestId, { amountCents: AMOUNT, method: 'paypal' });
    assert.equal(res.status, 400);

    const fetched = await api(
      CUSTOMER_ID,
      'customer',
      'GET',
      `/service-requests/${requestId}/payment`,
    );
    assert.equal(fetched.status, 404);
  });
});
