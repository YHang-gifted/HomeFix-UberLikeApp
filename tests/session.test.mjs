import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { clearSession, persistSession, restoreSession } from '../app/src/auth/session.ts';
import { ApiClient } from '../app/src/services/apiClient.ts';
import { signToken } from '../server/src/auth/jwt.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';

function memoryStore(initial = null) {
  let value = initial;
  return {
    get: () => Promise.resolve(value),
    set: (token) => {
      value = token;
      return Promise.resolve();
    },
    clear: () => {
      value = null;
      return Promise.resolve();
    },
    peek: () => value,
  };
}

describe('session', () => {
  let client;

  beforeEach(() => {
    client = new ApiClient('http://example.test');
  });

  it('restores a stored valid token', async () => {
    const token = signToken({ id: CUSTOMER_ID, role: 'customer' });
    const store = memoryStore(token);

    const restored = await restoreSession(store, client);
    assert.equal(restored, true);
    assert.deepEqual(client.getPrincipal(), { id: CUSTOMER_ID, role: 'customer' });
  });

  it('reports signed-out when there is no stored token', async () => {
    const store = memoryStore(null);
    assert.equal(await restoreSession(store, client), false);
    assert.equal(client.getPrincipal(), null);
  });

  it('clears a malformed stored token and reports signed-out', async () => {
    const store = memoryStore('garbage-token');
    assert.equal(await restoreSession(store, client), false);
    assert.equal(store.peek(), null);
    assert.equal(client.getPrincipal(), null);
  });

  it('persists a token to the store and the client', async () => {
    const token = signToken({ id: CUSTOMER_ID, role: 'customer' });
    const store = memoryStore(null);

    await persistSession(store, client, token);
    assert.equal(store.peek(), token);
    assert.deepEqual(client.getPrincipal(), { id: CUSTOMER_ID, role: 'customer' });
  });

  it('clears the session from the store and the client', async () => {
    const token = signToken({ id: CUSTOMER_ID, role: 'customer' });
    const store = memoryStore(token);
    await restoreSession(store, client);

    await clearSession(store, client);
    assert.equal(store.peek(), null);
    assert.equal(client.getPrincipal(), null);
  });
});
