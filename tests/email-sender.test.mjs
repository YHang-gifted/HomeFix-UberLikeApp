import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadEnv } from '../server/src/config/env.ts';
import { createHttpEmailSender } from '../server/src/services/emailSender.ts';

const CONFIG = {
  apiUrl: 'https://email.example/v1/send',
  apiKey: 'secret-key',
  from: 'noreply@homefix.example',
};

const MESSAGE = {
  channel: 'email',
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

  it('reject an invalid url / email', () => {
    assert.throws(() => loadEnv({ EMAIL_API_URL: 'not-a-url' }));
    assert.throws(() => loadEnv({ EMAIL_FROM: 'not-an-email' }));
  });
});
