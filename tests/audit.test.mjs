import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetAuditEvents } from '../server/src/services/auditService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('audit log', () => {
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

  async function createRequest() {
    const res = await fetch(`${baseUrl}/service-requests`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
      body: JSON.stringify({
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'Leaking kitchen sink',
        location: { latitude: 25.03, longitude: 121.56 },
      }),
    });
    return res.json();
  }

  async function audit() {
    const res = await fetch(`${baseUrl}/audit`, { headers: headers(ADMIN_ID, 'admin') });
    assert.equal(res.status, 200);
    return res.json();
  }

  it('records a created event with the actor and resource', async () => {
    const request = await createRequest();
    const page = await audit();
    const created = page.items.find((e) => e.action === 'service_request.created');
    assert.ok(created);
    assert.equal(created.actorId, CUSTOMER_ID);
    assert.equal(created.actorRole, 'customer');
    assert.equal(created.resourceId, request.id);
  });

  it('records assignment and status-change events with details', async () => {
    const request = await createRequest();

    await fetch(`${baseUrl}/service-requests/${request.id}/assignment`, {
      method: 'PATCH',
      headers: headers(ADMIN_ID, 'admin'),
      body: JSON.stringify({ workerId: WORKER_ID }),
    });
    await fetch(`${baseUrl}/service-requests/${request.id}/status`, {
      method: 'PATCH',
      headers: headers(WORKER_ID, 'worker'),
      body: JSON.stringify({ status: 'accepted' }),
    });

    const page = await audit();
    const assigned = page.items.find((e) => e.action === 'service_request.assigned');
    assert.ok(assigned);
    assert.equal(assigned.actorRole, 'admin');
    assert.equal(assigned.details.workerId, WORKER_ID);
    assert.equal(assigned.details.workerName, 'Demo Worker');

    const changed = page.items.find((e) => e.action === 'service_request.status_changed');
    assert.ok(changed);
    assert.equal(changed.actorRole, 'worker');
    assert.equal(changed.details.from, 'matched');
    assert.equal(changed.details.to, 'accepted');
  });

  it('forbids a non-admin from reading the audit log (403)', async () => {
    const res = await fetch(`${baseUrl}/audit`, { headers: headers(CUSTOMER_ID, 'customer') });
    assert.equal(res.status, 403);
  });

  it('returns 401 without authentication', async () => {
    const res = await fetch(`${baseUrl}/audit`);
    assert.equal(res.status, 401);
  });
});
