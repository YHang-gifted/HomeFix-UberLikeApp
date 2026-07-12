import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';

// slice 174: the visit time is a two-party agreement. Either party proposes; only the OTHER
// party may confirm. Proposing again — even after a confirmation — drops back to `proposed`,
// which is how a reschedule is asked for.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

/** A fixed offset from now, so the "must be in the future" guard never goes stale. */
function inDays(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('Visit scheduling (propose / confirm)', () => {
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

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** Create a request (optionally with a proposed time) and assign the worker. */
  async function assignedRequest(scheduledAt) {
    const request = await (
      await api(CUSTOMER_ID, 'customer', 'POST', '/service-requests', {
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'Leaking kitchen sink',
        location: { latitude: 25.03, longitude: 121.56 },
        ...(scheduledAt !== undefined ? { scheduledAt } : {}),
      })
    ).json();
    await api(ADMIN_ID, 'admin', 'PATCH', `/service-requests/${request.id}/assignment`, {
      workerId: WORKER_ID,
    });
    return request;
  }

  function propose(id, role, requestId, scheduledAt) {
    return api(id, role, 'POST', `/service-requests/${requestId}/schedule`, { scheduledAt });
  }

  function confirm(id, role, requestId) {
    return api(id, role, 'POST', `/service-requests/${requestId}/schedule/confirm`);
  }

  function get(requestId) {
    return api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${requestId}`).then((res) =>
      res.json(),
    );
  }

  it('a time given at creation is the customer’s proposal, not an agreement', async () => {
    const when = inDays(3);
    const request = await assignedRequest(when);
    assert.equal(request.scheduledAt, when);
    assert.equal(request.scheduleStatus, 'proposed');
    assert.equal(request.scheduleProposedBy, 'customer');
  });

  it('a request created without a time is unset', async () => {
    const request = await assignedRequest();
    assert.equal(request.scheduleStatus, 'unset');
    assert.equal(request.scheduledAt, undefined);
  });

  it('the worker confirms the customer’s proposed time', async () => {
    const when = inDays(3);
    const request = await assignedRequest(when);

    const res = await confirm(WORKER_ID, 'worker', request.id);
    assert.equal(res.status, 200);

    const after_ = await get(request.id);
    assert.equal(after_.scheduleStatus, 'confirmed');
    assert.equal(after_.scheduledAt, when);
  });

  it('the worker counter-proposes, and then the customer confirms', async () => {
    const request = await assignedRequest(inDays(3));
    const counter = inDays(5);

    assert.equal((await propose(WORKER_ID, 'worker', request.id, counter)).status, 200);
    let current = await get(request.id);
    assert.equal(current.scheduleStatus, 'proposed');
    assert.equal(current.scheduleProposedBy, 'worker');
    assert.equal(current.scheduledAt, counter);

    assert.equal((await confirm(CUSTOMER_ID, 'customer', request.id)).status, 200);
    current = await get(request.id);
    assert.equal(current.scheduleStatus, 'confirmed');
    assert.equal(current.scheduledAt, counter);
  });

  it('you cannot confirm your own proposal (409)', async () => {
    const request = await assignedRequest(inDays(3));
    // The customer proposed at creation, so the customer may not confirm it.
    assert.equal((await confirm(CUSTOMER_ID, 'customer', request.id)).status, 409);
    assert.equal((await get(request.id)).scheduleStatus, 'proposed');
  });

  it('there is nothing to confirm when no time is on the table (409)', async () => {
    const request = await assignedRequest();
    assert.equal((await confirm(WORKER_ID, 'worker', request.id)).status, 409);
  });

  it('re-proposing after a confirmation reopens it (a reschedule)', async () => {
    const request = await assignedRequest(inDays(3));
    await confirm(WORKER_ID, 'worker', request.id);
    assert.equal((await get(request.id)).scheduleStatus, 'confirmed');

    // The worker asks to move it: back to proposed, awaiting the customer.
    assert.equal((await propose(WORKER_ID, 'worker', request.id, inDays(6))).status, 200);
    const current = await get(request.id);
    assert.equal(current.scheduleStatus, 'proposed');
    assert.equal(current.scheduleProposedBy, 'worker');
  });

  it('rejects a time in the past (422)', async () => {
    const request = await assignedRequest();
    assert.equal((await propose(WORKER_ID, 'worker', request.id, inDays(-1))).status, 422);
  });

  it('forbids a non-party, including an admin (403)', async () => {
    const request = await assignedRequest(inDays(3));
    // An admin can see the request but is not a party to the appointment.
    assert.equal((await confirm(ADMIN_ID, 'admin', request.id)).status, 403);
    assert.equal((await propose(ADMIN_ID, 'admin', request.id, inDays(4))).status, 403);
  });

  it('cannot schedule a request with no assigned worker (422)', async () => {
    const request = await (
      await api(CUSTOMER_ID, 'customer', 'POST', '/service-requests', {
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'Leaking kitchen sink',
        location: { latitude: 25.03, longitude: 121.56 },
      })
    ).json();
    assert.equal((await propose(CUSTOMER_ID, 'customer', request.id, inDays(3))).status, 422);
  });

  it('releasing the job back to the pool drops the agreed time', async () => {
    const request = await assignedRequest(inDays(3));
    await confirm(WORKER_ID, 'worker', request.id);
    assert.equal((await get(request.id)).scheduleStatus, 'confirmed');

    // The worker walks away. The appointment was an agreement with THAT worker — the next
    // worker must not inherit a confirmed time they never agreed to.
    const released = await api(
      WORKER_ID,
      'worker',
      'PATCH',
      `/service-requests/${request.id}/release`,
    );
    assert.equal(released.status, 200);

    const current = await get(request.id);
    assert.equal(current.scheduleStatus, 'unset');
    assert.equal(current.scheduledAt, undefined);
    assert.equal(current.scheduleProposedBy, undefined);
  });

  it('cannot schedule a cancelled request (422)', async () => {
    const request = await assignedRequest();
    await api(CUSTOMER_ID, 'customer', 'PATCH', `/service-requests/${request.id}/status`, {
      status: 'cancelled',
    });
    assert.equal((await propose(CUSTOMER_ID, 'customer', request.id, inDays(3))).status, 422);
  });
});
