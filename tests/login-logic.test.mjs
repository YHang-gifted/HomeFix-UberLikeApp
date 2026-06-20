import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { ApiClient } from '../app/src/services/apiClient.ts';
import { performLogin } from '../app/src/features/auth/loginAction.ts';
import { validateLoginForm } from '../app/src/features/auth/loginForm.ts';
import { createApp } from '../server/src/app.ts';

describe('validateLoginForm', () => {
  it('returns no errors for valid input', () => {
    assert.deepEqual(validateLoginForm({ email: 'a@b.com', password: 'secret' }), {});
  });

  it('flags an invalid email', () => {
    const errors = validateLoginForm({ email: 'nope', password: 'secret' });
    assert.equal(typeof errors.email, 'string');
    assert.equal(errors.password, undefined);
  });

  it('flags an empty password', () => {
    const errors = validateLoginForm({ email: 'a@b.com', password: '' });
    assert.equal(typeof errors.password, 'string');
  });
});

describe('performLogin', () => {
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

  it('returns ok with a token for valid credentials', async () => {
    const result = await performLogin(
      new ApiClient(baseUrl),
      'customer@homefix.test',
      'customer-pass',
    );
    assert.equal(result.ok, true);
    assert.ok(result.ok && result.token.length > 0);
  });

  it('reports incorrect credentials on a wrong password', async () => {
    const result = await performLogin(
      new ApiClient(baseUrl),
      'customer@homefix.test',
      'wrong-pass',
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.message, 'Incorrect email or password');
  });

  it('reports a connection problem when the server is unreachable', async () => {
    const result = await performLogin(
      new ApiClient('http://127.0.0.1:1'),
      'customer@homefix.test',
      'customer-pass',
    );
    assert.equal(result.ok, false);
    assert.equal(
      result.ok === false && result.message,
      'Could not reach the server. Please try again.',
    );
  });
});
