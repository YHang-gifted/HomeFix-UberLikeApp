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

describe('PATCH /service-requests/:id/status', () => {
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

  function patch(id, status, hdrs) {
    return globalThis.fetch(`${baseUrl}/service-requests/${id}/status`, {
      method: 'PATCH',
      headers: hdrs,
      body: JSON.stringify({ status }),
    });
  }

  it('lets the owner cancel a pending request (200)', async () => {
    const id = await createRequest();
    const res = await patch(id, 'cancelled', headers(CUSTOMER_ID));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'cancelled');
  });

  it('lets an admin advance pending to matched (200)', async () => {
    const id = await createRequest();
    const res = await patch(id, 'matched', headers(ADMIN_ID, 'admin'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'matched');
  });

  it('forbids a non-owner customer (403)', async () => {
    const id = await createRequest();
    const res = await patch(id, 'cancelled', headers(OTHER_ID, 'customer'));
    assert.equal(res.status, 403);
  });

  it('forbids a worker (403, no assignment yet)', async () => {
    const id = await createRequest();
    const res = await patch(id, 'matched', headers(WORKER_ID, 'worker'));
    assert.equal(res.status, 403);
  });

  it('rejects an invalid transition by admin (422)', async () => {
    const id = await createRequest();
    const res = await patch(id, 'completed', headers(ADMIN_ID, 'admin'));
    assert.equal(res.status, 422);
  });

  it('forbids the owner advancing beyond cancel (422)', async () => {
    const id = await createRequest();
    const res = await patch(id, 'matched', headers(CUSTOMER_ID));
    assert.equal(res.status, 422);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await patch(OTHER_ID, 'cancelled', headers(CUSTOMER_ID));
    assert.equal(res.status, 404);
  });

  it('returns 401 without authentication', async () => {
    const id = await createRequest();
    const res = await patch(id, 'cancelled', { 'content-type': 'application/json' });
    assert.equal(res.status, 401);
  });

  it('rejects an invalid status value (422)', async () => {
    const id = await createRequest();
    const res = await patch(id, 'banana', headers(CUSTOMER_ID));
    assert.equal(res.status, 422);
  });
});
