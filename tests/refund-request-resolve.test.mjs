import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetPayouts } from '../server/src/services/payoutService.ts';
import { resetRefundRequests } from '../server/src/services/refundRequestService.ts';

// Slice 200: an admin resolves an open refund request. Approve reuses the existing refund line
// (the payment ends up `refunded`); reject needs a reason and leaves the payment `paid`. Either
// way the customer is notified and the resolution is audited. Payments settle via the mock provider.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const QUOTE_CENTS = 150000;

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('admin resolves refund requests', () => {
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

  /** A paid request with an open refund request; returns { requestId, refundRequestId }. */
  async function openRefundRequest() {
    const requestId = await acceptedRequest();
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${requestId}/payment`, {
      amountCents: QUOTE_CENTS,
    });
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${requestId}/payment/pay`);
    const refundRequest = await (
      await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${requestId}/refund-request`, {
        reason: 'Work was not completed',
      })
    ).json();
    return { requestId, refundRequestId: refundRequest.id };
  }

  function resolveRefund(id, actorId, role, body) {
    return api(actorId, role, 'POST', `/admin/refund-requests/${id}/resolve`, body);
  }

  function paymentStatus(requestId) {
    return api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${requestId}/payment`)
      .then((res) => res.json())
      .then((p) => p.status);
  }

  it('approves a request: refunds the payment, marks it approved, notifies the customer', async () => {
    const { requestId, refundRequestId } = await openRefundRequest();

    const res = await resolveRefund(refundRequestId, ADMIN_ID, 'admin', { decision: 'approve' });
    assert.equal(res.status, 200);
    const resolved = await res.json();
    assert.equal(resolved.status, 'approved');
    assert.equal(resolved.resolvedBy, ADMIN_ID);
    assert.ok(resolved.resolvedAt);

    // The existing refund line ran → the payment is now refunded.
    assert.equal(await paymentStatus(requestId), 'refunded');

    // The customer was notified.
    const { items } = await (await api(CUSTOMER_ID, 'customer', 'GET', '/notifications')).json();
    assert.ok(items.some((n) => /refund/i.test(n.message)));
  });

  it('rejects a request with a reason and leaves the payment paid', async () => {
    const { requestId, refundRequestId } = await openRefundRequest();

    const res = await resolveRefund(refundRequestId, ADMIN_ID, 'admin', {
      decision: 'reject',
      note: 'The work was completed as agreed.',
    });
    assert.equal(res.status, 200);
    const resolved = await res.json();
    assert.equal(resolved.status, 'rejected');
    assert.equal(resolved.resolutionNote, 'The work was completed as agreed.');
    assert.equal(await paymentStatus(requestId), 'paid');
  });

  it('requires a reason to reject (422)', async () => {
    const { refundRequestId } = await openRefundRequest();
    assert.equal(
      (await resolveRefund(refundRequestId, ADMIN_ID, 'admin', { decision: 'reject' })).status,
      422,
    );
  });

  it('forbids a non-admin from resolving (403)', async () => {
    const { refundRequestId } = await openRefundRequest();
    assert.equal(
      (await resolveRefund(refundRequestId, CUSTOMER_ID, 'customer', { decision: 'approve' }))
        .status,
      403,
    );
    assert.equal(
      (await resolveRefund(refundRequestId, WORKER_ID, 'worker', { decision: 'approve' })).status,
      403,
    );
  });

  it('404s an unknown refund request', async () => {
    assert.equal(
      (await resolveRefund(CUSTOMER_ID, ADMIN_ID, 'admin', { decision: 'approve' })).status,
      404,
    );
  });

  it('409s a request that is already resolved', async () => {
    const { refundRequestId } = await openRefundRequest();
    assert.equal(
      (await resolveRefund(refundRequestId, ADMIN_ID, 'admin', { decision: 'approve' })).status,
      200,
    );
    assert.equal(
      (await resolveRefund(refundRequestId, ADMIN_ID, 'admin', { decision: 'reject', note: 'x' }))
        .status,
      409,
    );
  });

  it('lets the customer re-file after a rejection, re-opening the same request', async () => {
    const { requestId, refundRequestId } = await openRefundRequest();
    await resolveRefund(refundRequestId, ADMIN_ID, 'admin', {
      decision: 'reject',
      note: 'Not this time.',
    });

    // The appeal: a fresh reason re-opens the request (same row, resolution cleared).
    const res = await api(
      CUSTOMER_ID,
      'customer',
      'POST',
      `/service-requests/${requestId}/refund-request`,
      {
        reason: 'New evidence: the leak came back.',
      },
    );
    assert.equal(res.status, 201);
    const reopened = await res.json();
    assert.equal(reopened.id, refundRequestId);
    assert.equal(reopened.status, 'open');
    assert.equal(reopened.reason, 'New evidence: the leak came back.');
    assert.equal(reopened.resolutionNote, undefined);
    assert.equal(reopened.resolvedAt, undefined);

    // The admin can resolve the re-opened request again.
    assert.equal(
      (await resolveRefund(reopened.id, ADMIN_ID, 'admin', { decision: 'approve' })).status,
      200,
    );
  });

  it('lists the queue for an admin and filters by status, but forbids non-admins', async () => {
    const { refundRequestId } = await openRefundRequest();

    const all = await (await api(ADMIN_ID, 'admin', 'GET', '/admin/refund-requests')).json();
    assert.ok(all.items.some((r) => r.id === refundRequestId));

    const open = await (
      await api(ADMIN_ID, 'admin', 'GET', '/admin/refund-requests?status=open')
    ).json();
    assert.ok(open.items.every((r) => r.status === 'open'));
    assert.ok(open.items.some((r) => r.id === refundRequestId));

    await resolveRefund(refundRequestId, ADMIN_ID, 'admin', { decision: 'approve' });
    const approved = await (
      await api(ADMIN_ID, 'admin', 'GET', '/admin/refund-requests?status=approved')
    ).json();
    assert.ok(approved.items.some((r) => r.id === refundRequestId));

    assert.equal((await api(CUSTOMER_ID, 'customer', 'GET', '/admin/refund-requests')).status, 403);
  });
});
