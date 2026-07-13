import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadEnv } from '../server/src/config/env.ts';
import { createHttpEmailSender, redactProviderError } from '../server/src/services/emailSender.ts';

const CONFIG = {
  apiUrl: 'https://email.example/v1/send',
  apiKey: 'secret-key',
  from: 'noreply@homefix.example',
};

const MESSAGE = {
  channel: 'email',
  userId: 'u-1',
  to: 'user@example.com',
  subject: 'HomeFix notification',
  body: 'A worker has accepted your request.',
};

describe('createHttpEmailSender', () => {
  it('posts the message to the provider with auth and a JSON body', async () => {
    const calls = [];
    const sender = createHttpEmailSender(CONFIG, (url, init) => {
      calls.push({ url, init });
      return Promise.resolve({ ok: true, status: 202 });
    });

    await sender(MESSAGE);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, CONFIG.apiUrl);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.authorization, 'Bearer secret-key');
    assert.equal(calls[0].init.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      from: 'noreply@homefix.example',
      to: 'user@example.com',
      subject: 'HomeFix notification',
      text: 'A worker has accepted your request.',
    });
  });

  it('throws on a non-2xx response (so delivery logs the failure)', async () => {
    const sender = createHttpEmailSender(CONFIG, () => Promise.resolve({ ok: false, status: 500 }));
    await assert.rejects(sender(MESSAGE), /500/);
  });

  // The status code alone is not actionable. The normal day-one failure is a 403 whose body
  // says exactly what is wrong; without it the operator is guessing at a number.
  it("carries the provider's explanation, not just the status", async () => {
    const sender = createHttpEmailSender(CONFIG, () =>
      Promise.resolve({
        ok: false,
        status: 403,
        body: '{"message":"The homefix.example domain is not verified."}',
      }),
    );
    await assert.rejects(sender(MESSAGE), /403.*domain is not verified/s);
  });
});

// SEC-0009 residual, now closed. A mail API echoes your request back at you when it dislikes
// it — and our request body is the password-reset mail, whose text IS the plaintext token.
describe('redactProviderError', () => {
  const resetMessage = {
    ...MESSAGE,
    body: 'Use this code to reset your password: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  };

  it('strips our own recipient and body when the provider echoes them back', () => {
    const echoed = `Invalid request: {"to":"user@example.com","text":"${resetMessage.body}"}`;
    const safe = redactProviderError(echoed, resetMessage);

    assert.doesNotMatch(safe, /user@example\.com/);
    assert.doesNotMatch(safe, /0123456789abcdef/);
    assert.match(safe, /Invalid request/);
  });

  it('strips an address the provider volunteered on its own', () => {
    const safe = redactProviderError('recipient victim@elsewhere.test is suppressed', MESSAGE);
    assert.doesNotMatch(safe, /victim@elsewhere\.test/);
    assert.match(safe, /is suppressed/);
  });

  it('strips a bare secret-shaped token even outside our body', () => {
    const token = 'a'.repeat(64);
    const safe = redactProviderError(`rejected token ${token}`, MESSAGE);
    assert.doesNotMatch(safe, new RegExp(token));
    assert.match(safe, /rejected token/);
  });

  it('keeps the part that is actually useful', () => {
    const safe = redactProviderError('The domain is not verified.', MESSAGE);
    assert.equal(safe, 'The domain is not verified.');
  });
});

describe('EMAIL_* env parsing', () => {
  it('are undefined when unset or empty', () => {
    const env = loadEnv({ EMAIL_API_URL: '', EMAIL_API_KEY: '', EMAIL_FROM: '' });
    assert.equal(env.EMAIL_API_URL, undefined);
    assert.equal(env.EMAIL_API_KEY, undefined);
    assert.equal(env.EMAIL_FROM, undefined);
  });

  it('parse valid values', () => {
    const env = loadEnv({
      EMAIL_API_URL: 'https://email.example/send',
      EMAIL_API_KEY: 'k',
      EMAIL_FROM: 'noreply@homefix.example',
    });
    assert.equal(env.EMAIL_API_URL, 'https://email.example/send');
    assert.equal(env.EMAIL_FROM, 'noreply@homefix.example');
  });

  // Every provider's copy-paste example is the display-name form. Rejecting it would take the
  // boot down over a value the operator had every reason to believe was correct.
  it('accepts the display-name sender form providers document', () => {
    const env = loadEnv({ EMAIL_FROM: 'HomeFix <noreply@homefix.example>' });
    assert.equal(env.EMAIL_FROM, 'HomeFix <noreply@homefix.example>');
  });

  it('reject an invalid url / email', () => {
    assert.throws(() => loadEnv({ EMAIL_API_URL: 'not-a-url' }));
    assert.throws(() => loadEnv({ EMAIL_FROM: 'not-an-email' }));
    assert.throws(() => loadEnv({ EMAIL_FROM: 'HomeFix <not-an-email>' }));
  });
});
