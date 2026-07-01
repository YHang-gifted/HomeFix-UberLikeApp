import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import { resetNotifications } from '../server/src/services/notificationService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_CUSTOMER_ID = '223e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('request payments (mock)', () => {
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
    await resetNotifications();
  });

  async function createRequest() {
    return (
      await fetch(`${baseUrl}/service-requests`, {
        method: 'POST',
        headers: headers(CUSTOMER_ID, 'customer'),
        body: JSON.stringify({
          customerId: CUSTOMER_ID,
          category: 'plumbing',
          description: 'Leaking kitchen sink',
          location: { latitude: 25.03, longitude: 121.56 },
        }),
      })
    ).json();
  }

  async function assign(id) {
    await fetch(`${baseUrl}/service-requests/${id}/assignment`, {
      method: 'PATCH',
      headers: headers(ADMIN_ID, 'admin'),
      body: JSON.stringify({ workerId: WORKER_ID }),
    });
  }

  function createPayment(id, amountCents, id2 = CUSTOMER_ID) {
    return fetch(`${baseUrl}/service-requests/${id}/payment`, {
      method: 'POST',
      headers: headers(id2, 'customer'),
      body: JSON.stringify({ amountCents }),
    });
  }

  // Payment is gated on an accepted quote of the same amount: the assigned worker
  // proposes and the owning customer accepts before a payment can be created.
  async function setupAcceptedQuote(id, amountCents) {
    await fetch(`${baseUrl}/service-requests/${id}/quote`, {
      method: 'POST',
      headers: headers(WORKER_ID, 'worker'),
      body: JSON.stringify({ amountCents }),
    });
    await fetch(`${baseUrl}/service-requests/${id}/quote/accept`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
  }

  it('lets the owning customer create a pending payment for an assigned request', async () => {
    const created = await createRequest();
    await assign(created.id);
    await setupAcceptedQuote(created.id, 150000);
    const res = await createPayment(created.id, 150000);
    assert.equal(res.status, 201);
    const payment = await res.json();
    assert.equal(payment.amountCents, 150000);
    assert.equal(payment.currency, 'TWD');
    assert.equal(payment.status, 'pending');
    assert.equal(payment.workerId, WORKER_ID);
    // Marketplace split at the default 15%: platform keeps 22500, worker nets 127500.
    assert.equal(payment.platformFeeCents, 22500);
    assert.equal(payment.workerNetCents, 127500);
    // The provider (mock by default) assigned a reference for this charge.
    assert.match(payment.providerRef, /^mock_/);
  });

  it('marks the payment paid and notifies the worker', async () => {
    const created = await createRequest();
    await assign(created.id);
    await setupAcceptedQuote(created.id, 150000);
    await createPayment(created.id, 150000);

    const pay = await fetch(`${baseUrl}/service-requests/${created.id}/payment/pay`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    assert.equal(pay.status, 200);
    const paid = await pay.json();
    assert.equal(paid.status, 'paid');
    assert.equal(typeof paid.paidAt, 'string');

    const notifs = await (
      await fetch(`${baseUrl}/notifications`, { headers: headers(WORKER_ID, 'worker') })
    ).json();
    assert.ok(notifs.items.some((n) => n.requestId === created.id && /payment/i.test(n.message)));
  });

  it('lets the assigned worker view the payment', async () => {
    const created = await createRequest();
    await assign(created.id);
    await setupAcceptedQuote(created.id, 150000);
    await createPayment(created.id, 150000);
    const res = await fetch(`${baseUrl}/service-requests/${created.id}/payment`, {
      headers: headers(WORKER_ID, 'worker'),
    });
    assert.equal(res.status, 200);
  });

  it('refuses a payment for a request with no assigned worker (422)', async () => {
    const created = await createRequest();
    const res = await createPayment(created.id, 150000);
    assert.equal(res.status, 422);
  });

  it('refuses a second payment for the same request (409)', async () => {
    const created = await createRequest();
    await assign(created.id);
    await setupAcceptedQuote(created.id, 150000);
    await createPayment(created.id, 150000);
    const res = await createPayment(created.id, 150000);
    assert.equal(res.status, 409);
  });

  it('refuses to pay twice (409)', async () => {
    const created = await createRequest();
    await assign(created.id);
    await setupAcceptedQuote(created.id, 150000);
    await createPayment(created.id, 150000);
    await fetch(`${baseUrl}/service-requests/${created.id}/payment/pay`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    const second = await fetch(`${baseUrl}/service-requests/${created.id}/payment/pay`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    assert.equal(second.status, 409);
  });

  it('refuses a payment without an accepted quote (422)', async () => {
    const created = await createRequest();
    await assign(created.id);
    const res = await createPayment(created.id, 150000);
    assert.equal(res.status, 422);
  });

  it('refuses a payment whose amount does not match the accepted quote (422)', async () => {
    const created = await createRequest();
    await assign(created.id);
    await setupAcceptedQuote(created.id, 150000);
    const res = await createPayment(created.id, 999);
    assert.equal(res.status, 422);
  });

  it('forbids a non-owner from creating a payment (403)', async () => {
    const created = await createRequest();
    await assign(created.id);
    const res = await createPayment(created.id, 150000, OTHER_CUSTOMER_ID);
    assert.equal(res.status, 403);
  });

  it('rejects a non-positive amount (422)', async () => {
    const created = await createRequest();
    await assign(created.id);
    const res = await createPayment(created.id, 0);
    assert.equal(res.status, 422);
  });

  it('returns 404 when there is no payment yet', async () => {
    const created = await createRequest();
    await assign(created.id);
    const res = await fetch(`${baseUrl}/service-requests/${created.id}/payment`, {
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    assert.equal(res.status, 404);
  });

  it('returns 401 without authentication', async () => {
    const created = await createRequest();
    const res = await fetch(`${baseUrl}/service-requests/${created.id}/payment`);
    assert.equal(res.status, 401);
  });

  async function listMyPayments(id, role) {
    return fetch(`${baseUrl}/payments`, { headers: headers(id, role) });
  }

  it('lists the calling customer their own payment, excluding other customers', async () => {
    const created = await createRequest();
    await assign(created.id);
    await setupAcceptedQuote(created.id, 150000);
    await createPayment(created.id, 150000);

    const mine = await (await listMyPayments(CUSTOMER_ID, 'customer')).json();
    assert.equal(mine.items.length, 1);
    assert.equal(mine.items[0].requestId, created.id);
    assert.equal(mine.items[0].customerId, CUSTOMER_ID);

    const others = await (await listMyPayments(OTHER_CUSTOMER_ID, 'customer')).json();
    assert.deepEqual(others.items, []);
  });

  it('returns an empty list for a customer with no payments', async () => {
    const res = await listMyPayments(CUSTOMER_ID, 'customer');
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).items, []);
  });

  it('lets the assigned worker list payments they received, excluding others', async () => {
    const created = await createRequest();
    await assign(created.id);
    await setupAcceptedQuote(created.id, 150000);
    await createPayment(created.id, 150000);

    const received = await (await listMyPayments(WORKER_ID, 'worker')).json();
    assert.equal(received.items.length, 1);
    assert.equal(received.items[0].requestId, created.id);
    assert.equal(received.items[0].workerId, WORKER_ID);

    const otherWorker = '523e4567-e89b-12d3-a456-426614174999';
    const none = await (await listMyPayments(otherWorker, 'worker')).json();
    assert.deepEqual(none.items, []);
  });

  it('forbids an admin from the payment history (403)', async () => {
    assert.equal((await listMyPayments(ADMIN_ID, 'admin')).status, 403);
  });

  it('returns 401 for payment history without authentication', async () => {
    const res = await fetch(`${baseUrl}/payments`);
    assert.equal(res.status, 401);
  });
});
