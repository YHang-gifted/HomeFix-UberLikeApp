import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';

describe('POST /auth/register', () => {
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

  function register(body) {
    return fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('creates a customer account, returns a token, and lets them log in', async () => {
    const email = `newuser-${String(Date.now())}@homefix.test`;
    const res = await register({ email, password: 'sup3rsecret', displayName: 'New User' });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(typeof body.token, 'string');

    const login = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'sup3rsecret' }),
    });
    assert.equal(login.status, 200);
    assert.equal(typeof (await login.json()).token, 'string');
  });

  it('defaults to the customer role and can create a worker', async () => {
    const worker = await register({
      email: `worker-${String(Date.now())}@homefix.test`,
      password: 'sup3rsecret',
      displayName: 'New Worker',
      role: 'worker',
    });
    assert.equal(worker.status, 201);
  });

  it('rejects a duplicate email (409)', async () => {
    const email = `dupe-${String(Date.now())}@homefix.test`;
    await register({ email, password: 'sup3rsecret', displayName: 'First' });
    const second = await register({ email, password: 'sup3rsecret', displayName: 'Second' });
    assert.equal(second.status, 409);
  });

  it('rejects a short password (422)', async () => {
    const res = await register({
      email: `short-${String(Date.now())}@homefix.test`,
      password: 'short',
      displayName: 'Short Pass',
    });
    assert.equal(res.status, 422);
  });

  it('refuses to self-register an admin (422)', async () => {
    const res = await register({
      email: `admin-${String(Date.now())}@homefix.test`,
      password: 'sup3rsecret',
      displayName: 'Sneaky Admin',
      role: 'admin',
    });
    assert.equal(res.status, 422);
  });

  it('rejects an invalid email (422)', async () => {
    const res = await register({
      email: 'not-an-email',
      password: 'sup3rsecret',
      displayName: 'X',
    });
    assert.equal(res.status, 422);
  });
});
