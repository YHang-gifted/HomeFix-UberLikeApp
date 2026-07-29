import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { clearTimeout, setTimeout } from 'node:timers';

import { WebSocket } from 'ws';

import { createApp } from '../server/src/app.ts';
import { attachMessageSocket } from '../server/src/realtime/messageSocket.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetTracking } from '../server/src/services/trackingService.ts';

// Live-tracking Phase 2 (backend): while a worker is on the way, they POST their live position; it
// is relayed to the request's parties over the per-request WebSocket (tagged `type:'location'`) and
// never stored. Worker-only, and only once they have set out.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('live location tracking', () => {
  let server;
  let wss;
  let baseUrl;
  let wsBase;

  before(async () => {
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        wsBase = `ws://127.0.0.1:${port}/ws/messages`;
        resolve();
      });
    });
    wss = attachMessageSocket(server);
  });

  after(async () => {
    await new Promise((resolve) => wss.close(() => resolve()));
    await new Promise((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await resetServiceRequests();
    resetTracking();
  });

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** A request the assigned worker has set out for (`enRouteAt` set); returns its id. */
  async function enRouteRequest() {
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
    await api(WORKER_ID, 'worker', 'POST', `/service-requests/${request.id}/on-my-way`, {});
    return request.id;
  }

  function postLocation(requestId, id, role, latitude, longitude) {
    return api(id, role, 'POST', `/service-requests/${requestId}/location`, {
      latitude,
      longitude,
    });
  }

  it('relays a worker position to a subscribed party, tagged as a location', async () => {
    const requestId = await enRouteRequest();
    const socket = new WebSocket(
      `${wsBase}?requestId=${requestId}&token=${signToken({ id: CUSTOMER_ID, role: 'customer' })}`,
    );

    const frame = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no location pushed in time')), 3000);
      socket.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'ready') {
          void postLocation(requestId, WORKER_ID, 'worker', 40.71, -74.0);
          return;
        }
        if (parsed.type === 'location') {
          clearTimeout(timer);
          resolve(parsed);
        }
      });
      socket.on('error', reject);
    });

    socket.close();
    assert.equal(frame.location.requestId, requestId);
    assert.equal(frame.location.latitude, 40.71);
    assert.equal(frame.location.longitude, -74.0);
    assert.ok(frame.location.at);
  });

  it('sends a party joining mid-trip the last known position immediately', async () => {
    const requestId = await enRouteRequest();
    assert.equal((await postLocation(requestId, WORKER_ID, 'worker', 41.5, -73.2)).status, 200);

    const socket = new WebSocket(
      `${wsBase}?requestId=${requestId}&token=${signToken({ id: CUSTOMER_ID, role: 'customer' })}`,
    );
    const frame = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no latest pushed in time')), 3000);
      socket.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'location') {
          clearTimeout(timer);
          resolve(parsed);
        }
      });
      socket.on('error', reject);
    });

    socket.close();
    assert.equal(frame.location.latitude, 41.5);
    assert.equal(frame.location.longitude, -73.2);
  });

  it('forbids a non-worker from sharing a location (403)', async () => {
    const requestId = await enRouteRequest();
    assert.equal((await postLocation(requestId, CUSTOMER_ID, 'customer', 1, 2)).status, 403);
  });

  it('409s when the worker has not set out yet', async () => {
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
    // Assigned but no on-my-way → not en route → cannot share a location.
    assert.equal((await postLocation(request.id, WORKER_ID, 'worker', 1, 2)).status, 409);
  });
});
