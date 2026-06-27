import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CompositeDelivery,
  RecordingDelivery,
  buildDelivery,
} from '../server/src/services/notificationDelivery.ts';

function makeNotification(overrides = {}) {
  return {
    id: '623e4567-e89b-12d3-a456-426614174000',
    userId: '123e4567-e89b-12d3-a456-426614174000',
    message: 'A worker has accepted your request.',
    read: false,
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('RecordingDelivery', () => {
  it('records the channel, recipient, message, and request id', async () => {
    const delivery = new RecordingDelivery('email');
    await delivery.deliver(makeNotification({ requestId: 'r1' }));
    assert.deepEqual(delivery.sent, [
      {
        channel: 'email',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        message: 'A worker has accepted your request.',
        requestId: 'r1',
      },
    ]);
  });

  it('omits requestId when absent and clears', async () => {
    const delivery = new RecordingDelivery('push');
    await delivery.deliver(makeNotification());
    assert.equal('requestId' in delivery.sent[0], false);
    delivery.clear();
    assert.equal(delivery.sent.length, 0);
  });
});

describe('CompositeDelivery', () => {
  it('fans a notification out to every channel', async () => {
    const email = new RecordingDelivery('email');
    const push = new RecordingDelivery('push');
    const composite = new CompositeDelivery([email, push]);
    await composite.deliver(makeNotification());
    assert.equal(email.sent.length, 1);
    assert.equal(push.sent.length, 1);
  });

  it('isolates a failing channel so the others still deliver', async () => {
    const flaky = {
      deliver: () => Promise.reject(new Error('provider down')),
    };
    const push = new RecordingDelivery('push');
    const composite = new CompositeDelivery([flaky, push]);
    // Must not throw even though one channel rejects.
    await composite.deliver(makeNotification());
    assert.equal(push.sent.length, 1);
  });
});

describe('buildDelivery', () => {
  function recordingSender() {
    const sent = [];
    return {
      sent,
      send: (message) => {
        sent.push(message);
        return Promise.resolve();
      },
    };
  }

  const resolvers = {
    email: () => Promise.resolve('user@example.com'),
    push: () => Promise.resolve('device-token'),
  };

  function sendersFor(send) {
    return { email: send, push: send };
  }

  it('enables only the configured known channels', async () => {
    const { sent, send } = recordingSender();
    await buildDelivery(['email'], { resolvers, senders: sendersFor(send) }).deliver(
      makeNotification(),
    );
    assert.equal(sent.length, 1);
    assert.equal(sent[0].channel, 'email');
  });

  it('fans out to both channels when both are configured', async () => {
    const { sent, send } = recordingSender();
    await buildDelivery(['email', 'push'], { resolvers, senders: sendersFor(send) }).deliver(
      makeNotification(),
    );
    assert.deepEqual(sent.map((m) => m.channel).sort(), ['email', 'push']);
  });

  it('ignores unknown channel names', async () => {
    const { sent, send } = recordingSender();
    await buildDelivery(['sms', 'carrier-pigeon'], {
      resolvers,
      senders: sendersFor(send),
    }).deliver(makeNotification());
    assert.equal(sent.length, 0);
  });

  it('delivers to nothing (no throw) when no channels are configured', async () => {
    const { sent, send } = recordingSender();
    await buildDelivery([], { resolvers, senders: sendersFor(send) }).deliver(makeNotification());
    assert.equal(sent.length, 0);
  });

  it('skips a channel whose recipient cannot be resolved', async () => {
    const { sent, send } = recordingSender();
    const noRecipient = { email: () => Promise.resolve(undefined) };
    await buildDelivery(['email'], { resolvers: noRecipient, senders: sendersFor(send) }).deliver(
      makeNotification(),
    );
    assert.equal(sent.length, 0);
  });

  it('uses the configured email sender and the inert default for unconfigured channels', async () => {
    const emailSent = [];
    await buildDelivery(['email', 'push'], {
      resolvers,
      senders: {
        email: (message) => {
          emailSent.push(message);
          return Promise.resolve();
        },
      },
    }).deliver(makeNotification());
    // email used the configured sender; push fell back to the inert logging sender.
    assert.equal(emailSent.length, 1);
    assert.equal(emailSent[0].channel, 'email');
  });
});
