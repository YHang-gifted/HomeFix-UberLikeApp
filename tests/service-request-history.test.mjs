import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetAuditEvents } from '../server/src/services/auditService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_CUSTOMER_ID = '223e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('GET /service-requests/:id/history', () => {
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
  });

  async function createAssignAndAdvance() {
    const created = await (
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
    await fetch(`${baseUrl}/service-requests/${created.id}/assignment`, {
      method: 'PATCH',
      headers: headers(ADMIN_ID, 'admin'),
      body: JSON.stringify({ workerId: WORKER_ID }),
    });
    await fetch(`${baseUrl}/service-requests/${created.id}/status`, {
      method: 'PATCH',
      headers: headers(WORKER_ID, 'worker'),
      body: JSON.stringify({ status: 'accepted' }),
    });
    return created;
  }

  it('returns the created/assigned/status-changed history to the owning customer, oldest first', async () => {
    const created = await createAssignAndAdvance();
    const res = await fetch(`${baseUrl}/service-requests/${created.id}/history`, {
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(
      body.map((event) => event.action),
      ['service_request.created', 'service_request.assigned', 'service_request.status_changed'],
    );
    assert.ok(body.every((event) => event.resourceId === created.id));
    assert.deepEqual(body[2].details, { from: 'matched', to: 'accepted' });
  });

  it('is visible to the assigned worker and to an admin', async () => {
    const created = await createAssignAndAdvance();
    const asWorker = await fetch(`${baseUrl}/service-requests/${created.id}/history`, {
      headers: headers(WORKER_ID, 'worker'),
    });
    assert.equal(asWorker.status, 200);
    assert.equal((await asWorker.json()).length, 3);

    const asAdmin = await fetch(`${baseUrl}/service-requests/${created.id}/history`, {
      headers: headers(ADMIN_ID, 'admin'),
    });
    assert.equal(asAdmin.status, 200);
  });

  it('forbids a non-party (403)', async () => {
    const created = await createAssignAndAdvance();
    const res = await fetch(`${baseUrl}/service-requests/${created.id}/history`, {
      headers: headers(OTHER_CUSTOMER_ID, 'customer'),
    });
    assert.equal(res.status, 403);
  });

  it('returns 404 for an unknown request', async () => {
    const res = await fetch(
      `${baseUrl}/service-requests/999e4567-e89b-12d3-a456-426614174000/history`,
      {
        headers: headers(ADMIN_ID, 'admin'),
      },
    );
    assert.equal(res.status, 404);
  });

  it('returns 401 without authentication', async () => {
    const created = await createAssignAndAdvance();
    const res = await fetch(`${baseUrl}/service-requests/${created.id}/history`);
    assert.equal(res.status, 401);
  });

  it('records a cancellation reason in the status-change history', async () => {
    const created = await (
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
    await fetch(`${baseUrl}/service-requests/${created.id}/status`, {
      method: 'PATCH',
      headers: headers(CUSTOMER_ID, 'customer'),
      body: JSON.stringify({ status: 'cancelled', reason: 'Booked someone else' }),
    });

    const body = await (
      await fetch(`${baseUrl}/service-requests/${created.id}/history`, {
        headers: headers(CUSTOMER_ID, 'customer'),
      })
    ).json();
    const cancel = body.find((event) => event.details?.to === 'cancelled');
    assert.equal(cancel.details.reason, 'Booked someone else');
  });
});
