import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadEnv } from '../server/src/config/env.ts';
import { createExpoPushSender } from '../server/src/services/pushSender.ts';

const CONFIG = { apiUrl: 'https://exp.host/--/api/v2/push/send' };

const MESSAGE = {
  channel: 'push',
  to: 'ExponentPushToken[abc123]',
  subject: 'HomeFix notification',
  body: 'A worker has accepted your request.',
};

describe('createExpoPushSender', () => {
  it('posts a { to, title, body } payload to the push endpoint', async () => {
    const calls = [];
    const sender = createExpoPushSender(CONFIG, (url, init) => {
      calls.push({ url, init });
      return Promise.resolve({ ok: true, status: 200 });
    });

    await sender(MESSAGE);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, CONFIG.apiUrl);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      to: 'ExponentPushToken[abc123]',
      title: 'HomeFix notification',
      body: 'A worker has accepted your request.',
    });
  });

  it('throws on a non-2xx response', async () => {
    const sender = createExpoPushSender(CONFIG, () => Promise.resolve({ ok: false, status: 400 }));
    await assert.rejects(sender(MESSAGE), /400/);
  });

  it('throws when a 200 response reports a failed push ticket', async () => {
    const sender = createExpoPushSender(CONFIG, () =>
      Promise.resolve({
        ok: true,
        status: 200,
        data: { data: [{ status: 'error', message: 'DeviceNotRegistered' }] },
      }),
    );
    await assert.rejects(sender(MESSAGE), /DeviceNotRegistered/);
  });

  it('handles a single ticket object (not an array)', async () => {
    const sender = createExpoPushSender(CONFIG, () =>
      Promise.resolve({
        ok: true,
        status: 200,
        data: { data: { status: 'error', message: 'boom' } },
      }),
    );
    await assert.rejects(sender(MESSAGE), /boom/);
  });

  it('resolves when the ticket status is ok', async () => {
    const sender = createExpoPushSender(CONFIG, () =>
      Promise.resolve({
        ok: true,
        status: 200,
        data: { data: [{ status: 'ok', id: 'receipt-1' }] },
      }),
    );
    await sender(MESSAGE);
  });
});

describe('PUSH_API_URL env parsing', () => {
  it('is undefined when unset or empty', () => {
    assert.equal(loadEnv({ PUSH_API_URL: '' }).PUSH_API_URL, undefined);
    assert.equal(loadEnv({}).PUSH_API_URL, undefined);
  });

  it('parses a valid url and rejects an invalid one', () => {
    assert.equal(
      loadEnv({ PUSH_API_URL: 'https://exp.host/--/api/v2/push/send' }).PUSH_API_URL,
      'https://exp.host/--/api/v2/push/send',
    );
    assert.throws(() => loadEnv({ PUSH_API_URL: 'not-a-url' }));
  });
});
