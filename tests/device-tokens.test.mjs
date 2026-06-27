import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetDeviceTokens } from '../server/src/services/deviceTokenService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('POST /me/device-tokens', () => {
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

  beforeEach(async () => {
    await resetDeviceTokens();
  });

  function register(token, id = CUSTOMER_ID) {
    return fetch(`${baseUrl}/me/device-tokens`, {
      method: 'POST',
      headers: headers(id, 'customer'),
      body: JSON.stringify({ token }),
    });
  }

  it('registers a device token for the signed-in user', async () => {
    const res = await register('ExponentPushToken[abc123]');
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.deepEqual(body.tokens, ['ExponentPushToken[abc123]']);
  });

  it("de-duplicates and accumulates a user's tokens", async () => {
    await register('tok-a');
    await register('tok-a');
    const res = await register('tok-b');
    const body = await res.json();
    assert.equal(body.tokens.length, 2);
    assert.ok(body.tokens.includes('tok-a'));
    assert.ok(body.tokens.includes('tok-b'));
  });

  it('rejects an empty token (422)', async () => {
    const res = await register('');
    assert.equal(res.status, 422);
  });

  it('returns 401 without authentication', async () => {
    const res = await fetch(`${baseUrl}/me/device-tokens`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'tok' }),
    });
    assert.equal(res.status, 401);
  });
});
