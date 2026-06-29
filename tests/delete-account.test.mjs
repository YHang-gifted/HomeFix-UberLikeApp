import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';

function authHeaders(token) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${token}` };
}

describe('POST /auth/delete-account (self-service soft delete)', () => {
  let server;
  let baseUrl;
  let victimToken;
  const victimEmail = 'delete-victim@homefix.test';
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
        displayName: 'Delete Victim',
      }),
    });
    victimToken = (await res.json()).token;
  });

  after(async () => {
    await new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  function deleteAccount(token, body) {
    return fetch(`${baseUrl}/auth/delete-account`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    });
  }

  function login() {
    return fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: victimEmail, password: victimPassword }),
    });
  }

  it('rejects a wrong current password (401) and leaves the account usable', async () => {
    const res = await deleteAccount(victimToken, { currentPassword: 'not-my-password' });
    assert.equal(res.status, 401);
    assert.equal((await login()).status, 200);
  });

  it('rejects a missing payload (422) and an unauthenticated request (401)', async () => {
    assert.equal((await deleteAccount(victimToken, {})).status, 422);

    const anon = await fetch(`${baseUrl}/auth/delete-account`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: victimPassword }),
    });
    assert.equal(anon.status, 401);
  });

  it('soft-deletes the account: blocks sign-in and revokes the live token', async () => {
    const res = await deleteAccount(victimToken, { currentPassword: victimPassword });
    assert.equal(res.status, 204);

    // The original email no longer resolves to an account.
    assert.equal((await login()).status, 401);

    // The token held before deletion is now rejected (token_version bumped).
    const guarded = await fetch(`${baseUrl}/service-requests`, {
      headers: authHeaders(victimToken),
    });
    assert.equal(guarded.status, 401);
  });
});
