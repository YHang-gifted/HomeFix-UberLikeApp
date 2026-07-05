import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import { resetPayouts } from '../server/src/services/payoutService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('GET /admin/stats', () => {
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
    await resetPayouts();
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

  async function payFor(id, amountCents) {
    await fetch(`${baseUrl}/service-requests/${id}/quote`, {
      method: 'POST',
      headers: headers(WORKER_ID, 'worker'),
      body: JSON.stringify({ amountCents }),
    });
    await fetch(`${baseUrl}/service-requests/${id}/quote/accept`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    await fetch(`${baseUrl}/service-requests/${id}/payment`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
      body: JSON.stringify({ amountCents }),
    });
    await fetch(`${baseUrl}/service-requests/${id}/payment/pay`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
  }

  it('returns aggregate stats to an admin', async () => {
    await createRequest();
    const paidRequest = await createRequest();
    await assign(paidRequest.id);
    await payFor(paidRequest.id, 150000);

    const res = await fetch(`${baseUrl}/admin/stats`, { headers: headers(ADMIN_ID, 'admin') });
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.totalRequests, 2);
    assert.equal(body.requestsByStatus.pending, 1);
    assert.equal(body.requestsByStatus.matched, 1);
    assert.equal(body.workerCount, 1);
    assert.equal(body.paidPaymentsCount, 1);
    assert.equal(body.paidAmountCents, 150000);
    // Paying schedules a pending payout of the worker net (150000 - 15% = 127500).
    assert.equal(body.pendingPayoutsCount, 1);
    assert.equal(body.pendingPayoutAmountCents, 127500);
    assert.equal(body.paidPayoutsCount, 0);
    assert.equal(body.paidPayoutAmountCents, 0);
  });

  it('forbids a non-admin (403)', async () => {
    const res = await fetch(`${baseUrl}/admin/stats`, {
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    assert.equal(res.status, 403);
  });

  it('returns 401 without authentication', async () => {
    const res = await fetch(`${baseUrl}/admin/stats`);
    assert.equal(res.status, 401);
  });
});
