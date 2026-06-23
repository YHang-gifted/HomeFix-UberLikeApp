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
    assert.ok(body.every((worker) => worker.passwordHash === undefined));
  });

  it('forbids a non-admin (403)', async () => {
    const res = await fetch(`${baseUrl}/workers`, { headers: authHeader(CUSTOMER_ID, 'customer') });
    assert.equal(res.status, 403);
  });

  it('returns 401 without authentication', async () => {
    const res = await fetch(`${baseUrl}/workers`);
    assert.equal(res.status, 401);
  });
});
