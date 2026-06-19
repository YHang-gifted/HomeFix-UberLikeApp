import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const OTHER_WORKER_ID = '523e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('Worker assignment and worker-driven transitions', () => {
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

  function assign(id, workerId, hdrs) {
    return globalThis.fetch(`${baseUrl}/service-requests/${id}/assignment`, {
      method: 'PATCH',
      headers: hdrs,
      body: JSON.stringify({ workerId }),
    });
  }

  function setStatus(id, status, hdrs) {
    return globalThis.fetch(`${baseUrl}/service-requests/${id}/status`, {
      method: 'PATCH',
      headers: hdrs,
      body: JSON.stringify({ status }),
    });
  }

  it('lets an admin assign a worker to a pending request (200, matched)', async () => {
    const id = await createRequest();
    const res = await assign(id, WORKER_ID, headers(ADMIN_ID, 'admin'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'matched');
    assert.equal(body.workerId, WORKER_ID);
  });

  it('forbids a non-admin from assigning (403)', async () => {
    const id = await createRequest();
    const res = await assign(id, WORKER_ID, headers(CUSTOMER_ID, 'customer'));
    assert.equal(res.status, 403);
  });

  it('rejects assigning a non-pending request (422)', async () => {
    const id = await createRequest();
    await assign(id, WORKER_ID, headers(ADMIN_ID, 'admin'));
    const res = await assign(id, OTHER_WORKER_ID, headers(ADMIN_ID, 'admin'));
    assert.equal(res.status, 422);
  });

  it('returns 404 when assigning an unknown request', async () => {
    const res = await assign(CUSTOMER_ID, WORKER_ID, headers(ADMIN_ID, 'admin'));
    assert.equal(res.status, 404);
  });

  it('rejects an invalid workerId (422)', async () => {
    const id = await createRequest();
    const res = await assign(id, 'not-a-uuid', headers(ADMIN_ID, 'admin'));
    assert.equal(res.status, 422);
  });

  it('lets the assigned worker advance matched -> accepted -> in_progress -> completed', async () => {
    const id = await createRequest();
    await assign(id, WORKER_ID, headers(ADMIN_ID, 'admin'));
    const w = headers(WORKER_ID, 'worker');

    assert.equal((await setStatus(id, 'accepted', w)).status, 200);
    assert.equal((await setStatus(id, 'in_progress', w)).status, 200);
    const done = await setStatus(id, 'completed', w);
    assert.equal(done.status, 200);
    assert.equal((await done.json()).status, 'completed');
  });

  it('forbids an unassigned worker from advancing (403)', async () => {
    const id = await createRequest();
    await assign(id, WORKER_ID, headers(ADMIN_ID, 'admin'));
    const res = await setStatus(id, 'accepted', headers(OTHER_WORKER_ID, 'worker'));
    assert.equal(res.status, 403);
  });

  it('forbids the assigned worker from cancelling (422)', async () => {
    const id = await createRequest();
    await assign(id, WORKER_ID, headers(ADMIN_ID, 'admin'));
    const res = await setStatus(id, 'cancelled', headers(WORKER_ID, 'worker'));
    assert.equal(res.status, 422);
  });
});
