import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetPayouts } from '../server/src/services/payoutService.ts';
import { resetRefundRequests } from '../server/src/services/refundRequestService.ts';

// Slice 1 of the customer refund/dispute flow: the owning customer files a refund request on a
// paid payment; it queues (status `open`) for an admin to resolve in a later slice. No money moves
// here. Payments settle via the mock provider (no Stripe env), so `POST /payment/pay` marks paid.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const QUOTE_CENTS = 150000;

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('customer refund requests', () => {
  let server;
  let baseUrl;

  before(async () => {
    await resetServiceRequests();
    await resetQuotes();
    await resetPayments();
    await resetPayouts();
    await resetRefundRequests();
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
    await resetRefundRequests();
  });

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** Drive a request to an accepted quote; returns its id. */
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

  /** An accepted request whose payment is set up and paid (mock provider). */
  async function paidRequest() {
    const requestId = await acceptedRequest();
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${requestId}/payment`, {
      amountCents: QUOTE_CENTS,
    });
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${requestId}/payment/pay`);
    return requestId;
  }

  function fileRefund(requestId, actorId, role, body = { reason: 'Work was not completed' }) {
    return api(actorId, role, 'POST', `/service-requests/${requestId}/refund-request`, body);
  }

  it('lets the owning customer file a refund request on a paid payment', async () => {
    const requestId = await paidRequest();
    const res = await fileRefund(requestId, CUSTOMER_ID, 'customer');
    assert.equal(res.status, 201);
    const created = await res.json();
    assert.equal(created.status, 'open');
    assert.equal(created.requestId, requestId);
    assert.equal(created.reason, 'Work was not completed');
    assert.equal(created.resolvedAt, undefined);
  });

  it('forbids a non-owner (403)', async () => {
    const requestId = await paidRequest();
    assert.equal((await fileRefund(requestId, WORKER_ID, 'worker')).status, 403);
  });

  it('404s when the request has no payment', async () => {
    const requestId = await acceptedRequest();
    assert.equal((await fileRefund(requestId, CUSTOMER_ID, 'customer')).status, 404);
  });

  it('409s when the payment is not paid yet', async () => {
    const requestId = await acceptedRequest();
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${requestId}/payment`, {
      amountCents: QUOTE_CENTS,
    });
    assert.equal((await fileRefund(requestId, CUSTOMER_ID, 'customer')).status, 409);
  });

  it('409s on a duplicate request for the same payment', async () => {
    const requestId = await paidRequest();
    assert.equal((await fileRefund(requestId, CUSTOMER_ID, 'customer')).status, 201);
    assert.equal((await fileRefund(requestId, CUSTOMER_ID, 'customer')).status, 409);
  });

  it('409s when the payment has already been refunded', async () => {
    const requestId = await paidRequest();
    assert.equal(
      (await api(ADMIN_ID, 'admin', 'POST', `/service-requests/${requestId}/payment/refund`))
        .status,
      200,
    );
    assert.equal((await fileRefund(requestId, CUSTOMER_ID, 'customer')).status, 409);
  });

  it('rejects an empty reason (422)', async () => {
    const requestId = await paidRequest();
    assert.equal(
      (await fileRefund(requestId, CUSTOMER_ID, 'customer', { reason: '   ' })).status,
      422,
    );
  });

  it('lets the owner and an admin view the request, but not the worker', async () => {
    const requestId = await paidRequest();
    await fileRefund(requestId, CUSTOMER_ID, 'customer');

    const owner = await api(
      CUSTOMER_ID,
      'customer',
      'GET',
      `/service-requests/${requestId}/refund-request`,
    );
    assert.equal(owner.status, 200);
    assert.equal((await owner.json()).status, 'open');

    assert.equal(
      (await api(ADMIN_ID, 'admin', 'GET', `/service-requests/${requestId}/refund-request`)).status,
      200,
    );
    assert.equal(
      (await api(WORKER_ID, 'worker', 'GET', `/service-requests/${requestId}/refund-request`))
        .status,
      403,
    );
  });

  it('404s viewing a refund request that does not exist', async () => {
    const requestId = await paidRequest();
    assert.equal(
      (await api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${requestId}/refund-request`))
        .status,
      404,
    );
  });
});
