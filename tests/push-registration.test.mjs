import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { registerForPush } from '../app/src/features/notifications/pushRegistration.ts';

describe('registerForPush', () => {
  it('registers the token from the provider', async () => {
    const registered = [];
    const outcome = await registerForPush(
      { getToken: () => Promise.resolve('ExponentPushToken[abc]') },
      (token) => {
        registered.push(token);
        return Promise.resolve();
      },
    );
    assert.deepEqual(outcome, { ok: true, token: 'ExponentPushToken[abc]' });
    assert.deepEqual(registered, ['ExponentPushToken[abc]']);
  });

  it('does not register when there is no token', async () => {
    let called = false;
    const outcome = await registerForPush({ getToken: () => Promise.resolve(null) }, () => {
      called = true;
      return Promise.resolve();
    });
    assert.deepEqual(outcome, { ok: false, reason: 'no-token' });
    assert.equal(called, false);
  });

  it('reports an error without throwing when the provider fails', async () => {
    const outcome = await registerForPush(
      { getToken: () => Promise.reject(new Error('permission denied')) },
      () => Promise.resolve(),
    );
    assert.deepEqual(outcome, { ok: false, reason: 'error' });
  });

  it('reports an error without throwing when registration fails', async () => {
    const outcome = await registerForPush({ getToken: () => Promise.resolve('tok') }, () =>
      Promise.reject(new Error('network')),
    );
    assert.deepEqual(outcome, { ok: false, reason: 'error' });
  });
});
