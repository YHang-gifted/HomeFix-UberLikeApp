import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('profile (/me)', () => {
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

  it('returns the authenticated user profile', async () => {
    const res = await fetch(`${baseUrl}/me`, { headers: headers(CUSTOMER_ID, 'customer') });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, CUSTOMER_ID);
    assert.equal(body.email, 'customer@homefix.test');
    assert.equal(body.role, 'customer');
    assert.ok(typeof body.displayName === 'string' && body.displayName.length > 0);
    assert.equal(body.passwordHash, undefined);
  });

  it('updates the display name', async () => {
    const res = await fetch(`${baseUrl}/me`, {
      method: 'PATCH',
      headers: headers(WORKER_ID, 'worker'),
      body: JSON.stringify({ displayName: 'Wendy the Welder' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.displayName, 'Wendy the Welder');

    const after = await fetch(`${baseUrl}/me`, { headers: headers(WORKER_ID, 'worker') });
    const afterBody = await after.json();
    assert.equal(afterBody.displayName, 'Wendy the Welder');
  });

  it('rejects an empty display name (422)', async () => {
    const res = await fetch(`${baseUrl}/me`, {
      method: 'PATCH',
      headers: headers(CUSTOMER_ID, 'customer'),
      body: JSON.stringify({ displayName: '' }),
    });
    assert.equal(res.status, 422);
  });

  it('returns 401 without authentication', async () => {
    const res = await fetch(`${baseUrl}/me`);
    assert.equal(res.status, 401);
  });
});
