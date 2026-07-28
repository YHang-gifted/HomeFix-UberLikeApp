import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import {
  resetTravelTimeEstimatorForTests,
  setTravelTimeEstimatorForTests,
} from '../server/src/services/travelTimeService.ts';

// Live-tracking Phase 1: the assigned worker taps "on my way" for a confirmed visit → a departure
// time is recorded, a rough ETA is attached when the worker sent a location and a maps provider is
// configured (a fake here), and the customer is notified. Worker-only, confirmed-schedule only.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('worker on my way', () => {
  let server;
  let baseUrl;

  before(async () => {
    await resetServiceRequests();
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

  beforeEach(() => {
    resetTravelTimeEstimatorForTests();
  });

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** A request with an assigned worker and a **confirmed** visit time; returns its id. */
  async function confirmedRequest() {
    const request = await (
      await api(CUSTOMER_ID, 'customer', 'POST', '/service-requests', {
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'Leaking sink',
        location: { latitude: 40.7128, longitude: -74.006 },
      })
    ).json();
    await api(ADMIN_ID, 'admin', 'PATCH', `/service-requests/${request.id}/assignment`, {
      workerId: WORKER_ID,
    });
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${request.id}/schedule`, {
      scheduledAt: future,
    });
    await api(WORKER_ID, 'worker', 'POST', `/service-requests/${request.id}/schedule/confirm`);
    return request.id;
  }

  function onMyWay(requestId, id, role, body) {
    return api(id, role, 'POST', `/service-requests/${requestId}/on-my-way`, body);
  }

  it('records departure + ETA and notifies the customer', async () => {
    setTravelTimeEstimatorForTests(() => Promise.resolve(23));
    const requestId = await confirmedRequest();

    const res = await onMyWay(requestId, WORKER_ID, 'worker', {
      origin: { latitude: 40.7, longitude: -74.0 },
    });
    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.ok(updated.enRouteAt);
    assert.equal(updated.enRouteEtaMinutes, 23);

    const { items } = await (await api(CUSTOMER_ID, 'customer', 'GET', '/notifications')).json();
    assert.ok(items.some((n) => /on the way/i.test(n.message)));
  });

  it('works without a location, carrying no ETA', async () => {
    const requestId = await confirmedRequest();
    const res = await onMyWay(requestId, WORKER_ID, 'worker', {});
    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.ok(updated.enRouteAt);
    assert.equal(updated.enRouteEtaMinutes, undefined);
  });

  it('forbids the customer from setting out (403)', async () => {
    const requestId = await confirmedRequest();
    assert.equal((await onMyWay(requestId, CUSTOMER_ID, 'customer', {})).status, 403);
  });

  it('409s when the visit time is not confirmed', async () => {
    const request = await (
      await api(CUSTOMER_ID, 'customer', 'POST', '/service-requests', {
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'Leaking sink',
        location: { latitude: 40.7128, longitude: -74.006 },
      })
    ).json();
    await api(ADMIN_ID, 'admin', 'PATCH', `/service-requests/${request.id}/assignment`, {
      workerId: WORKER_ID,
    });
    // No schedule proposed/confirmed → cannot set out.
    assert.equal((await onMyWay(request.id, WORKER_ID, 'worker', {})).status, 409);
  });
});
