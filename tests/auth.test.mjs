import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { verifyToken } from '../server/src/auth/jwt.ts';
import { createApp } from '../server/src/app.ts';

describe('POST /auth/login', () => {
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

  function login(email, password) {
    return globalThis.fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  }

  it('issues a verifiable token for valid credentials (200)', async () => {
    const res = await login('customer@homefix.test', 'customer-pass');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body.token, 'string');
    const principal = verifyToken(body.token);
    assert.equal(principal.role, 'customer');
    assert.equal(principal.id, '123e4567-e89b-12d3-a456-426614174000');
  });

  it('rejects a wrong password (401)', async () => {
    const res = await login('customer@homefix.test', 'wrong-pass');
    assert.equal(res.status, 401);
  });

  it('rejects an unknown email (401)', async () => {
    const res = await login('nobody@homefix.test', 'whatever');
    assert.equal(res.status, 401);
  });

  it('rejects an invalid payload (422)', async () => {
    const res = await globalThis.fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    assert.equal(res.status, 422);
  });
});
