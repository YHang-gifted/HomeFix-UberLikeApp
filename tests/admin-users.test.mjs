import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';

const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('GET /admin/users', () => {
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

  it('lists every account to an admin with status and role', async () => {
    const res = await fetch(`${baseUrl}/admin/users`, { headers: headers(ADMIN_ID, 'admin') });
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.ok(Array.isArray(body) && body.length >= 3);
    const admin = body.find((u) => u.id === ADMIN_ID);
    assert.equal(admin?.role, 'admin');
    assert.equal(admin?.status, 'active');
    assert.equal(admin?.email, 'admin@homefix.test');
    assert.equal(typeof admin?.displayName, 'string');
  });

  it('forbids a non-admin (403) and an unauthenticated request (401)', async () => {
    assert.equal(
      (await fetch(`${baseUrl}/admin/users`, { headers: headers(CUSTOMER_ID, 'customer') })).status,
      403,
    );
    assert.equal((await fetch(`${baseUrl}/admin/users`)).status, 401);
  });
});
