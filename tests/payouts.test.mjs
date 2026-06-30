import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetPayouts } from '../server/src/services/payoutService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('Payouts', () => {
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

  async function paidPayment() {
    const request = await (
      await fetch(`${baseUrl}/service-requests`, {
        method: 'POST',
        headers: headers(CUSTOMER_ID, 'customer'),
        body: JSON.stringify({
          customerId: CUSTOMER_ID,
          category: 'plumbing',
          description: 'Leaking sink',
          location: { latitude: 25.03, longitude: 121.56 },
        }),
      })
    ).json();
    await fetch(`${baseUrl}/service-requests/${request.id}/assignment`, {
      method: 'PATCH',
      headers: headers(ADMIN_ID, 'admin'),
      body: JSON.stringify({ workerId: WORKER_ID }),
    });
    await fetch(`${baseUrl}/service-requests/${request.id}/quote`, {
      method: 'POST',
      headers: headers(WORKER_ID, 'worker'),
      body: JSON.stringify({ amountCents: 150000 }),
    });
    await fetch(`${baseUrl}/service-requests/${request.id}/quote/accept`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    await fetch(`${baseUrl}/service-requests/${request.id}/payment`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
      body: JSON.stringify({ amountCents: 150000 }),
    });
    await fetch(`${baseUrl}/service-requests/${request.id}/payment/pay`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    return request.id;
  }

  function listPayouts(id = WORKER_ID, role = 'worker') {
    return fetch(`${baseUrl}/payouts`, { headers: headers(id, role) });
  }

  function payoutWebhook(body) {
    return fetch(`${baseUrl}/webhooks/payouts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('creates a pending payout of the worker net when a payment is paid', async () => {
    await paidPayment();

    const res = await listPayouts();
    assert.equal(res.status, 200);
    const { items } = await res.json();
    assert.equal(items.length, 1);
    assert.equal(items[0].status, 'pending');
    assert.equal(items[0].workerId, WORKER_ID);
    // 150000 gross − 15% (22500) = 127500 net.
    assert.equal(items[0].amountCents, 127500);
  });

  it('settles a payout from a webhook, idempotently', async () => {
    await paidPayment();
    const payoutId = (await (await listPayouts()).json()).items[0].id;

    assert.equal((await payoutWebhook({ type: 'payout.paid', payoutId })).status, 200);
    assert.equal((await (await listPayouts()).json()).items[0].status, 'paid');

    assert.equal((await payoutWebhook({ type: 'payout.paid', payoutId })).status, 200);
    assert.equal((await (await listPayouts()).json()).items[0].status, 'paid');
  });

  it('forbids a non-worker from listing payouts (403)', async () => {
    assert.equal((await listPayouts(CUSTOMER_ID, 'customer')).status, 403);
  });

  it('returns 404 for an unknown payout and 422 for an invalid payload', async () => {
    assert.equal(
      (
        await payoutWebhook({
          type: 'payout.paid',
          payoutId: '999e4567-e89b-12d3-a456-426614174000',
        })
      ).status,
      404,
    );
    assert.equal((await payoutWebhook({ type: 'payout.paid' })).status, 422);
  });
});
