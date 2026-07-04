import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createReconnectingStream } from '../app/src/features/messages/messageStream.ts';

/** A controllable timer: schedule records tasks; runNext fires the oldest. */
function fakeScheduler() {
  let seq = 0;
  const tasks = new Map();
  return {
    schedule(fn, ms) {
      const id = ++seq;
      tasks.set(id, { fn, ms });
      return id;
    },
    cancel(id) {
      tasks.delete(id);
    },
    delays() {
      return [...tasks.values()].map((t) => t.ms);
    },
    pending() {
      return tasks.size;
    },
    runNext() {
      const [id, task] = [...tasks.entries()][0];
      tasks.delete(id);
      task.fn();
      return task.ms;
    },
  };
}

/** A fake socket opener: records every socket and exposes its hooks. */
function fakeOpener() {
  const sockets = [];
  const open = (hooks) => {
    const socket = { hooks, closed: false };
    socket.handle = {
      close: () => {
        socket.closed = true;
      },
    };
    sockets.push(socket);
    return socket.handle;
  };
  return { open, sockets };
}

function message(id) {
  return { id, requestId: 'r', senderId: 'u', senderRole: 'customer', body: id, createdAt: 'x' };
}

describe('createReconnectingStream', () => {
  it('opens a socket immediately and forwards messages', () => {
    const { open, sockets } = fakeOpener();
    const sched = fakeScheduler();
    const received = [];
    createReconnectingStream(open, (m) => received.push(m.id), {
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    assert.equal(sockets.length, 1);
    sockets[0].hooks.onMessage(message('m1'));
    assert.deepEqual(received, ['m1']);
  });

  it('reconnects with exponential backoff and resets the delay after a live open', () => {
    const { open, sockets } = fakeOpener();
    const sched = fakeScheduler();
    createReconnectingStream(open, () => {}, {
      baseDelayMs: 1000,
      maxDelayMs: 8000,
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    sockets[0].hooks.onClose(1006);
    assert.deepEqual(sched.delays(), [1000]);
    sched.runNext();
    assert.equal(sockets.length, 2);

    sockets[1].hooks.onClose(1006);
    assert.deepEqual(sched.delays(), [2000]);
    sched.runNext();
    assert.equal(sockets.length, 3);

    // A healthy open resets the backoff, so the next drop is back to the base.
    sockets[2].hooks.onOpen();
    sockets[2].hooks.onClose(1006);
    assert.deepEqual(sched.delays(), [1000]);
  });

  it('caps the backoff delay at maxDelayMs', () => {
    const { open, sockets } = fakeOpener();
    const sched = fakeScheduler();
    createReconnectingStream(open, () => {}, {
      baseDelayMs: 1000,
      maxDelayMs: 4000,
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    const delays = [];
    for (let i = 0; i < 5; i += 1) {
      sockets[sockets.length - 1].hooks.onClose(1006);
      delays.push(sched.delays()[0]);
      sched.runNext();
    }
    assert.deepEqual(delays, [1000, 2000, 4000, 4000, 4000]);
  });

  it('does not reconnect on a terminal close code', () => {
    const { open, sockets } = fakeOpener();
    const sched = fakeScheduler();
    createReconnectingStream(open, () => {}, {
      shouldReconnect: (code) => code !== 4401,
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    sockets[0].hooks.onClose(4401);
    assert.equal(sched.pending(), 0);
    assert.equal(sockets.length, 1);
  });

  it('close() cancels a pending reconnect and stops forwarding', () => {
    const { open, sockets } = fakeOpener();
    const sched = fakeScheduler();
    const received = [];
    const sub = createReconnectingStream(open, (m) => received.push(m.id), {
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    sockets[0].hooks.onClose(1006);
    assert.equal(sched.pending(), 1);

    sub.close();
    assert.equal(sched.pending(), 0);
    // A late message from the dead socket is ignored.
    sockets[0].hooks.onMessage(message('late'));
    assert.deepEqual(received, []);
  });

  it('close() tears down the current live socket', () => {
    const { open, sockets } = fakeOpener();
    const sched = fakeScheduler();
    const sub = createReconnectingStream(open, () => {}, {
      schedule: sched.schedule,
      cancel: sched.cancel,
    });

    sub.close();
    assert.equal(sockets[0].closed, true);
  });
});
