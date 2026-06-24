import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_ID = '223e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role = 'customer') {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('GET /service-requests (list)', () => {
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
  });

  async function createFor(customerId) {
    const res = await globalThis.fetch(`${baseUrl}/service-requests`, {
      method: 'POST',
      headers: headers(customerId, 'customer'),
      body: JSON.stringify({
        customerId,
        category: 'plumbing',
        description: 'Leaking kitchen sink',
        location: { latitude: 25.03, longitude: 121.56 },
      }),
    });
    return res.json();
  }

  async function assignWorkerTo(requestId, workerId) {
    const res = await globalThis.fetch(`${baseUrl}/service-requests/${requestId}/assignment`, {
      method: 'PATCH',
      headers: headers(ADMIN_ID, 'admin'),
      body: JSON.stringify({ workerId }),
    });
    assert.equal(res.status, 200);
  }

  it('returns only the calling customer own requests (200)', async () => {
    await createFor(CUSTOMER_ID);
    await createFor(CUSTOMER_ID);
    await createFor(OTHER_ID);

    const res = await globalThis.fetch(`${baseUrl}/service-requests`, {
      headers: headers(CUSTOMER_ID),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.total, 2);
    assert.equal(body.items.length, 2);
    assert.ok(body.items.every((item) => item.customerId === CUSTOMER_ID));
  });

  it('lets an admin list all requests (200)', async () => {
    await createFor(CUSTOMER_ID);
    await createFor(OTHER_ID);

    const res = await globalThis.fetch(`${baseUrl}/service-requests`, {
      headers: headers(ADMIN_ID, 'admin'),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.total, 2);
  });

  it('paginates with limit and offset', async () => {
    await createFor(CUSTOMER_ID);
    await createFor(CUSTOMER_ID);
    await createFor(CUSTOMER_ID);

    const res = await globalThis.fetch(`${baseUrl}/service-requests?limit=1&offset=1`, {
      headers: headers(CUSTOMER_ID),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.total, 3);
    assert.equal(body.items.length, 1);
    assert.equal(body.limit, 1);
    assert.equal(body.offset, 1);
  });

  it('lets a worker list only the requests assigned to them (200)', async () => {
    const assigned = await createFor(CUSTOMER_ID);
    await createFor(CUSTOMER_ID);
    await assignWorkerTo(assigned.id, WORKER_ID);

    const res = await globalThis.fetch(`${baseUrl}/service-requests`, {
      headers: headers(WORKER_ID, 'worker'),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.total, 1);
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].id, assigned.id);
    assert.equal(body.items[0].workerId, WORKER_ID);
  });

  it('filters the list by status', async () => {
    const a = await createFor(CUSTOMER_ID);
    await createFor(CUSTOMER_ID);
    await globalThis.fetch(`${baseUrl}/service-requests/${a.id}/status`, {
      method: 'PATCH',
      headers: headers(CUSTOMER_ID, 'customer'),
      body: JSON.stringify({ status: 'cancelled' }),
    });

    const pending = await globalThis.fetch(`${baseUrl}/service-requests?status=pending`, {
      headers: headers(CUSTOMER_ID),
    });
    const pendingBody = await pending.json();
    assert.equal(pendingBody.total, 1);
    assert.ok(pendingBody.items.every((item) => item.status === 'pending'));

    const cancelled = await globalThis.fetch(`${baseUrl}/service-requests?status=cancelled`, {
      headers: headers(CUSTOMER_ID),
    });
    const cancelledBody = await cancelled.json();
    assert.equal(cancelledBody.total, 1);
    assert.equal(cancelledBody.items[0].id, a.id);
  });

  it('rejects an invalid status filter (422)', async () => {
    const res = await globalThis.fetch(`${baseUrl}/service-requests?status=bogus`, {
      headers: headers(CUSTOMER_ID),
    });
    assert.equal(res.status, 422);
  });

  it('returns 401 without authentication', async () => {
    const res = await globalThis.fetch(`${baseUrl}/service-requests`);
    assert.equal(res.status, 401);
  });

  it('rejects an invalid limit (422)', async () => {
    const res = await globalThis.fetch(`${baseUrl}/service-requests?limit=0`, {
      headers: headers(CUSTOMER_ID),
    });
    assert.equal(res.status, 422);
  });
});
