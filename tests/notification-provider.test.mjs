import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ProviderDelivery,
  formatOutboundMessage,
  loggingSender,
} from '../server/src/services/notificationProvider.ts';

function makeNotification(overrides = {}) {
  return {
    id: 'n1',
    userId: 'u1',
    message: 'A worker has accepted your request.',
    read: false,
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('formatOutboundMessage', () => {
  it('builds a channel/recipient/subject/body message, carrying the user id', () => {
    const msg = formatOutboundMessage('email', 'user@example.com', makeNotification());
    assert.deepEqual(msg, {
      channel: 'email',
      // SEC-0009: the user id travels with the message so a sender can identify the delivery
      // in a log without writing down `to` (PII) or `body` (which can carry a secret).
      userId: 'u1',
      to: 'user@example.com',
      subject: 'HomeFix notification',
      body: 'A worker has accepted your request.',
    });
  });
});

describe('ProviderDelivery', () => {
  it('resolves the recipient and hands a formatted message to the sender', async () => {
    const sent = [];
    const delivery = new ProviderDelivery(
      'email',
      () => Promise.resolve('user@example.com'),
      (message) => {
        sent.push(message);
        return Promise.resolve();
      },
    );
    await delivery.deliver(makeNotification());
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'user@example.com');
    assert.equal(sent[0].channel, 'email');
    assert.equal(sent[0].body, 'A worker has accepted your request.');
  });

  it('skips (does not call the sender) when no recipient is resolved', async () => {
    let called = false;
    const delivery = new ProviderDelivery(
      'push',
      () => Promise.resolve(undefined),
      () => {
        called = true;
        return Promise.resolve();
      },
    );
    await delivery.deliver(makeNotification());
    assert.equal(called, false);
  });

  it('skips on an empty recipient string', async () => {
    let called = false;
    const delivery = new ProviderDelivery(
      'email',
      () => Promise.resolve(''),
      () => {
        called = true;
        return Promise.resolve();
      },
    );
    await delivery.deliver(makeNotification());
    assert.equal(called, false);
  });
});

describe('loggingSender', () => {
  it('resolves without throwing (inert, no provider contacted)', async () => {
    await loggingSender({
      channel: 'email',
      userId: 'u1',
      to: 'user@example.com',
      subject: 'HomeFix notification',
      body: 'hi',
    });
  });

  // What it must NOT write is the point of SEC-0009 — locked in
  // `tests/notification-log-redaction.test.mjs`.
});
