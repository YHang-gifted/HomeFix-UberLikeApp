import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetReviews } from '../server/src/services/reviewService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('GET /worker-ratings', () => {
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
    await resetReviews();
  });

  async function createCompletedAndReview(rating) {
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
    for (const status of ['accepted', 'in_progress', 'completed']) {
      await fetch(`${baseUrl}/service-requests/${created.id}/status`, {
        method: 'PATCH',
        headers: headers(WORKER_ID, 'worker'),
        body: JSON.stringify({ status }),
      });
    }
    await fetch(`${baseUrl}/service-requests/${created.id}/review`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
      body: JSON.stringify({ rating }),
    });
  }

  it('returns an aggregate rating for every worker in one call', async () => {
    const res = await fetch(`${baseUrl}/worker-ratings`, { headers: headers(ADMIN_ID, 'admin') });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    const worker = body.find((entry) => entry.workerId === WORKER_ID);
    assert.ok(worker);
    assert.equal(worker.reviewCount, 0);
    assert.equal(worker.averageRating, 0);
    assert.equal(worker.items, undefined);
  });

  it('reflects submitted reviews in the aggregate', async () => {
    await createCompletedAndReview(4);
    const body = await (
      await fetch(`${baseUrl}/worker-ratings`, { headers: headers(ADMIN_ID, 'admin') })
    ).json();
    const worker = body.find((entry) => entry.workerId === WORKER_ID);
    assert.equal(worker.reviewCount, 1);
    assert.equal(worker.averageRating, 4);
  });

  it('returns 401 without authentication', async () => {
    const res = await fetch(`${baseUrl}/worker-ratings`);
    assert.equal(res.status, 401);
  });
});
