import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetReviews } from '../server/src/services/reviewService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_ID = '223e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('reviews', () => {
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

  async function status(id, role, next) {
    await fetch(`${baseUrl}/service-requests/${id}/status`, {
      method: 'PATCH',
      headers: headers(role === 'worker' ? WORKER_ID : ADMIN_ID, role),
      body: JSON.stringify({ status: next }),
    });
  }

  async function completedRequest() {
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
    const request = await res.json();
    await fetch(`${baseUrl}/service-requests/${request.id}/assignment`, {
      method: 'PATCH',
      headers: headers(ADMIN_ID, 'admin'),
      body: JSON.stringify({ workerId: WORKER_ID }),
    });
    await status(request.id, 'worker', 'accepted');
    await status(request.id, 'worker', 'in_progress');
    await status(request.id, 'worker', 'completed');
    return request;
  }

  function review(id, idActor, role, body) {
    return fetch(`${baseUrl}/service-requests/${id}/review`, {
      method: 'POST',
      headers: headers(idActor, role),
      body: JSON.stringify(body),
    });
  }

  it('lets the owning customer review a completed request (201)', async () => {
    const request = await completedRequest();
    const res = await review(request.id, CUSTOMER_ID, 'customer', { rating: 5, comment: 'Great' });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.rating, 5);
    assert.equal(body.comment, 'Great');
    assert.equal(body.requestId, request.id);
    assert.equal(body.workerId, WORKER_ID);
    assert.equal(body.customerId, CUSTOMER_ID);
  });

  it('rejects a second review of the same request (409)', async () => {
    const request = await completedRequest();
    await review(request.id, CUSTOMER_ID, 'customer', { rating: 5 });
    const res = await review(request.id, CUSTOMER_ID, 'customer', { rating: 3 });
    assert.equal(res.status, 409);
  });

  it('rejects reviewing a non-completed request (422)', async () => {
    const res = await fetch(`${baseUrl}/service-requests`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
      body: JSON.stringify({
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'Pending request',
        location: { latitude: 25.03, longitude: 121.56 },
      }),
    });
    const request = await res.json();
    const reviewRes = await review(request.id, CUSTOMER_ID, 'customer', { rating: 4 });
    assert.equal(reviewRes.status, 422);
  });

  it('forbids a non-owner customer from reviewing (403)', async () => {
    const request = await completedRequest();
    const res = await review(request.id, OTHER_ID, 'customer', { rating: 1 });
    assert.equal(res.status, 403);
  });

  it('returns a worker average rating and reviews', async () => {
    const a = await completedRequest();
    await review(a.id, CUSTOMER_ID, 'customer', { rating: 4 });
    const b = await completedRequest();
    await review(b.id, CUSTOMER_ID, 'customer', { rating: 2 });

    const res = await fetch(`${baseUrl}/workers/${WORKER_ID}/reviews`, {
      headers: headers(ADMIN_ID, 'admin'),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.reviewCount, 2);
    assert.equal(body.averageRating, 3);
    assert.equal(body.items.length, 2);
  });

  function reply(id, idActor, role, body) {
    return fetch(`${baseUrl}/service-requests/${id}/review/reply`, {
      method: 'POST',
      headers: headers(idActor, role),
      body: JSON.stringify(body),
    });
  }

  it('lets the reviewed worker reply to the review (200) and exposes it', async () => {
    const request = await completedRequest();
    await review(request.id, CUSTOMER_ID, 'customer', { rating: 5, comment: 'Great' });

    const res = await reply(request.id, WORKER_ID, 'worker', { reply: 'Thank you!' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.reply, 'Thank you!');
    assert.equal(typeof body.repliedAt, 'string');

    const got = await (
      await fetch(`${baseUrl}/service-requests/${request.id}/review`, {
        headers: headers(CUSTOMER_ID, 'customer'),
      })
    ).json();
    assert.equal(got.reply, 'Thank you!');
  });

  it('lets the worker update an existing reply', async () => {
    const request = await completedRequest();
    await review(request.id, CUSTOMER_ID, 'customer', { rating: 4 });
    await reply(request.id, WORKER_ID, 'worker', { reply: 'First' });
    const res = await reply(request.id, WORKER_ID, 'worker', { reply: 'Second' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).reply, 'Second');
  });

  it('forbids a worker who is not the reviewed one from replying (403)', async () => {
    const request = await completedRequest();
    await review(request.id, CUSTOMER_ID, 'customer', { rating: 5 });
    const res = await reply(request.id, OTHER_ID, 'worker', { reply: 'Not mine' });
    assert.equal(res.status, 403);
  });

  it('forbids the customer from replying (403)', async () => {
    const request = await completedRequest();
    await review(request.id, CUSTOMER_ID, 'customer', { rating: 5 });
    const res = await reply(request.id, CUSTOMER_ID, 'customer', { reply: 'I am the customer' });
    assert.equal(res.status, 403);
  });

  it('returns 404 when replying to a request with no review', async () => {
    const request = await completedRequest();
    const res = await reply(request.id, WORKER_ID, 'worker', { reply: 'Too early' });
    assert.equal(res.status, 404);
  });

  it('rejects an empty reply (422)', async () => {
    const request = await completedRequest();
    await review(request.id, CUSTOMER_ID, 'customer', { rating: 5 });
    const res = await reply(request.id, WORKER_ID, 'worker', { reply: '' });
    assert.equal(res.status, 422);
  });

  it('forbids a non-party from reading the review (403)', async () => {
    const request = await completedRequest();
    await review(request.id, CUSTOMER_ID, 'customer', { rating: 5 });
    const res = await fetch(`${baseUrl}/service-requests/${request.id}/review`, {
      headers: headers(OTHER_ID, 'customer'),
    });
    assert.equal(res.status, 403);
  });
});
