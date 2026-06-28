import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetAuditEvents } from '../server/src/services/auditService.ts';
import { resetNotifications } from '../server/src/services/notificationService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const OTHER_WORKER = '523e4567-e89b-12d3-a456-426614174999';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('PATCH /service-requests/:id/release', () => {
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
    await resetAuditEvents();
    await resetNotifications();
  });

  async function createAssigned() {
    const request = await (
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
    await fetch(`${baseUrl}/service-requests/${request.id}/assignment`, {
      method: 'PATCH',
      headers: headers(ADMIN_ID, 'admin'),
      body: JSON.stringify({ workerId: WORKER_ID }),
    });
    return request;
  }

  function release(id, workerId = WORKER_ID, role = 'worker') {
    return fetch(`${baseUrl}/service-requests/${id}/release`, {
      method: 'PATCH',
      headers: headers(workerId, role),
    });
  }

  it('lets the assigned worker release a job back to the pool, and notifies the customer', async () => {
    const request = await createAssigned();
    const res = await release(request.id);
    assert.equal(res.status, 200);
    const released = await res.json();
    assert.equal(released.status, 'pending');
    assert.equal(released.workerId, undefined);

    // It shows up in the available list again.
    const available = await (
      await fetch(`${baseUrl}/service-requests/available`, {
        headers: headers(OTHER_WORKER, 'worker'),
      })
    ).json();
    assert.ok(available.items.some((item) => item.id === request.id));

    // The customer is notified.
    const notifs = await (
      await fetch(`${baseUrl}/notifications`, { headers: headers(CUSTOMER_ID, 'customer') })
    ).json();
    assert.ok(notifs.items.some((n) => n.requestId === request.id && /released/i.test(n.message)));
  });

  it('forbids a worker who is not assigned (403)', async () => {
    const request = await createAssigned();
    assert.equal((await release(request.id, OTHER_WORKER)).status, 403);
  });

  it('forbids a customer or admin (403)', async () => {
    const request = await createAssigned();
    assert.equal((await release(request.id, CUSTOMER_ID, 'customer')).status, 403);
    assert.equal((await release(request.id, ADMIN_ID, 'admin')).status, 403);
  });

  it('rejects releasing a completed job (422)', async () => {
    const request = await createAssigned();
    for (const status of ['accepted', 'in_progress', 'completed']) {
      await fetch(`${baseUrl}/service-requests/${request.id}/status`, {
        method: 'PATCH',
        headers: headers(WORKER_ID, 'worker'),
        body: JSON.stringify({ status }),
      });
    }
    assert.equal((await release(request.id)).status, 422);
  });

  it('returns 404 for an unknown request', async () => {
    assert.equal((await release('999e4567-e89b-12d3-a456-426614174000')).status, 404);
  });

  it('returns 401 without authentication', async () => {
    const request = await createAssigned();
    const res = await fetch(`${baseUrl}/service-requests/${request.id}/release`, {
      method: 'PATCH',
    });
    assert.equal(res.status, 401);
  });
});
