import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { userRepository } from '../server/src/repositories/userRepository.ts';
import { defaultRecipientResolvers } from '../server/src/services/notificationDelivery.ts';

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
  it('resolves no email recipient once the user turns email off', async () => {
    // Use a throwaway user so we never mutate shared demo state.
    const id = randomUUID();
    await userRepository.create({
      id,
      email: `res-${id}@homefix.test`,
      role: 'customer',
      displayName: 'Resolver User',
      passwordHash: 'h',
      tokenVersion: 0,
      status: 'active',
      notifyEmail: true,
      notifyPush: true,
    });

    assert.equal(await defaultRecipientResolvers.email(id), `res-${id}@homefix.test`);

    await userRepository.updateNotificationPreferences(id, { email: false });
    assert.equal(await defaultRecipientResolvers.email(id), undefined);
  });
});
