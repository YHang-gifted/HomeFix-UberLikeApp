import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CompositeDelivery,
  RecordingDelivery,
  buildDelivery,
  emailDelivery,
  pushDelivery,
  resetDeliveries,
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
  it('enables only the configured known channels', async () => {
    resetDeliveries();
    await buildDelivery(['email']).deliver(makeNotification());
    assert.equal(emailDelivery.sent.length, 1);
    assert.equal(pushDelivery.sent.length, 0);
  });

  it('enables both channels when both are configured', async () => {
    resetDeliveries();
    await buildDelivery(['email', 'push']).deliver(makeNotification());
    assert.equal(emailDelivery.sent.length, 1);
    assert.equal(pushDelivery.sent.length, 1);
  });

  it('ignores unknown channel names', async () => {
    resetDeliveries();
    await buildDelivery(['sms', 'carrier-pigeon']).deliver(makeNotification());
    assert.equal(emailDelivery.sent.length, 0);
    assert.equal(pushDelivery.sent.length, 0);
  });

  it('delivers to nothing (no throw) when no channels are configured', async () => {
    resetDeliveries();
    await buildDelivery([]).deliver(makeNotification());
    assert.equal(emailDelivery.sent.length, 0);
    assert.equal(pushDelivery.sent.length, 0);
  });
});
