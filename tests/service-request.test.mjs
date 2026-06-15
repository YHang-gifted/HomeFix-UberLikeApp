import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_ID = '223e4567-e89b-12d3-a456-426614174000';

function validBody(customerId = CUSTOMER_ID) {
  return {
    customerId,
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    location: { latitude: 25.03, longitude: 121.56 },
  };
}

function authHeaders(id = CUSTOMER_ID, role = 'customer') {
  return {
    'content-type': 'application/json',
    'x-user-id': id,
    'x-user-role': role,
  };
}

describe('POST /service-requests', () => {
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

  it('creates a request for the authenticated customer (201)', async () => {
    const res = await globalThis.fetch(`${baseUrl}/service-requests`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(validBody()),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.status, 'pending');
    assert.equal(body.customerId, CUSTOMER_ID);
    assert.ok(body.id);
  });

  it('rejects an unauthenticated request (401)', async () => {
    const res = await globalThis.fetch(`${baseUrl}/service-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody()),
    });
    assert.equal(res.status, 401);
  });

  it('forbids creating a request for another customer (403)', async () => {
    const res = await globalThis.fetch(`${baseUrl}/service-requests`, {
      method: 'POST',
      headers: authHeaders(OTHER_ID, 'customer'),
      body: JSON.stringify(validBody(CUSTOMER_ID)),
    });
    assert.equal(res.status, 403);
  });

  it('rejects an invalid payload (422)', async () => {
    const res = await globalThis.fetch(`${baseUrl}/service-requests`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ customerId: CUSTOMER_ID, category: 'nope' }),
    });
    assert.equal(res.status, 422);
  });
});
