import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { createDefaultResolvers } from '../server/src/services/notificationDelivery.ts';

describe('GET/PATCH /me/notification-preferences', () => {
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

  async function registerToken() {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `np-${randomUUID()}@homefix.test`,
        password: 'pass-12345',
        role: 'customer',
        displayName: 'Prefs User',
      }),
    });
    return (await res.json()).token;
  }

  function prefs(token, method = 'GET', body) {
    return fetch(`${baseUrl}/me/notification-preferences`, {
      method,
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  it('defaults to all channels on and updates one partially', async () => {
    const token = await registerToken();
    assert.deepEqual(await (await prefs(token)).json(), { email: true, push: true });

    const updated = await prefs(token, 'PATCH', { email: false });
    assert.equal(updated.status, 200);
    assert.deepEqual(await updated.json(), { email: false, push: true });

    assert.deepEqual(await (await prefs(token)).json(), { email: false, push: true });
  });

  it('rejects an empty update (422) and an unauthenticated request (401)', async () => {
    const token = await registerToken();
    assert.equal((await prefs(token, 'PATCH', {})).status, 422);
    assert.equal((await fetch(`${baseUrl}/me/notification-preferences`)).status, 401);
  });
});

describe('default recipient resolvers honor preferences', () => {
  // A fake user store so the resolver logic is tested directly, without depending
  // on any shared singleton or module identity.
  function usersWith(prefs) {
    const user = { email: 'u1@homefix.test', notifyEmail: true, notifyPush: true, ...prefs };
    return {
      findById: (id) => Promise.resolve(id === 'u1' ? user : undefined),
    };
  }
  const noTokens = { listTokens: () => Promise.resolve([]) };

  it('resolves the email when the user has email on', async () => {
    const resolvers = createDefaultResolvers(usersWith({ notifyEmail: true }), noTokens);
    assert.equal(await resolvers.email('u1'), 'u1@homefix.test');
  });

  it('resolves no email recipient when the user has email off', async () => {
    const resolvers = createDefaultResolvers(usersWith({ notifyEmail: false }), noTokens);
    assert.equal(await resolvers.email('u1'), undefined);
  });

  it('resolves no push recipient when the user has push off', async () => {
    const resolvers = createDefaultResolvers(usersWith({ notifyPush: false }), {
      listTokens: () => Promise.resolve(['device-token']),
    });
    assert.equal(await resolvers.push('u1'), undefined);
  });
});
