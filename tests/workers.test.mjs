import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';

const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function authHeader(id, role) {
  return { Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('GET /workers', () => {
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

  it('lets an admin list workers (200)', async () => {
    const res = await fetch(`${baseUrl}/workers`, { headers: authHeader(ADMIN_ID, 'admin') });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    assert.ok(body.some((worker) => worker.id === WORKER_ID));
    assert.ok(body.every((worker) => typeof worker.email === 'string'));
    assert.ok(body.every((worker) => typeof worker.displayName === 'string'));
    assert.ok(body.every((worker) => worker.passwordHash === undefined));
  });

  it('forbids a non-admin (403)', async () => {
    const res = await fetch(`${baseUrl}/workers`, { headers: authHeader(CUSTOMER_ID, 'customer') });
    assert.equal(res.status, 403);
  });

  it('returns a single worker by id to any authenticated user (200)', async () => {
    const res = await fetch(`${baseUrl}/workers/${WORKER_ID}`, {
      headers: authHeader(CUSTOMER_ID, 'customer'),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, WORKER_ID);
    assert.equal(typeof body.email, 'string');
    assert.equal(body.displayName, 'Demo Worker');
    assert.equal(body.passwordHash, undefined);
  });

  it('returns 404 for an unknown worker id', async () => {
    const res = await fetch(`${baseUrl}/workers/999e4567-e89b-12d3-a456-426614174000`, {
      headers: authHeader(CUSTOMER_ID, 'customer'),
    });
    assert.equal(res.status, 404);
  });

  it('returns 404 for a non-worker id', async () => {
    const res = await fetch(`${baseUrl}/workers/${ADMIN_ID}`, {
      headers: authHeader(CUSTOMER_ID, 'customer'),
    });
    assert.equal(res.status, 404);
  });

  it('returns 401 without authentication', async () => {
    const res = await fetch(`${baseUrl}/workers`);
    assert.equal(res.status, 401);
  });

  it('never exposes a contact phone in the worker summary', async () => {
    await fetch(`${baseUrl}/me`, {
      method: 'PATCH',
      headers: { ...authHeader(WORKER_ID, 'worker'), 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Demo Worker', phone: '+1 555 444 5555' }),
    });

    const res = await fetch(`${baseUrl}/workers/${WORKER_ID}`, {
      headers: authHeader(CUSTOMER_ID, 'customer'),
    });
    const body = await res.json();
    assert.equal(body.phone, undefined);
  });

  it('exposes the worker bio and skills in the public summary', async () => {
    await fetch(`${baseUrl}/me`, {
      method: 'PATCH',
      headers: { ...authHeader(WORKER_ID, 'worker'), 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Demo Worker',
        bio: 'Friendly neighborhood electrician.',
        skills: ['electrical'],
      }),
    });

    const single = await (
      await fetch(`${baseUrl}/workers/${WORKER_ID}`, {
        headers: authHeader(CUSTOMER_ID, 'customer'),
      })
    ).json();
    assert.equal(single.bio, 'Friendly neighborhood electrician.');
    assert.deepEqual(single.skills, ['electrical']);

    const list = await (
      await fetch(`${baseUrl}/workers`, { headers: authHeader(ADMIN_ID, 'admin') })
    ).json();
    const mine = list.find((worker) => worker.id === WORKER_ID);
    assert.equal(mine.bio, 'Friendly neighborhood electrician.');
    assert.deepEqual(mine.skills, ['electrical']);
  });
});
