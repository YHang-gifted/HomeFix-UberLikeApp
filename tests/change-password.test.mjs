import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';

const ORIGINAL = 'orig-pass-123';
const NEXT = 'new-pass-456';

describe('POST /auth/change-password', () => {
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

  const post = (path, body, token) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token !== undefined ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  // A fresh account each time so we never mutate the shared demo users.
  async function registerUser() {
    const email = `changepw-${randomUUID()}@homefix.test`;
    const res = await post('/auth/register', {
      email,
      password: ORIGINAL,
      displayName: 'Test User',
      role: 'customer',
    });
    const { token } = await res.json();
    return { email, token };
  }

  const login = (email, password) => post('/auth/login', { email, password });
  const getMe = (token) =>
    fetch(`${baseUrl}/me`, { headers: { Authorization: `Bearer ${token}` } });

  it('changes the password, returns a fresh token, and revokes the old one', async () => {
    const { email, token } = await registerUser();

    const changed = await post(
      '/auth/change-password',
      { currentPassword: ORIGINAL, newPassword: NEXT },
      token,
    );
    assert.equal(changed.status, 200);
    const { token: newToken } = await changed.json();
    assert.equal(typeof newToken, 'string');

    // The new password logs in; the old one no longer does.
    assert.equal((await login(email, NEXT)).status, 200);
    assert.equal((await login(email, ORIGINAL)).status, 401);

    // Token revocation: the pre-change token is rejected; the fresh one works.
    assert.equal((await getMe(token)).status, 401);
    assert.equal((await getMe(newToken)).status, 200);
  });

  it('rejects a wrong current password (401) and leaves the password unchanged', async () => {
    const { email, token } = await registerUser();

    const res = await post(
      '/auth/change-password',
      { currentPassword: 'not-my-password', newPassword: NEXT },
      token,
    );
    assert.equal(res.status, 401);
    assert.equal((await login(email, ORIGINAL)).status, 200);
  });

  it('rejects a too-short new password (422)', async () => {
    const { token } = await registerUser();
    const res = await post(
      '/auth/change-password',
      { currentPassword: ORIGINAL, newPassword: 'short' },
      token,
    );
    assert.equal(res.status, 422);
  });

  it('requires authentication (401)', async () => {
    const res = await post('/auth/change-password', {
      currentPassword: ORIGINAL,
      newPassword: NEXT,
    });
    assert.equal(res.status, 401);
  });
});
