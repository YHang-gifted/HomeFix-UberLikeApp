import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { MessageHub } from '../server/src/services/messageHub.ts';

function message(requestId, body) {
  return {
    id: `m-${body}`,
    requestId,
    senderId: 'u1',
    senderRole: 'customer',
    body,
    createdAt: '2026-07-02T00:00:00.000Z',
  };
}

describe('MessageHub', () => {
  let hub;

  beforeEach(() => {
    hub = new MessageHub();
  });

  it('delivers a published message to a subscriber of that request', () => {
    const received = [];
    hub.subscribe('req-1', (m) => received.push(m.body));

    hub.publish(message('req-1', 'hello'));

    assert.deepEqual(received, ['hello']);
  });

  it('does not deliver messages for a different request', () => {
    const received = [];
    hub.subscribe('req-1', (m) => received.push(m.body));

    hub.publish(message('req-2', 'other'));

    assert.deepEqual(received, []);
  });

  it('fans out to every subscriber of the request', () => {
    const a = [];
    const b = [];
    hub.subscribe('req-1', (m) => a.push(m.body));
    hub.subscribe('req-1', (m) => b.push(m.body));

    hub.publish(message('req-1', 'hi'));

    assert.deepEqual(a, ['hi']);
    assert.deepEqual(b, ['hi']);
  });

  it('stops delivering after unsubscribe and cleans up the request bucket', () => {
    const received = [];
    const unsubscribe = hub.subscribe('req-1', (m) => received.push(m.body));

    hub.publish(message('req-1', 'first'));
    unsubscribe();
    hub.publish(message('req-1', 'second'));

    assert.deepEqual(received, ['first']);
    assert.equal(hub.subscriberCount('req-1'), 0);
  });

  it('handles a listener that unsubscribes during dispatch', () => {
    const received = [];
    const unsubscribe = hub.subscribe('req-1', (m) => {
      received.push(m.body);
      unsubscribe();
    });

    hub.publish(message('req-1', 'once'));
    hub.publish(message('req-1', 'twice'));

    assert.deepEqual(received, ['once']);
  });

  it('clear removes all subscribers', () => {
    hub.subscribe('req-1', () => {});
    hub.subscribe('req-2', () => {});

    hub.clear();

    assert.equal(hub.subscriberCount('req-1'), 0);
    assert.equal(hub.subscriberCount('req-2'), 0);
  });
});
