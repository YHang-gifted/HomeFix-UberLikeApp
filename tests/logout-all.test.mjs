import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';

describe('POST /auth/logout-all', () => {
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

  const post = (path, token) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token !== undefined ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({}),
    });

  const getMe = (token) =>
    fetch(`${baseUrl}/me`, { headers: { Authorization: `Bearer ${token}` } });

  async function registerUser() {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `logoutall-${randomUUID()}@homefix.test`,
        password: 'orig-pass-123',
        displayName: 'Test User',
        role: 'customer',
      }),
    });
    const { token } = await res.json();
    return token;
  }

  it('revokes all existing tokens and returns a fresh one for the current device', async () => {
    const token = await registerUser();
    assert.equal((await getMe(token)).status, 200);

    const res = await post('/auth/logout-all', token);
    assert.equal(res.status, 200);
    const { token: newToken } = await res.json();
    assert.equal(typeof newToken, 'string');

    assert.equal((await getMe(token)).status, 401); // old token revoked
    assert.equal((await getMe(newToken)).status, 200); // fresh token works
  });

  it('requires authentication (401)', async () => {
    assert.equal((await post('/auth/logout-all')).status, 401);
  });
});
