import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_ID = '223e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';

function headers(id, role = 'customer') {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('GET /service-requests/:id', () => {
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

  async function createRequest() {
    const res = await globalThis.fetch(`${baseUrl}/service-requests`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
      body: JSON.stringify({
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'Leaking kitchen sink',
        location: { latitude: 25.03, longitude: 121.56 },
      }),
    });
    const body = await res.json();
    return body.id;
  }

  it('returns the request to its owner (200)', async () => {
    const id = await createRequest();
    const res = await globalThis.fetch(`${baseUrl}/service-requests/${id}`, {
      headers: headers(CUSTOMER_ID),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, id);
  });

  it('allows an admin to read any request (200)', async () => {
    const id = await createRequest();
    const res = await globalThis.fetch(`${baseUrl}/service-requests/${id}`, {
      headers: headers(ADMIN_ID, 'admin'),
    });
    assert.equal(res.status, 200);
  });

  it('forbids a different customer (403)', async () => {
    const id = await createRequest();
    const res = await globalThis.fetch(`${baseUrl}/service-requests/${id}`, {
      headers: headers(OTHER_ID, 'customer'),
    });
    assert.equal(res.status, 403);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await globalThis.fetch(`${baseUrl}/service-requests/${OTHER_ID}`, {
      headers: headers(CUSTOMER_ID),
    });
    assert.equal(res.status, 404);
  });

  it('returns 401 without authentication', async () => {
    const id = await createRequest();
    const res = await globalThis.fetch(`${baseUrl}/service-requests/${id}`);
    assert.equal(res.status, 401);
  });

  it('returns 422 for a malformed id', async () => {
    const res = await globalThis.fetch(`${baseUrl}/service-requests/not-a-uuid`, {
      headers: headers(CUSTOMER_ID),
    });
    assert.equal(res.status, 422);
  });
});
