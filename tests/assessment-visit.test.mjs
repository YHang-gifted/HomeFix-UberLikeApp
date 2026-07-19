import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { getCatalogItem } from '../server/src/services/catalogService.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetPayouts } from '../server/src/services/payoutService.ts';

// Assessment visit (`docs/pricing-model.md` §6): the way in for work that can't be priced from
// photos. The catalog price is only a VISIT FEE, so the job is marked price-provisional and cannot
// be paid until the worker has assessed it and revised the price on site. The visit fee is then
// absorbed into that final total — the customer pays once, not twice.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const VISIT = getCatalogItem('assessment-visit');
const FULL_JOB_CENTS = 40000;

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('assessment visit', () => {
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

  async function bookAndStart(catalogItemId) {
    const request = await (
      await api(CUSTOMER_ID, 'customer', 'POST', '/service-requests', {
        customerId: CUSTOMER_ID,
        category: 'general',
        description: 'Something is wrong behind the wall',
        location: { latitude: 25.03, longitude: 121.56 },
        catalogItemId,
      })
    ).json();
    await api(ADMIN_ID, 'admin', 'PATCH', `/service-requests/${request.id}/assignment`, {
      workerId: WORKER_ID,
    });
    await api(WORKER_ID, 'worker', 'PATCH', `/service-requests/${request.id}/status`, {
      status: 'accepted',
    });
    return request;
  }

  function createPayment(requestId, amountCents) {
    return api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${requestId}/payment`, {
      amountCents,
    });
  }

  it('books at the visit fee but marks the price provisional', async () => {
    const request = await bookAndStart('assessment-visit');
    assert.equal(request.pricingMode, 'fixed');
    assert.equal(request.fixedPriceCents, VISIT.priceCents);
    assert.equal(request.priceProvisional, true);
  });

  it('refuses payment until the worker has priced the job on site', async () => {
    const request = await bookAndStart('assessment-visit');
    // The visit fee alone must not be payable: settling it would lock the price and block the
    // worker's revision.
    const res = await createPayment(request.id, VISIT.priceCents);
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /final price/i);
  });

  it('after the on-site revision the customer pays the full job once', async () => {
    const request = await bookAndStart('assessment-visit');

    const revised = await api(
      WORKER_ID,
      'worker',
      'POST',
      `/service-requests/${request.id}/quote/revise`,
      { amountCents: FULL_JOB_CENTS, reason: 'Replacing the cracked pipe behind the wall' },
    );
    assert.equal(revised.status, 200);

    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${request.id}/quote/accept`);

    // The price is no longer provisional, and the total is the full job — the visit fee is absorbed
    // into it rather than charged on top.
    assert.equal((await createPayment(request.id, FULL_JOB_CENTS)).status, 201);
    const paid = await api(
      CUSTOMER_ID,
      'customer',
      'POST',
      `/service-requests/${request.id}/payment/pay`,
    );
    assert.equal(paid.status, 200);
    assert.equal((await paid.json()).status, 'paid');
  });

  it('leaves an ordinary catalog job payable straight away', async () => {
    const request = await bookAndStart('drain-unclog');
    assert.equal(request.priceProvisional, undefined);
    assert.equal((await createPayment(request.id, request.fixedPriceCents)).status, 201);
  });
});
