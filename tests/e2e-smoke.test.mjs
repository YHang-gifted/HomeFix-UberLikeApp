import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetPayouts } from '../server/src/services/payoutService.ts';
import { resetReviews } from '../server/src/services/reviewService.ts';
import { resetAuditEvents } from '../server/src/services/auditService.ts';

/**
 * End-to-end smoke test: the full three-role journey over the real HTTP API,
 * driven by real logins with the seeded demo accounts. This codifies the happy
 * path of docs/qa-checklist.md so an integration regression anywhere along the
 * customer -> worker -> admin loop fails CI. Each step asserts the state it
 * produces; later steps depend on earlier ones, so they run in order.
 */

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const QUOTE_CENTS = 150000;
// Platform fee is 15% (1500 bps) by default: floor(150000 * 1500 / 10000) = 22500.
const EXPECTED_FEE_CENTS = 22500;
const EXPECTED_WORKER_NET_CENTS = QUOTE_CENTS - EXPECTED_FEE_CENTS;

describe('end-to-end smoke: full three-role journey', () => {
  let server;
  let baseUrl;
  const token = {};
  let requestId;

  async function login(email, password) {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(res.status, 200, `login for ${email} should succeed`);
    return (await res.json()).token;
  }

  function authHeaders(role) {
    return { 'content-type': 'application/json', Authorization: `Bearer ${token[role]}` };
  }

  function api(role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: authHeaders(role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  before(async () => {
    await resetServiceRequests();
    await resetQuotes();
    await resetPayments();
    await resetPayouts();
    await resetReviews();
    await resetAuditEvents();

    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    token.customer = await login('customer@homefix.test', 'customer-pass');
    token.worker = await login('worker@homefix.test', 'worker-pass');
    token.admin = await login('admin@homefix.test', 'admin-pass');
  });

  after(async () => {
    await new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  it('reports healthy and ready', async () => {
    assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/ready`)).status, 200);
  });

  it('customer posts a repair request (pending)', async () => {
    const res = await api('customer', 'POST', '/service-requests', {
      customerId: CUSTOMER_ID,
      category: 'plumbing',
      description: 'Leaking kitchen sink',
      location: { latitude: 25.03, longitude: 121.56 },
    });
    assert.equal(res.status, 201);
    const request = await res.json();
    assert.equal(request.status, 'pending');
    assert.equal(request.category, 'plumbing');
    requestId = request.id;
  });

  it('admin assigns a worker (matched)', async () => {
    const res = await api('admin', 'PATCH', `/service-requests/${requestId}/assignment`, {
      workerId: WORKER_ID,
    });
    assert.equal(res.status, 200);
    const request = await res.json();
    assert.equal(request.workerId, WORKER_ID);
    assert.equal(request.status, 'matched');
  });

  it('worker proposes a price quote', async () => {
    const res = await api('worker', 'POST', `/service-requests/${requestId}/quote`, {
      amountCents: QUOTE_CENTS,
    });
    assert.equal(res.status, 201);
    const quote = await res.json();
    assert.equal(quote.amountCents, QUOTE_CENTS);
    assert.equal(quote.status, 'pending');
  });

  it('customer accepts the quote', async () => {
    const res = await api('customer', 'POST', `/service-requests/${requestId}/quote/accept`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'accepted');
  });

  it('customer sets up payment with the commission split and a provider reference', async () => {
    const res = await api('customer', 'POST', `/service-requests/${requestId}/payment`, {
      amountCents: QUOTE_CENTS,
    });
    assert.equal(res.status, 201);
    const payment = await res.json();
    assert.equal(payment.amountCents, QUOTE_CENTS);
    assert.equal(payment.platformFeeCents, EXPECTED_FEE_CENTS);
    assert.equal(payment.workerNetCents, EXPECTED_WORKER_NET_CENTS);
    assert.match(payment.providerRef, /^mock_/);
    assert.equal(payment.status, 'pending');
  });

  it('customer pays (mock) and the payment is marked paid', async () => {
    const res = await api('customer', 'POST', `/service-requests/${requestId}/payment/pay`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'paid');
  });

  it('a pending payout for the worker net is scheduled on payment', async () => {
    const res = await api('worker', 'GET', '/payouts');
    assert.equal(res.status, 200);
    const { items } = await res.json();
    const payout = items.find((p) => p.workerId === WORKER_ID);
    assert.ok(payout, 'a payout should exist for the worker');
    assert.equal(payout.amountCents, EXPECTED_WORKER_NET_CENTS);
    assert.equal(payout.status, 'pending');
  });

  it('customer and worker exchange messages, oldest first', async () => {
    assert.equal(
      (
        await api('customer', 'POST', `/service-requests/${requestId}/messages`, {
          body: 'When can you come?',
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await api('worker', 'POST', `/service-requests/${requestId}/messages`, {
          body: 'Tomorrow at 9am.',
        })
      ).status,
      201,
    );
    const res = await api('customer', 'GET', `/service-requests/${requestId}/messages`);
    assert.equal(res.status, 200);
    const thread = await res.json();
    assert.deepEqual(
      thread.map((m) => m.body),
      ['When can you come?', 'Tomorrow at 9am.'],
    );
  });

  it('worker advances the request to completed', async () => {
    for (const status of ['accepted', 'in_progress', 'completed']) {
      const res = await api('worker', 'PATCH', `/service-requests/${requestId}/status`, { status });
      assert.equal(res.status, 200, `transition to ${status} should succeed`);
      assert.equal((await res.json()).status, status);
    }
  });

  it('customer reviews the worker and the worker replies', async () => {
    const reviewRes = await api('customer', 'POST', `/service-requests/${requestId}/review`, {
      rating: 5,
      comment: 'Fast and tidy.',
    });
    assert.equal(reviewRes.status, 201);
    assert.equal((await reviewRes.json()).rating, 5);

    const replyRes = await api('worker', 'POST', `/service-requests/${requestId}/review/reply`, {
      reply: 'Thank you!',
    });
    assert.equal(replyRes.status, 200);
    assert.equal((await replyRes.json()).reply, 'Thank you!');
  });

  it('the worker average rating reflects the review', async () => {
    const res = await api('admin', 'GET', `/workers/${WORKER_ID}/reviews`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.reviewCount, 1);
    assert.equal(body.averageRating, 5);
  });

  it('the customer received in-app notifications along the way', async () => {
    const res = await api('customer', 'GET', '/notifications');
    assert.equal(res.status, 200);
    const { items } = await res.json();
    assert.ok(items.length > 0, 'customer should have at least one notification');
  });

  it('the admin audit log captured the whole lifecycle', async () => {
    const res = await api('admin', 'GET', '/audit');
    assert.equal(res.status, 200);
    const actions = new Set((await res.json()).items.map((e) => e.action));
    for (const expected of [
      'service_request.created',
      'service_request.assigned',
      'quote.proposed',
      'quote.accepted',
      'payment.created',
    ]) {
      assert.ok(actions.has(expected), `audit log should contain ${expected}`);
    }
  });

  it('rejects an unauthenticated request to a protected route (401)', async () => {
    assert.equal((await fetch(`${baseUrl}/service-requests`)).status, 401);
  });
});
