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

  // slice 186: the failure used to be a perfect silence. The token call threw on every device
  // (no EAS projectId was configured, so it could never succeed), the `catch` discarded the
  // error, and App.tsx discarded the outcome. Push had never worked once, and nothing anywhere
  // said so. Swallowing the failure is right — it must not block sign-in — but the reason has
  // to survive, or the feature stays broken indefinitely.
  it('reports WHY the provider failed, without throwing', async () => {
    const outcome = await registerForPush(
      { getToken: () => Promise.reject(new Error('no EAS projectId')) },
      () => Promise.resolve(),
    );
    assert.deepEqual(outcome, {
      ok: false,
      reason: 'error',
      detail: 'no EAS projectId',
    });
  });

  it('reports WHY registration failed, without throwing', async () => {
    const outcome = await registerForPush({ getToken: () => Promise.resolve('tok') }, () =>
      Promise.reject(new Error('network')),
    );
    assert.deepEqual(outcome, { ok: false, reason: 'error', detail: 'network' });
  });

  it('survives a non-Error rejection', async () => {
    const outcome = await registerForPush(
      // eslint-disable-next-line prefer-promise-reject-errors
      { getToken: () => Promise.reject('a string') },
      () => Promise.resolve(),
    );
    assert.deepEqual(outcome, { ok: false, reason: 'error', detail: 'Unknown error' });
  });
});
