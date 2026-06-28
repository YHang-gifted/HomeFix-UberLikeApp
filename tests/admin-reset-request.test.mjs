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

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('PATCH /service-requests/:id/reset', () => {
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

  function reset(id, actorId = ADMIN_ID, role = 'admin') {
    return fetch(`${baseUrl}/service-requests/${id}/reset`, {
      method: 'PATCH',
      headers: headers(actorId, role),
    });
  }

  it('lets an admin reset an assigned job and notifies customer + worker', async () => {
    const request = await createAssigned();
    const res = await reset(request.id);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'pending');
    assert.equal(body.workerId, undefined);

    const available = await (
      await fetch(`${baseUrl}/service-requests/available`, {
        headers: headers(WORKER_ID, 'worker'),
      })
    ).json();
    assert.ok(available.items.some((item) => item.id === request.id));

    const workerNotifs = await (
      await fetch(`${baseUrl}/notifications`, { headers: headers(WORKER_ID, 'worker') })
    ).json();
    assert.ok(
      workerNotifs.items.some((n) => n.requestId === request.id && /reassign/i.test(n.message)),
    );

    const customerNotifs = await (
      await fetch(`${baseUrl}/notifications`, { headers: headers(CUSTOMER_ID, 'customer') })
    ).json();
    assert.ok(customerNotifs.items.some((n) => n.requestId === request.id));
  });

  it('forbids a non-admin (403)', async () => {
    const request = await createAssigned();
    assert.equal((await reset(request.id, WORKER_ID, 'worker')).status, 403);
    assert.equal((await reset(request.id, CUSTOMER_ID, 'customer')).status, 403);
  });

  it('rejects resetting a pending (unassigned) request (422)', async () => {
    const created = await (
      await fetch(`${baseUrl}/service-requests`, {
        method: 'POST',
        headers: headers(CUSTOMER_ID, 'customer'),
        body: JSON.stringify({
          customerId: CUSTOMER_ID,
          category: 'plumbing',
          description: 'Still pending',
          location: { latitude: 25.03, longitude: 121.56 },
        }),
      })
    ).json();
    assert.equal((await reset(created.id)).status, 422);
  });

  it('returns 404 for an unknown request', async () => {
    assert.equal((await reset('999e4567-e89b-12d3-a456-426614174000')).status, 404);
  });

  it('returns 401 without authentication', async () => {
    const request = await createAssigned();
    const res = await fetch(`${baseUrl}/service-requests/${request.id}/reset`, { method: 'PATCH' });
    assert.equal(res.status, 401);
  });
});
