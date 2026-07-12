import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import { resetNotifications } from '../server/src/services/notificationService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_CUSTOMER_ID = '223e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const OTHER_WORKER_ID = '523e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('request quotes', () => {
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

  async function assign(id, workerId = WORKER_ID) {
    await fetch(`${baseUrl}/service-requests/${id}/assignment`, {
      method: 'PATCH',
      headers: headers(ADMIN_ID, 'admin'),
      body: JSON.stringify({ workerId }),
    });
  }

  function propose(id, body, workerId = WORKER_ID) {
    return fetch(`${baseUrl}/service-requests/${id}/quote`, {
      method: 'POST',
      headers: headers(workerId, 'worker'),
      body: JSON.stringify(body),
    });
  }

  function respond(id, action, principalId = CUSTOMER_ID) {
    return fetch(`${baseUrl}/service-requests/${id}/quote/${action}`, {
      method: 'POST',
      headers: headers(principalId, 'customer'),
    });
  }

  it('lets the assigned worker propose a quote and notifies the customer', async () => {
    const created = await createRequest();
    await assign(created.id);
    const res = await propose(created.id, {
      amountCents: 250000,
      note: 'Includes parts and labor',
    });
    assert.equal(res.status, 201);
    const quote = await res.json();
    assert.equal(quote.amountCents, 250000);
    assert.equal(quote.currency, 'USD');
    assert.equal(quote.note, 'Includes parts and labor');
    assert.equal(quote.status, 'pending');
    assert.equal(quote.workerId, WORKER_ID);

    const notifs = await (
      await fetch(`${baseUrl}/notifications`, { headers: headers(CUSTOMER_ID, 'customer') })
    ).json();
    assert.ok(notifs.items.some((n) => n.requestId === created.id && /quote/i.test(n.message)));
  });

  it('lets the owning customer accept a quote and notifies the worker', async () => {
    const created = await createRequest();
    await assign(created.id);
    await propose(created.id, { amountCents: 250000 });
    const res = await respond(created.id, 'accept');
    assert.equal(res.status, 200);
    const quote = await res.json();
    assert.equal(quote.status, 'accepted');
    assert.equal(typeof quote.respondedAt, 'string');

    const notifs = await (
      await fetch(`${baseUrl}/notifications`, { headers: headers(WORKER_ID, 'worker') })
    ).json();
    assert.ok(notifs.items.some((n) => n.requestId === created.id && /accepted/i.test(n.message)));
  });

  it('lets the owning customer decline a quote', async () => {
    const created = await createRequest();
    await assign(created.id);
    await propose(created.id, { amountCents: 250000 });
    const res = await respond(created.id, 'decline');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'declined');
  });

  it('lets any party view the quote', async () => {
    const created = await createRequest();
    await assign(created.id);
    await propose(created.id, { amountCents: 250000 });
    const res = await fetch(`${baseUrl}/service-requests/${created.id}/quote`, {
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    assert.equal(res.status, 200);
  });

  it('forbids a worker who is not assigned from proposing (403)', async () => {
    const created = await createRequest();
    await assign(created.id);
    const res = await propose(created.id, { amountCents: 250000 }, OTHER_WORKER_ID);
    assert.equal(res.status, 403);
  });

  it('forbids proposing a quote before a worker is assigned (403)', async () => {
    const created = await createRequest();
    const res = await propose(created.id, { amountCents: 250000 });
    assert.equal(res.status, 403);
  });

  it('refuses a second quote for the same request (409)', async () => {
    const created = await createRequest();
    await assign(created.id);
    await propose(created.id, { amountCents: 250000 });
    const res = await propose(created.id, { amountCents: 300000 });
    assert.equal(res.status, 409);
  });

  it('forbids a non-owner customer from responding (403)', async () => {
    const created = await createRequest();
    await assign(created.id);
    await propose(created.id, { amountCents: 250000 });
    const res = await respond(created.id, 'accept', OTHER_CUSTOMER_ID);
    assert.equal(res.status, 403);
  });

  it('refuses to respond to a quote twice (409)', async () => {
    const created = await createRequest();
    await assign(created.id);
    await propose(created.id, { amountCents: 250000 });
    await respond(created.id, 'accept');
    const second = await respond(created.id, 'decline');
    assert.equal(second.status, 409);
  });

  it('rejects a non-positive amount (422)', async () => {
    const created = await createRequest();
    await assign(created.id);
    const res = await propose(created.id, { amountCents: 0 });
    assert.equal(res.status, 422);
  });

  it('returns 404 when there is no quote yet', async () => {
    const created = await createRequest();
    await assign(created.id);
    const res = await fetch(`${baseUrl}/service-requests/${created.id}/quote`, {
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    assert.equal(res.status, 404);
  });

  it('returns 401 without authentication', async () => {
    const created = await createRequest();
    const res = await fetch(`${baseUrl}/service-requests/${created.id}/quote`);
    assert.equal(res.status, 401);
  });
});
