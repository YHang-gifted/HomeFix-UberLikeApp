import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken, verifyToken } from '../server/src/auth/jwt.ts';

const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';

function headers(token) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${token}` };
}

function roleHeaders(id, role) {
  return headers(signToken({ id, role }));
}

describe('Admin suspend / reinstate', () => {
  let server;
  let baseUrl;
  let victimId;
  const victimEmail = 'suspend-victim@homefix.test';
  const victimPassword = 'victim-pass-123';

  before(async () => {
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    const res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: victimEmail,
        password: victimPassword,
        role: 'customer',
        displayName: 'Suspend Victim',
      }),
    });
    const body = await res.json();
    victimId = verifyToken(body.token).principal.id;
  });

  after(async () => {
    await new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  function suspend(id, admin = roleHeaders(ADMIN_ID, 'admin')) {
    return fetch(`${baseUrl}/admin/users/${id}/suspend`, { method: 'POST', headers: admin });
  }

  function reinstate(id) {
    return fetch(`${baseUrl}/admin/users/${id}/reinstate`, {
      method: 'POST',
      headers: roleHeaders(ADMIN_ID, 'admin'),
    });
  }

  function login(email, password) {
    return fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  }

  it('suspends an account: blocks sign-in, rejects live tokens, then reinstate restores it', async () => {
    const suspended = await suspend(victimId);
    assert.equal(suspended.status, 200);
    assert.deepEqual(await suspended.json(), { id: victimId, status: 'suspended' });

    // Sign-in with the correct password is refused with 403.
    assert.equal((await login(victimEmail, victimPassword)).status, 403);

    // A token whose version matches the post-suspension user is still rejected by
    // the status gate in authenticate (defence in depth beyond the version bump).
    const freshToken = signToken({ id: victimId, role: 'customer' }, 1);
    const guarded = await fetch(`${baseUrl}/service-requests`, { headers: headers(freshToken) });
    assert.equal(guarded.status, 403);

    // Reinstating returns the account to active and sign-in works again.
    const back = await reinstate(victimId);
    assert.equal(back.status, 200);
    assert.deepEqual(await back.json(), { id: victimId, status: 'active' });
    assert.equal((await login(victimEmail, victimPassword)).status, 200);
  });

  it('forbids a non-admin from suspending (403)', async () => {
    const res = await suspend(victimId, roleHeaders(CUSTOMER_ID, 'customer'));
    assert.equal(res.status, 403);
  });

  it('refuses an admin suspending their own account (400)', async () => {
    const res = await suspend(ADMIN_ID);
    assert.equal(res.status, 400);
  });

  it('is idempotent when suspending an already-suspended account', async () => {
    assert.equal((await suspend(victimId)).status, 200);
    const again = await suspend(victimId);
    assert.equal(again.status, 200);
    assert.deepEqual(await again.json(), { id: victimId, status: 'suspended' });
    await reinstate(victimId);
  });

  it('rejects a non-uuid id (422) and an unauthenticated request (401)', async () => {
    const bad = await fetch(`${baseUrl}/admin/users/not-a-uuid/suspend`, {
      method: 'POST',
      headers: roleHeaders(ADMIN_ID, 'admin'),
    });
    assert.equal(bad.status, 422);

    const anon = await fetch(`${baseUrl}/admin/users/${victimId}/suspend`, { method: 'POST' });
    assert.equal(anon.status, 401);
  });
});
