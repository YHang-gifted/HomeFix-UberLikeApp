import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const OTHER_CUSTOMER_ID = '223e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('GET /service-requests/:id/contacts', () => {
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

  async function setPhone(id, role, phone, displayName) {
    await fetch(`${baseUrl}/me`, {
      method: 'PATCH',
      headers: headers(id, role),
      body: JSON.stringify({ displayName, phone }),
    });
  }

  async function createAndAssign() {
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
    return created;
  }

  it('gives the owning customer and assigned worker each the other party phone', async () => {
    await setPhone(CUSTOMER_ID, 'customer', '+1 555 111 0000', 'Demo Customer');
    await setPhone(WORKER_ID, 'worker', '+1 555 222 0000', 'Demo Worker');
    const created = await createAndAssign();

    const asCustomer = await (
      await fetch(`${baseUrl}/service-requests/${created.id}/contacts`, {
        headers: headers(CUSTOMER_ID, 'customer'),
      })
    ).json();
    assert.equal(asCustomer.workerPhone, '+1 555 222 0000');
    assert.equal(asCustomer.customerPhone, '+1 555 111 0000');

    const asWorker = await (
      await fetch(`${baseUrl}/service-requests/${created.id}/contacts`, {
        headers: headers(WORKER_ID, 'worker'),
      })
    ).json();
    assert.equal(asWorker.customerPhone, '+1 555 111 0000');
  });

  it('lets an admin see both contacts', async () => {
    await setPhone(CUSTOMER_ID, 'customer', '+1 555 111 0000', 'Demo Customer');
    await setPhone(WORKER_ID, 'worker', '+1 555 222 0000', 'Demo Worker');
    const created = await createAndAssign();

    const res = await fetch(`${baseUrl}/service-requests/${created.id}/contacts`, {
      headers: headers(ADMIN_ID, 'admin'),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.customerPhone, '+1 555 111 0000');
    assert.equal(body.workerPhone, '+1 555 222 0000');
  });

  it('forbids a non-party (403)', async () => {
    const created = await createAndAssign();
    const res = await fetch(`${baseUrl}/service-requests/${created.id}/contacts`, {
      headers: headers(OTHER_CUSTOMER_ID, 'customer'),
    });
    assert.equal(res.status, 403);
  });

  it('omits a phone the party has not set', async () => {
    // Clear any phone set by earlier tests (the in-memory store persists).
    await fetch(`${baseUrl}/me`, {
      method: 'PATCH',
      headers: headers(CUSTOMER_ID, 'customer'),
      body: JSON.stringify({ displayName: 'Demo Customer' }),
    });
    await fetch(`${baseUrl}/me`, {
      method: 'PATCH',
      headers: headers(WORKER_ID, 'worker'),
      body: JSON.stringify({ displayName: 'Demo Worker' }),
    });
    const created = await createAndAssign();
    const body = await (
      await fetch(`${baseUrl}/service-requests/${created.id}/contacts`, {
        headers: headers(ADMIN_ID, 'admin'),
      })
    ).json();
    assert.equal(body.customerPhone, undefined);
    assert.equal(body.workerPhone, undefined);
  });

  it('returns 401 without authentication', async () => {
    const created = await createAndAssign();
    const res = await fetch(`${baseUrl}/service-requests/${created.id}/contacts`);
    assert.equal(res.status, 401);
  });
});
