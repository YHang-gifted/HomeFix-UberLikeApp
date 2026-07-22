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
import { requestPasswordReset } from '../server/src/services/passwordResetService.ts';

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

/** Run `fn` with `stream` captured (and swallowed), returning everything written to it. */
async function captureStream(stream, fn) {
  const original = stream.write.bind(stream);
  const chunks = [];
  stream.write = (chunk) => {
    chunks.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  };
  try {
    await fn();
  } finally {
    stream.write = original;
  }
  return chunks.join('');
}

/** `logger.info` goes to stdout. */
const captureStdout = (fn) => captureStream(process.stdout, fn);
/** `logger.error` goes to stderr. */
const captureStderr = (fn) => captureStream(process.stderr, fn);

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
  // METRICS_TOKEN is required in production too (SEC-0011), so include it in the baseline that is
  // expected to boot successfully.
  const base = {
    NODE_ENV: 'production',
    JWT_SECRET: 'a-strong-production-secret-value',
    METRICS_TOKEN: 'a-metrics-scrape-token',
  };

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

// slice 182. A failing mail provider must be LOUD (a bare `catch {}` meant a 403 for an
// unverified sending domain produced a cheerful 204 and no trace anywhere) — but loud without
// leaking. The sender is injectable, so the guarantee has to hold wherever the error came from.
describe('a failed password-reset email is logged, without the secret', () => {
  it('logs the reason but neither the address nor the token', async () => {
    const email = `sec0009-fail-${randomUUID()}@homefix.test`;
    await registerUser({
      email,
      password: 'orig-pass-123',
      displayName: 'T',
      role: 'customer',
    });

    let sentBody;
    const written = await captureStderr(() =>
      requestPasswordReset(email, {
        sender: (message) => {
          sentBody = message.body;
          // A provider that echoes the whole request back in its error — the realistic worst
          // case, and the one that would have put the token in the log.
          return Promise.reject(
            new Error(`422 Unprocessable: {"to":"${message.to}","text":"${message.body}"}`),
          );
        },
      }),
    );

    // The mail really did carry the token — so the log had something to leak.
    assert.match(sentBody, /Use this code to reset your password: [0-9a-f]{64}/);

    assert.match(written, /Password-reset email failed to send/);
    assert.match(written, /422 Unprocessable/); // the operator can act on this
    assert.doesNotMatch(written, new RegExp(email.replace(/[.@+]/g, '\\$&')));
    assert.doesNotMatch(written, /[0-9a-f]{64}/);
    assert.doesNotMatch(written, /Use this code/);
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

  // A DEMO-SEEDED user, deliberately — NOT one created via `registerUser` from this test.
  // Under tsx the test's module graph and the app's are separate instances, so a user this
  // file registers directly is invisible to the app's repository behind HTTP. The endpoint
  // returns 204 for an unknown address too (it must not disclose whether an account exists),
  // so such a test would pass while doing NOTHING — no token minted, nothing to leak.
  // A seeded user exists in the app's own graph, and the login below proves it.
  const EMAIL = 'customer@homefix.test';

  it('the account really exists (so the leak test below is not vacuous)', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: 'customer-pass' }),
    });
    assert.equal(res.status, 200);
  });

  it('writes neither the address nor the reset token to stdout', async () => {
    const written = await captureStdout(async () => {
      const res = await fetch(`${baseUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: EMAIL }),
      });
      assert.equal(res.status, 204);
    });

    assert.doesNotMatch(written, /customer@homefix\.test/);
    assert.doesNotMatch(written, /Use this code to reset your password/);
    // The token is 32 random bytes as hex. Any 64-hex run in the log is a leaked token.
    assert.doesNotMatch(written, /[0-9a-f]{64}/);
  });
});
