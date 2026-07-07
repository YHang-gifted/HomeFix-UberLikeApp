import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetAuditEvents } from '../server/src/services/auditService.ts';
import { resetNotifications } from '../server/src/services/notificationService.ts';
import { resetCertifications } from '../server/src/services/certificationService.ts';
import { seedVerifiedCertification } from './certification-fixtures.mjs';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const OTHER_WORKER = '523e4567-e89b-12d3-a456-426614174999';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('PATCH /service-requests/:id/claim', () => {
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
    // Credential-gated matching: both workers need a verified plumbing certification
    // to claim the plumbing jobs these tests create.
    await resetCertifications();
    await seedVerifiedCertification(baseUrl, WORKER_ID, 'plumbing');
    await seedVerifiedCertification(baseUrl, OTHER_WORKER, 'plumbing');
  });

  async function createRequest() {
    return (
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
  }

  function claim(id, workerId = WORKER_ID) {
    return fetch(`${baseUrl}/service-requests/${id}/claim`, {
      method: 'PATCH',
      headers: headers(workerId, 'worker'),
    });
  }

  it('lets a worker claim a pending request: matched + workerId set', async () => {
    const created = await createRequest();
    const res = await claim(created.id);
    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.status, 'matched');
    assert.equal(updated.workerId, WORKER_ID);
  });

  it('removes the request from the available list once claimed', async () => {
    const created = await createRequest();
    await claim(created.id);
    const page = await (
      await fetch(`${baseUrl}/service-requests/available`, {
        headers: headers(WORKER_ID, 'worker'),
      })
    ).json();
    assert.equal(page.total, 0);
  });

  it('records an assignment audit event with the worker name', async () => {
    const created = await createRequest();
    await claim(created.id);
    const history = await (
      await fetch(`${baseUrl}/service-requests/${created.id}/history`, {
        headers: headers(WORKER_ID, 'worker'),
      })
    ).json();
    const assigned = history.find((e) => e.action === 'service_request.assigned');
    assert.ok(assigned);
    assert.equal(assigned.actorRole, 'worker');
    assert.equal(assigned.details.workerId, WORKER_ID);
    assert.equal(assigned.details.workerName, 'Demo Worker');
  });

  it('notifies the owning customer that a worker accepted', async () => {
    const created = await createRequest();
    await claim(created.id);
    const list = await (
      await fetch(`${baseUrl}/notifications`, { headers: headers(CUSTOMER_ID, 'customer') })
    ).json();
    assert.ok(list.items.some((n) => n.requestId === created.id && /accepted/i.test(n.message)));
  });

  it('rejects claiming a request that is already taken (422)', async () => {
    const created = await createRequest();
    await claim(created.id);
    const res = await claim(created.id, OTHER_WORKER);
    assert.equal(res.status, 422);
  });

  it('lets only one of two concurrent claims win (TOCTOU-safe)', async () => {
    const created = await createRequest();
    const [a, b] = await Promise.all([
      claim(created.id, WORKER_ID),
      claim(created.id, OTHER_WORKER),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 422]);

    // Exactly one worker ended up assigned, matching the 200 response.
    const winnerId = a.status === 200 ? WORKER_ID : OTHER_WORKER;
    const detail = await (
      await fetch(`${baseUrl}/service-requests/${created.id}`, {
        headers: headers(ADMIN_ID, 'admin'),
      })
    ).json();
    assert.equal(detail.status, 'matched');
    assert.equal(detail.workerId, winnerId);
  });

  it('forbids a customer or admin from claiming (403)', async () => {
    const created = await createRequest();
    const asCustomer = await fetch(`${baseUrl}/service-requests/${created.id}/claim`, {
      method: 'PATCH',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    assert.equal(asCustomer.status, 403);
    const asAdmin = await fetch(`${baseUrl}/service-requests/${created.id}/claim`, {
      method: 'PATCH',
      headers: headers(ADMIN_ID, 'admin'),
    });
    assert.equal(asAdmin.status, 403);
  });

  it('returns 404 for an unknown request', async () => {
    const res = await claim('999e4567-e89b-12d3-a456-426614174000');
    assert.equal(res.status, 404);
  });

  it('returns 401 without authentication', async () => {
    const created = await createRequest();
    const res = await fetch(`${baseUrl}/service-requests/${created.id}/claim`, { method: 'PATCH' });
    assert.equal(res.status, 401);
  });
});
