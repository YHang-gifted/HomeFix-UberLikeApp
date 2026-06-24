import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetNotifications } from '../server/src/services/notificationService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('notifications', () => {
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
    await resetNotifications();
  });

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

  it('notifies the worker when assigned and the customer on status change', async () => {
    const created = await createAndAssign();

    const workerList = await (
      await fetch(`${baseUrl}/notifications`, { headers: headers(WORKER_ID, 'worker') })
    ).json();
    assert.equal(workerList.unreadCount, 1);
    assert.equal(workerList.items[0].requestId, created.id);

    await fetch(`${baseUrl}/service-requests/${created.id}/status`, {
      method: 'PATCH',
      headers: headers(WORKER_ID, 'worker'),
      body: JSON.stringify({ status: 'accepted' }),
    });
    const customerList = await (
      await fetch(`${baseUrl}/notifications`, { headers: headers(CUSTOMER_ID, 'customer') })
    ).json();
    assert.equal(customerList.unreadCount, 1);
    assert.match(customerList.items[0].message, /accepted/);
  });

  it('marks a notification as read', async () => {
    await createAndAssign();
    const list = await (
      await fetch(`${baseUrl}/notifications`, { headers: headers(WORKER_ID, 'worker') })
    ).json();
    const id = list.items[0].id;

    const res = await fetch(`${baseUrl}/notifications/${id}/read`, {
      method: 'PATCH',
      headers: headers(WORKER_ID, 'worker'),
    });
    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.read, true);

    const after = await (
      await fetch(`${baseUrl}/notifications`, { headers: headers(WORKER_ID, 'worker') })
    ).json();
    assert.equal(after.unreadCount, 0);
  });

  it('marks all of the user notifications as read', async () => {
    await createAndAssign();
    await createAndAssign();
    const before = await (
      await fetch(`${baseUrl}/notifications`, { headers: headers(WORKER_ID, 'worker') })
    ).json();
    assert.equal(before.unreadCount, 2);

    const res = await fetch(`${baseUrl}/notifications/read-all`, {
      method: 'PATCH',
      headers: headers(WORKER_ID, 'worker'),
    });
    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.unreadCount, 0);
    assert.equal(updated.items.length, 2);
    assert.ok(updated.items.every((item) => item.read === true));

    // Another user's notifications are untouched.
    const created = await createAndAssign();
    const customerList = await (
      await fetch(`${baseUrl}/service-requests/${created.id}/status`, {
        method: 'PATCH',
        headers: headers(WORKER_ID, 'worker'),
        body: JSON.stringify({ status: 'accepted' }),
      })
    ).json();
    void customerList;
    const customer = await (
      await fetch(`${baseUrl}/notifications`, { headers: headers(CUSTOMER_ID, 'customer') })
    ).json();
    assert.equal(customer.unreadCount, 1);
  });

  it('returns 404 when marking another user notification', async () => {
    await createAndAssign();
    const list = await (
      await fetch(`${baseUrl}/notifications`, { headers: headers(WORKER_ID, 'worker') })
    ).json();
    const id = list.items[0].id;
    const res = await fetch(`${baseUrl}/notifications/${id}/read`, {
      method: 'PATCH',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    assert.equal(res.status, 404);
  });

  it('returns 401 without authentication', async () => {
    const res = await fetch(`${baseUrl}/notifications`);
    assert.equal(res.status, 401);
  });
});
