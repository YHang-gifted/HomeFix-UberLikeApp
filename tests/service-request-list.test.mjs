import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_ID = '223e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role = 'customer') {
  return { 'content-type': 'application/json', 'x-user-id': id, 'x-user-role': role };
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

  beforeEach(() => {
    resetServiceRequests();
  });

  async function createFor(customerId) {
    await globalThis.fetch(`${baseUrl}/service-requests`, {
      method: 'POST',
      headers: headers(customerId, 'customer'),
      body: JSON.stringify({
        customerId,
        category: 'plumbing',
        description: 'Leaking kitchen sink',
        location: { latitude: 25.03, longitude: 121.56 },
      }),
    });
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

  it('forbids a worker (403)', async () => {
    const res = await globalThis.fetch(`${baseUrl}/service-requests`, {
      headers: headers(WORKER_ID, 'worker'),
    });
    assert.equal(res.status, 403);
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
