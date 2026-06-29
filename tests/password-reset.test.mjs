import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { login, registerUser } from '../server/src/services/authService.ts';
import {
  requestPasswordReset,
  resetPassword,
  resetPasswordResetTokens,
} from '../server/src/services/passwordResetService.ts';

describe('password reset', () => {
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
    await resetPasswordResetTokens();
  });

  const post = (path, body) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  // Register a fresh user and request a reset, capturing the emailed token.
  async function requestReset(now) {
    const email = `reset-${randomUUID()}@homefix.test`;
    await registerUser({ email, password: 'orig-pass-123', displayName: 'T', role: 'customer' });
    let captured;
    await requestPasswordReset(email, {
      sender: (message) => {
        captured = message;
        return Promise.resolve();
      },
      ...(now !== undefined ? { now } : {}),
    });
    const token = captured?.body.match(/reset your password: (\w+)/)?.[1];
    return { email, token, captured };
  }

  it('emails a reset token and lets the user reset their password', async () => {
    const { email, token, captured } = await requestReset();
    assert.equal(captured.to, email);
    assert.equal(captured.subject, 'Reset your HomeFix password');
    assert.equal(typeof token, 'string');

    await resetPassword(token, 'brand-new-pass');
    assert.ok((await login({ email, password: 'brand-new-pass' })).token);
    await assert.rejects(() => login({ email, password: 'orig-pass-123' }));
  });

  it('does not email or reveal an unknown account', async () => {
    let called = false;
    await requestPasswordReset('nobody@homefix.test', {
      sender: () => {
        called = true;
        return Promise.resolve();
      },
    });
    assert.equal(called, false);
  });

  it('rejects an invalid token (400)', async () => {
    await assert.rejects(
      () => resetPassword('not-a-real-token', 'whatever-123'),
      (error) => error.statusCode === 400,
    );
  });

  it('rejects an expired token (400)', async () => {
    const t0 = new Date('2026-01-01T00:00:00.000Z');
    const { token } = await requestReset(() => t0);
    const twoHoursLater = new Date('2026-01-01T02:00:00.000Z');
    await assert.rejects(
      () => resetPassword(token, 'whatever-123', { now: () => twoHoursLater }),
      (error) => error.statusCode === 400,
    );
  });

  it('rejects a reused token (400)', async () => {
    const { token } = await requestReset();
    await resetPassword(token, 'first-new-pass');
    await assert.rejects(
      () => resetPassword(token, 'second-new-pass'),
      (error) => error.statusCode === 400,
    );
  });

  it('POST /auth/forgot-password returns 204 for any email (no account disclosure)', async () => {
    assert.equal(
      (await post('/auth/forgot-password', { email: 'customer@homefix.test' })).status,
      204,
    );
    assert.equal(
      (await post('/auth/forgot-password', { email: 'nobody@homefix.test' })).status,
      204,
    );
  });

  it('POST /auth/reset-password rejects an invalid token (400) and a bad payload (422)', async () => {
    assert.equal(
      (await post('/auth/reset-password', { token: 'bogus', newPassword: 'newpass12' })).status,
      400,
    );
    assert.equal((await post('/auth/reset-password', { token: 'x' })).status, 422);
  });
});
