import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { getCatalogItem } from '../server/src/services/catalogService.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetPayouts } from '../server/src/services/payoutService.ts';

// Fixed-price catalog, slice 3 — the convergence. A catalog job needs no worker quote: taking it
// mints the ACCEPTED quote at the platform price, so payment/payout/receipt/refund all work
// downstream with no branching. Payments settle via the mock provider here.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const DRAIN = getCatalogItem('drain-unclog');

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('fixed-price catalog job — end to end', () => {
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

  /** Create a request; pass a catalogItemId for the fixed-price track. */
  async function createRequest(catalogItemId) {
    const res = await api(CUSTOMER_ID, 'customer', 'POST', '/service-requests', {
      customerId: CUSTOMER_ID,
      category: 'plumbing',
      description: 'The kitchen sink is blocked',
      location: { latitude: 25.03, longitude: 121.56 },
      ...(catalogItemId !== undefined ? { catalogItemId } : {}),
    });
    return (await res.json()).id;
  }

  function assign(requestId) {
    return api(ADMIN_ID, 'admin', 'PATCH', `/service-requests/${requestId}/assignment`, {
      workerId: WORKER_ID,
    });
  }

  it('mints an accepted quote at the catalog price when a worker takes it, and is payable', async () => {
    const requestId = await createRequest('drain-unclog');
    assert.equal((await assign(requestId)).status, 200);

    // The accepted quote exists with no worker quote step.
    const quoteRes = await api(
      CUSTOMER_ID,
      'customer',
      'GET',
      `/service-requests/${requestId}/quote`,
    );
    assert.equal(quoteRes.status, 200);
    const quote = await quoteRes.json();
    assert.equal(quote.status, 'accepted');
    assert.equal(quote.amountCents, DRAIN.priceCents);
    assert.equal(quote.workerId, WORKER_ID);

    // Payment is gated on an accepted quote, so it works straight away at the catalog price.
    const created = await api(
      CUSTOMER_ID,
      'customer',
      'POST',
      `/service-requests/${requestId}/payment`,
      { amountCents: DRAIN.priceCents },
    );
    assert.equal(created.status, 201);

    const paid = await api(
      CUSTOMER_ID,
      'customer',
      'POST',
      `/service-requests/${requestId}/payment/pay`,
    );
    assert.equal(paid.status, 200);
    assert.equal((await paid.json()).status, 'paid');
  });

  it('refuses a worker quote on a fixed-price job (409)', async () => {
    const requestId = await createRequest('drain-unclog');
    await assign(requestId);

    const res = await api(WORKER_ID, 'worker', 'POST', `/service-requests/${requestId}/quote`, {
      amountCents: 999,
    });
    assert.equal(res.status, 409);
  });

  it('leaves the quote track alone (no auto-quote for a normal request)', async () => {
    const requestId = await createRequest(undefined);
    await assign(requestId);

    const res = await api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${requestId}/quote`);
    assert.equal(res.status, 404);
  });
});
