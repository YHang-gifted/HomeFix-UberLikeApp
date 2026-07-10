import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetPayouts } from '../server/src/services/payoutService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const AMOUNT = 150000;
const WORKER_NET = AMOUNT - 22500; // 15% platform fee floored.

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('GET /payouts/summary (worker earnings)', () => {
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

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** Drive a fresh request to a paid payment (which schedules a pending payout). */
  async function driveToPaid() {
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
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${request.id}/payment`, {
      amountCents: AMOUNT,
    });
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${request.id}/payment/pay`);
  }

  function summary(id = WORKER_ID, role = 'worker') {
    return api(id, role, 'GET', '/payouts/summary');
  }

  it('summarises pending vs paid earnings for the worker', async () => {
    await driveToPaid();
    await driveToPaid(); // two paid payments → two pending payouts

    // Settle one payout via the (mock, unsigned) provider webhook.
    const payouts = await (await api(WORKER_ID, 'worker', 'GET', '/payouts')).json();
    await fetch(`${baseUrl}/webhooks/payouts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'payout.paid', payoutId: payouts.items[0].id }),
    });

    const res = await summary();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.paidCount, 1);
    assert.equal(body.paidAmountCents, WORKER_NET);
    assert.equal(body.pendingCount, 1);
    assert.equal(body.pendingAmountCents, WORKER_NET);
  });

  it('returns zeros for a worker with no payouts', async () => {
    const body = await (await summary()).json();
    assert.deepEqual(body, {
      pendingCount: 0,
      pendingAmountCents: 0,
      paidCount: 0,
      paidAmountCents: 0,
    });
  });

  it('forbids a non-worker (403)', async () => {
    assert.equal((await summary(CUSTOMER_ID, 'customer')).status, 403);
  });
});
