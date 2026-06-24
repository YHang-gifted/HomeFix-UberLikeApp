import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function authHeader(id, role) {
  return { Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('GET /users/:id', () => {
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

  it('returns a public summary of the requested customer to a worker', async () => {
    const res = await fetch(`${baseUrl}/users/${CUSTOMER_ID}`, {
      headers: authHeader(WORKER_ID, 'worker'),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, CUSTOMER_ID);
    assert.equal(body.displayName, 'Demo Customer');
    assert.equal(body.role, 'customer');
    assert.equal(body.email, undefined);
    assert.equal(body.passwordHash, undefined);
  });

  it('resolves any role (admin can be looked up)', async () => {
    const res = await fetch(`${baseUrl}/users/${ADMIN_ID}`, {
      headers: authHeader(CUSTOMER_ID, 'customer'),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.displayName, 'Demo Admin');
    assert.equal(body.role, 'admin');
  });

  it('returns 404 for an unknown user id', async () => {
    const res = await fetch(`${baseUrl}/users/999e4567-e89b-12d3-a456-426614174000`, {
      headers: authHeader(WORKER_ID, 'worker'),
    });
    assert.equal(res.status, 404);
  });

  it('returns 422 for a malformed id', async () => {
    const res = await fetch(`${baseUrl}/users/not-a-uuid`, {
      headers: authHeader(WORKER_ID, 'worker'),
    });
    assert.equal(res.status, 422);
  });

  it('returns 401 without authentication', async () => {
    const res = await fetch(`${baseUrl}/users/${CUSTOMER_ID}`);
    assert.equal(res.status, 401);
  });

  it('resolves a batch of ids in one call, skipping unknown ones', async () => {
    const unknown = '999e4567-e89b-12d3-a456-426614174000';
    const ids = `${CUSTOMER_ID},${WORKER_ID},${unknown}`;
    const res = await fetch(`${baseUrl}/users?ids=${ids}`, {
      headers: authHeader(WORKER_ID, 'worker'),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.length, 2);
    const byId = Object.fromEntries(body.map((user) => [user.id, user]));
    assert.equal(byId[CUSTOMER_ID].displayName, 'Demo Customer');
    assert.equal(byId[WORKER_ID].displayName, 'Demo Worker');
    assert.equal(byId[unknown], undefined);
  });

  it('returns an empty array when no ids are given', async () => {
    const res = await fetch(`${baseUrl}/users`, { headers: authHeader(WORKER_ID, 'worker') });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  });

  it('returns 422 when a batch id is malformed', async () => {
    const res = await fetch(`${baseUrl}/users?ids=${CUSTOMER_ID},not-a-uuid`, {
      headers: authHeader(WORKER_ID, 'worker'),
    });
    assert.equal(res.status, 422);
  });

  it('returns 401 for the batch endpoint without authentication', async () => {
    const res = await fetch(`${baseUrl}/users?ids=${CUSTOMER_ID}`);
    assert.equal(res.status, 401);
  });
});
