import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { clearTimeout, setTimeout } from 'node:timers';

import { WebSocket } from 'ws';

import { createApp } from '../server/src/app.ts';
import { attachMessageSocket } from '../server/src/realtime/messageSocket.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetMessages } from '../server/src/services/messageService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_CUSTOMER_ID = '223e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('message WebSocket push', () => {
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
    await resetMessages();
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

  function token(id, role) {
    return signToken({ id, role });
  }

  it('pushes a newly posted message to a subscribed party', async () => {
    const created = await createRequest();
    const socket = new WebSocket(
      `${wsBase}?requestId=${created.id}&token=${token(CUSTOMER_ID, 'customer')}`,
    );

    const pushed = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no message pushed in time')), 3000);
      socket.on('message', (data) => {
        const frame = JSON.parse(data.toString());
        if (frame.type === 'ready') {
          // Subscription is live — now post a message over HTTP.
          void fetch(`${baseUrl}/service-requests/${created.id}/messages`, {
            method: 'POST',
            headers: headers(CUSTOMER_ID, 'customer'),
            body: JSON.stringify({ body: 'Live update please' }),
          });
          return;
        }
        clearTimeout(timer);
        resolve(frame);
      });
      socket.on('error', reject);
    });

    socket.close();
    assert.equal(pushed.requestId, created.id);
    assert.equal(pushed.body, 'Live update please');
    assert.equal(pushed.senderId, CUSTOMER_ID);
  });

  it('closes an unauthenticated connection (no token) with 4401', async () => {
    const created = await createRequest();
    const socket = new WebSocket(`${wsBase}?requestId=${created.id}`);

    const code = await new Promise((resolve) => socket.on('close', (c) => resolve(c)));
    assert.equal(code, 4401);
  });

  it('closes a non-party connection with 4403', async () => {
    const created = await createRequest();
    const socket = new WebSocket(
      `${wsBase}?requestId=${created.id}&token=${token(OTHER_CUSTOMER_ID, 'customer')}`,
    );

    const code = await new Promise((resolve) => socket.on('close', (c) => resolve(c)));
    assert.equal(code, 4403);
  });
});
