import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { loadEnv } from '../server/src/config/env.ts';
import { registerUser } from '../server/src/services/authService.ts';
import {
  loggingSender,
  notificationLogFields,
} from '../server/src/services/notificationProvider.ts';

// SEC-0009 — regression test. The inert `loggingSender` (the sender EVERY deployment falls back
// to until EMAIL_API_URL is configured) used to print the recipient and the full message body:
//
//   [notify:email] to=victim@example.com :: Use this code to reset your password: 9f3a…
//
// The password-reset token is stored ONLY as a SHA-256 hash precisely because the plaintext is
// the secret. Printing it into the application log — next to the address it unlocks, in a log
// that gets shipped to a drain — hands account takeover to anyone who can read the logs.
//
// These tests assert the secret never reaches stdout, and that the production guard holds.

/** Run `fn` with stdout captured (and swallowed), returning everything written. */
async function captureStdout(fn) {
  const original = process.stdout.write.bind(process.stdout);
  const chunks = [];
  process.stdout.write = (chunk) => {
    chunks.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}

const RESET_BODY = 'Use this code to reset your password: 0123456789abcdef';

describe('SEC-0009: notification logs never carry the recipient or the body', () => {
  it('logs neither `to` nor `body` from the inert sender', async () => {
    const written = await captureStdout(() =>
      loggingSender({
        channel: 'email',
        userId: 'u-1',
        to: 'victim@example.com',
        subject: 'Reset your HomeFix password',
        body: RESET_BODY,
      }),
    );

    assert.doesNotMatch(written, /victim@example\.com/);
    assert.doesNotMatch(written, /0123456789abcdef/);
    assert.doesNotMatch(written, /Use this code/);
    // It must still say *something* — a delivery that logs nothing at all is not debuggable.
    assert.match(written, /u-1/);
    assert.match(written, /email/);
  });

  it('excludes `to` and `body` from the loggable fields by construction', () => {
    const fields = notificationLogFields({
      channel: 'email',
      userId: 'u-1',
      to: 'victim@example.com',
      subject: 's',
      body: RESET_BODY,
    });

    // Serialize rather than check keys: this also catches a recipient smuggled in via nesting.
    const serialized = JSON.stringify(fields);
    assert.doesNotMatch(serialized, /victim@example\.com/);
    assert.doesNotMatch(serialized, /Use this code/);
    assert.equal(fields['userId'], 'u-1');
    assert.equal(fields['bodyChars'], RESET_BODY.length);
  });
});

describe('SEC-0009: NOTIFY_LOG_BODY is refused in production', () => {
  const base = { NODE_ENV: 'production', JWT_SECRET: 'a-strong-production-secret-value' };

  it('rejects NOTIFY_LOG_BODY=true in production', () => {
    assert.throws(
      () => loadEnv({ ...base, NOTIFY_LOG_BODY: 'true' }),
      /NOTIFY_LOG_BODY/,
      'production must not be allowed to log reset tokens',
    );
  });

  it('accepts it outside production, and defaults to false everywhere', () => {
    assert.equal(
      loadEnv({ NODE_ENV: 'development', NOTIFY_LOG_BODY: 'true' }).NOTIFY_LOG_BODY,
      true,
    );
    assert.equal(loadEnv(base).NOTIFY_LOG_BODY, false);
    assert.equal(loadEnv({ NODE_ENV: 'development' }).NOTIFY_LOG_BODY, false);
  });
});

// The end-to-end proof: the real vulnerability path, with no sender override — exactly what a
// deployment without EMAIL_API_URL runs today.
describe('SEC-0009: POST /auth/forgot-password leaks nothing to the log', () => {
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

  it('writes neither the address nor the reset token to stdout', async () => {
    const email = `sec0009-${randomUUID()}@homefix.test`;
    await registerUser({
      email,
      password: 'orig-pass-123',
      displayName: 'T',
      role: 'customer',
    });

    const written = await captureStdout(async () => {
      const res = await fetch(`${baseUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      assert.equal(res.status, 204);
    });

    assert.doesNotMatch(written, new RegExp(email.replace(/[.@+]/g, '\\$&')));
    assert.doesNotMatch(written, /Use this code to reset your password/);
    // The token is 32 random bytes as hex. Any 64-hex run in the log is a leaked token.
    assert.doesNotMatch(written, /[0-9a-f]{64}/);
  });
});
