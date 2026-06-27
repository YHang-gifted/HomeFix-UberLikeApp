import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('GET /service-requests/available', () => {
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

  async function createRequest(description, category = 'plumbing') {
    return (
      await fetch(`${baseUrl}/service-requests`, {
        method: 'POST',
        headers: headers(CUSTOMER_ID, 'customer'),
        body: JSON.stringify({
          customerId: CUSTOMER_ID,
          category,
          description,
          location: { latitude: 25.03, longitude: 121.56 },
        }),
      })
    ).json();
  }

  it('lists pending unassigned requests for a worker', async () => {
    await createRequest('Pending one');
    const res = await fetch(`${baseUrl}/service-requests/available`, {
      headers: headers(WORKER_ID, 'worker'),
    });
    assert.equal(res.status, 200);
    const page = await res.json();
    assert.equal(page.total, 1);
    assert.equal(page.items[0].description, 'Pending one');
  });

  it('excludes requests that already have a worker assigned', async () => {
    const created = await createRequest('Will be assigned');
    await fetch(`${baseUrl}/service-requests/${created.id}/assignment`, {
      method: 'PATCH',
      headers: headers(ADMIN_ID, 'admin'),
      body: JSON.stringify({ workerId: WORKER_ID }),
    });

    const page = await (
      await fetch(`${baseUrl}/service-requests/available`, {
        headers: headers(WORKER_ID, 'worker'),
      })
    ).json();
    assert.equal(page.total, 0);
  });

  it('is also available to an admin', async () => {
    await createRequest('Pending');
    const res = await fetch(`${baseUrl}/service-requests/available`, {
      headers: headers(ADMIN_ID, 'admin'),
    });
    assert.equal(res.status, 200);
  });

  it('forbids a customer (403)', async () => {
    const res = await fetch(`${baseUrl}/service-requests/available`, {
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    assert.equal(res.status, 403);
  });

  it('paginates', async () => {
    await createRequest('A');
    await createRequest('B');
    await createRequest('C');
    const page = await (
      await fetch(`${baseUrl}/service-requests/available?limit=2&offset=0`, {
        headers: headers(WORKER_ID, 'worker'),
      })
    ).json();
    assert.equal(page.total, 3);
    assert.equal(page.items.length, 2);
    assert.equal(page.limit, 2);
  });

  it('filters by category (case-insensitive)', async () => {
    await createRequest('Leaky tap', 'plumbing');
    await createRequest('Broken socket', 'electrical');
    await createRequest('Another leak', 'plumbing');

    const page = await (
      await fetch(`${baseUrl}/service-requests/available?category=Plumbing`, {
        headers: headers(WORKER_ID, 'worker'),
      })
    ).json();
    assert.equal(page.total, 2);
    assert.ok(page.items.every((r) => r.category === 'plumbing'));
  });

  it('returns an empty page for a category with no available requests', async () => {
    await createRequest('Leaky tap', 'plumbing');
    const page = await (
      await fetch(`${baseUrl}/service-requests/available?category=carpentry`, {
        headers: headers(WORKER_ID, 'worker'),
      })
    ).json();
    assert.equal(page.total, 0);
    assert.equal(page.items.length, 0);
  });

  it('returns 401 without authentication', async () => {
    const res = await fetch(`${baseUrl}/service-requests/available`);
    assert.equal(res.status, 401);
  });
});
