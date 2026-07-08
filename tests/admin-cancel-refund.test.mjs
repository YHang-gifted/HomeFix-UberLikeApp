import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetPayouts } from '../server/src/services/payoutService.ts';

// slice 145: the admin "cancel and refund" — the deliberate counterpart to SEC-0006.
// Cancelling a paid request refunds the payment and reverses the worker's pending
// payout, so no money is orphaned. Blocked (409) once the worker is already paid out.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const AMOUNT = 150000;

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('POST /service-requests/:id/cancel (admin cancel + refund)', () => {
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
    await resetQuotes();
    await resetPayments();
    await resetPayouts();
  });

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  async function createRequest() {
    return (
      await api(CUSTOMER_ID, 'customer', 'POST', '/service-requests', {
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'Leaking kitchen sink',
        location: { latitude: 25.03, longitude: 121.56 },
      })
    ).json();
  }

  /** Assign, quote, accept, and pay — leaving a paid payment and a pending payout. */
  async function driveToPaid() {
    const request = await createRequest();
    await api(ADMIN_ID, 'admin', 'PATCH', `/service-requests/${request.id}/assignment`, {
      workerId: WORKER_ID,
    });
    await api(WORKER_ID, 'worker', 'POST', `/service-requests/${request.id}/quote`, {
      amountCents: AMOUNT,
    });
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${request.id}/quote/accept`);
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${request.id}/payment`, {
      amountCents: AMOUNT,
    });
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${request.id}/payment/pay`);
    return request.id;
  }

  function requestStatus(id, role = 'admin', actor = ADMIN_ID) {
    return api(actor, role, 'GET', `/service-requests/${id}`)
      .then((res) => res.json())
      .then((body) => body.status);
  }

  function paymentStatus(id) {
    return api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${id}/payment`)
      .then((res) => res.json())
      .then((body) => body.status);
  }

  function workerPayouts() {
    return api(WORKER_ID, 'worker', 'GET', '/payouts')
      .then((res) => res.json())
      .then((body) => body.items);
  }

  it('refunds the payment, reverses the pending payout, and cancels', async () => {
    const id = await driveToPaid();
    assert.equal(await paymentStatus(id), 'paid');
    assert.equal((await workerPayouts()).length, 1);

    const res = await api(ADMIN_ID, 'admin', 'POST', `/service-requests/${id}/cancel`, {
      reason: 'Customer no longer needs the job.',
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'cancelled');

    assert.equal(await paymentStatus(id), 'refunded');
    assert.equal((await workerPayouts()).length, 0);
  });

  it('forbids a non-admin (403) and leaves the paid request intact', async () => {
    const id = await driveToPaid();

    for (const [actor, role] of [
      [CUSTOMER_ID, 'customer'],
      [WORKER_ID, 'worker'],
    ]) {
      const res = await api(actor, role, 'POST', `/service-requests/${id}/cancel`);
      assert.equal(res.status, 403);
    }

    assert.equal(await paymentStatus(id), 'paid');
    assert.notEqual(await requestStatus(id), 'cancelled');
    assert.equal((await workerPayouts()).length, 1);
  });

  it('cancels an unpaid request with no payment to refund', async () => {
    const request = await createRequest();
    const res = await api(ADMIN_ID, 'admin', 'POST', `/service-requests/${request.id}/cancel`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'cancelled');
  });

  it('blocks the cancel (409) once the worker has already been paid out', async () => {
    const id = await driveToPaid();
    const [payout] = await workerPayouts();
    // Settle the payout via the (mock, unsigned) provider webhook.
    await api(ADMIN_ID, 'admin', 'POST', '/webhooks/payouts', {
      type: 'payout.paid',
      payoutId: payout.id,
    });
    assert.equal((await workerPayouts())[0].status, 'paid');

    const res = await api(ADMIN_ID, 'admin', 'POST', `/service-requests/${id}/cancel`);
    assert.equal(res.status, 409);

    // Nothing changed: still paid, still paid-out, not cancelled.
    assert.equal(await paymentStatus(id), 'paid');
    assert.equal((await workerPayouts())[0].status, 'paid');
    assert.notEqual(await requestStatus(id), 'cancelled');
  });
});
