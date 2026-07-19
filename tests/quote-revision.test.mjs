import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { getCatalogItem } from '../server/src/services/catalogService.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetPayouts } from '../server/src/services/payoutService.ts';

// On-site scope change (`docs/pricing-model.md` §5): the assigned worker finds extra work and
// proposes a revised total, which the customer agrees to through the ordinary accept endpoint.
// Modelled as a revision of the SAME quote, so payment/payout/refund are unchanged. This is how a
// fixed-price catalog job absorbs a bigger job than the photos showed.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const DRAIN = getCatalogItem('drain-unclog');
const REVISED_CENTS = 20000;
const REASON = 'The pipe was corroded and had to be replaced';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('on-site scope change (quote revision)', () => {
  let server;
  let baseUrl;

  before(async () => {
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

  /** A fixed-price catalog job, assigned and under way (so it can be revised). */
  async function underWayFixedJob() {
    const request = await (
      await api(CUSTOMER_ID, 'customer', 'POST', '/service-requests', {
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'The kitchen sink is blocked',
        location: { latitude: 25.03, longitude: 121.56 },
        catalogItemId: 'drain-unclog',
      })
    ).json();
    await api(ADMIN_ID, 'admin', 'PATCH', `/service-requests/${request.id}/assignment`, {
      workerId: WORKER_ID,
    });
    await api(WORKER_ID, 'worker', 'PATCH', `/service-requests/${request.id}/status`, {
      status: 'accepted',
    });
    return request.id;
  }

  function revise(requestId, actorId, role, body = { amountCents: REVISED_CENTS, reason: REASON }) {
    return api(actorId, role, 'POST', `/service-requests/${requestId}/quote/revise`, body);
  }

  function createPayment(requestId, amountCents) {
    return api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${requestId}/payment`, {
      amountCents,
    });
  }

  it('revises the price; the customer accepts and pays the new amount', async () => {
    const requestId = await underWayFixedJob();

    const res = await revise(requestId, WORKER_ID, 'worker');
    assert.equal(res.status, 200);
    const revised = await res.json();
    assert.equal(revised.status, 'pending'); // awaiting the customer again
    assert.equal(revised.amountCents, REVISED_CENTS);
    assert.equal(revised.note, REASON);

    const accepted = await api(
      CUSTOMER_ID,
      'customer',
      'POST',
      `/service-requests/${requestId}/quote/accept`,
    );
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).amountCents, REVISED_CENTS);

    // The old catalog price no longer matches the agreed quote; the revised one does.
    assert.equal((await createPayment(requestId, DRAIN.priceCents)).status, 422);
    assert.equal((await createPayment(requestId, REVISED_CENTS)).status, 201);

    const paid = await api(
      CUSTOMER_ID,
      'customer',
      'POST',
      `/service-requests/${requestId}/payment/pay`,
    );
    assert.equal(paid.status, 200);
    assert.equal((await paid.json()).status, 'paid');
  });

  it('voids a pending payment that was set up at the old price', async () => {
    const requestId = await underWayFixedJob();
    assert.equal((await createPayment(requestId, DRAIN.priceCents)).status, 201);

    assert.equal((await revise(requestId, WORKER_ID, 'worker')).status, 200);

    const payment = await api(
      CUSTOMER_ID,
      'customer',
      'GET',
      `/service-requests/${requestId}/payment`,
    );
    assert.equal(payment.status, 404);
  });

  it('forbids anyone but the assigned worker (403)', async () => {
    const requestId = await underWayFixedJob();
    assert.equal((await revise(requestId, CUSTOMER_ID, 'customer')).status, 403);
  });

  it('409s before the job is under way', async () => {
    const request = await (
      await api(CUSTOMER_ID, 'customer', 'POST', '/service-requests', {
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'The kitchen sink is blocked',
        location: { latitude: 25.03, longitude: 121.56 },
        catalogItemId: 'drain-unclog',
      })
    ).json();
    await api(ADMIN_ID, 'admin', 'PATCH', `/service-requests/${request.id}/assignment`, {
      workerId: WORKER_ID,
    });
    // Assigned (matched) but not started — nothing has been found on site yet.
    assert.equal((await revise(request.id, WORKER_ID, 'worker')).status, 409);
  });

  it('409s once the job has been paid', async () => {
    const requestId = await underWayFixedJob();
    await createPayment(requestId, DRAIN.priceCents);
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${requestId}/payment/pay`);

    assert.equal((await revise(requestId, WORKER_ID, 'worker')).status, 409);
  });

  it('rejects a revision with no reason (422)', async () => {
    const requestId = await underWayFixedJob();
    const res = await revise(requestId, WORKER_ID, 'worker', {
      amountCents: REVISED_CENTS,
      reason: '   ',
    });
    assert.equal(res.status, 422);
  });
});
