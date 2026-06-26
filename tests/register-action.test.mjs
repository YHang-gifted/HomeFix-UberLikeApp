import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { performRegister } from '../app/src/features/auth/registerAction.ts';
import { ApiError } from '../app/src/services/apiClient.ts';

const INPUT = {
  email: 'a@b.co',
  password: 'sup3rsecret',
  displayName: 'Jo',
  role: 'customer',
};

function clientThatRegisters(impl) {
  return { register: impl };
}

describe('performRegister', () => {
  it('returns the token on success', async () => {
    const client = clientThatRegisters(() => Promise.resolve('tok-123'));
    const outcome = await performRegister(client, INPUT);
    assert.deepEqual(outcome, { ok: true, token: 'tok-123' });
  });

  it('maps a 409 to a duplicate-email message', async () => {
    const client = clientThatRegisters(() => Promise.reject(new ApiError(409, 'dup')));
    const outcome = await performRegister(client, INPUT);
    assert.equal(outcome.ok, false);
    assert.match(outcome.message, /already exists/);
  });

  it('maps a 422 to a check-your-details message', async () => {
    const client = clientThatRegisters(() => Promise.reject(new ApiError(422, 'bad')));
    const outcome = await performRegister(client, INPUT);
    assert.equal(outcome.ok, false);
    assert.match(outcome.message, /check your details/);
  });

  it('maps other failures to a generic message', async () => {
    const client = clientThatRegisters(() => Promise.reject(new Error('network')));
    const outcome = await performRegister(client, INPUT);
    assert.equal(outcome.ok, false);
    assert.match(outcome.message, /Could not reach the server/);
  });
});
