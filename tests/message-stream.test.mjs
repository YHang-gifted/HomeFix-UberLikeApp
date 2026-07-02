import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mergeIncomingMessage } from '../app/src/features/messages/messageStream.ts';

function message(id, body) {
  return {
    id,
    requestId: 'r1',
    senderId: 'u1',
    senderRole: 'customer',
    body,
    createdAt: '2026-07-02T00:00:00.000Z',
  };
}

describe('mergeIncomingMessage', () => {
  it('starts the thread when it is still loading (null)', () => {
    const merged = mergeIncomingMessage(null, message('a', 'hi'));

    assert.deepEqual(
      merged.map((m) => m.id),
      ['a'],
    );
  });

  it('appends a new message to the end', () => {
    const merged = mergeIncomingMessage([message('a', 'hi')], message('b', 'there'));

    assert.deepEqual(
      merged.map((m) => m.id),
      ['a', 'b'],
    );
  });

  it('ignores a message whose id is already present (poll + push dedupe)', () => {
    const current = [message('a', 'hi')];
    const merged = mergeIncomingMessage(current, message('a', 'hi'));

    assert.equal(merged, current);
  });
});
