import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetMessages } from '../server/src/services/messageService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_CUSTOMER_ID = '223e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('request messages', () => {
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

  async function assign(id) {
    await fetch(`${baseUrl}/service-requests/${id}/assignment`, {
      method: 'PATCH',
      headers: headers(ADMIN_ID, 'admin'),
      body: JSON.stringify({ workerId: WORKER_ID }),
    });
  }

  it('lets the customer and assigned worker exchange messages, oldest first', async () => {
    const created = await createRequest();
    await assign(created.id);

    const posted = await fetch(`${baseUrl}/service-requests/${created.id}/messages`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
      body: JSON.stringify({ body: 'Hi, when can you come?' }),
    });
    assert.equal(posted.status, 201);
    const message = await posted.json();
    assert.equal(message.senderId, CUSTOMER_ID);
    assert.equal(message.senderRole, 'customer');
    assert.equal(message.body, 'Hi, when can you come?');

    await fetch(`${baseUrl}/service-requests/${created.id}/messages`, {
      method: 'POST',
      headers: headers(WORKER_ID, 'worker'),
      body: JSON.stringify({ body: 'Tomorrow at 9am.' }),
    });

    const thread = await (
      await fetch(`${baseUrl}/service-requests/${created.id}/messages`, {
        headers: headers(WORKER_ID, 'worker'),
      })
    ).json();
    assert.deepEqual(
      thread.map((m) => m.body),
      ['Hi, when can you come?', 'Tomorrow at 9am.'],
    );
  });

  it('forbids a non-party from reading or posting (403)', async () => {
    const created = await createRequest();
    await assign(created.id);

    const read = await fetch(`${baseUrl}/service-requests/${created.id}/messages`, {
      headers: headers(OTHER_CUSTOMER_ID, 'customer'),
    });
    assert.equal(read.status, 403);

    const write = await fetch(`${baseUrl}/service-requests/${created.id}/messages`, {
      method: 'POST',
      headers: headers(OTHER_CUSTOMER_ID, 'customer'),
      body: JSON.stringify({ body: 'let me in' }),
    });
    assert.equal(write.status, 403);
  });

  it('rejects an empty message body (422)', async () => {
    const created = await createRequest();
    const res = await fetch(`${baseUrl}/service-requests/${created.id}/messages`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
      body: JSON.stringify({ body: '   ' }),
    });
    assert.equal(res.status, 422);
  });

  it('returns 404 for an unknown request', async () => {
    const res = await fetch(
      `${baseUrl}/service-requests/999e4567-e89b-12d3-a456-426614174000/messages`,
      { headers: headers(ADMIN_ID, 'admin') },
    );
    assert.equal(res.status, 404);
  });

  it('returns 401 without authentication', async () => {
    const created = await createRequest();
    const res = await fetch(`${baseUrl}/service-requests/${created.id}/messages`);
    assert.equal(res.status, 401);
  });
});
