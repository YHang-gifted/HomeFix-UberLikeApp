import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shutdown } from '../server/src/lifecycle/gracefulShutdown.ts';

// Graceful shutdown drains the server on SIGTERM/SIGINT so a redeploy never drops in-flight
// requests. The signal wiring is trivial; the logic that matters — close WS, drain HTTP, exit 0,
// or force exit 1 on a hang — is injected and tested here without real timers or process.exit.

/** A fake server whose close callback the test fires manually, plus recorded calls. */
function makeServer() {
  const calls = { closeIdleConnections: 0 };
  let closeCb;
  return {
    server: {
      closeIdleConnections: () => {
        calls.closeIdleConnections += 1;
      },
      close: (cb) => {
        closeCb = cb;
      },
    },
    calls,
    finishClose: (err) => closeCb?.(err),
  };
}

function makeWss() {
  const closed = [];
  return {
    wss: {
      close: () => {
        closed.push('server');
      },
      clients: [
        {
          close: () => {
            closed.push('client-1');
          },
        },
        {
          close: () => {
            closed.push('client-2');
          },
        },
      ],
    },
    closed,
  };
}

function makeDeps() {
  const state = { exitCode: undefined, logs: [], errors: [], timerFn: undefined, cleared: false };
  const deps = {
    log: (m) => state.logs.push(m),
    logError: (m) => state.errors.push(m),
    exit: (code) => {
      state.exitCode = code;
    },
    setTimer: (fn) => {
      state.timerFn = fn;
      return { id: 'timer' };
    },
    clearTimer: () => {
      state.cleared = true;
    },
  };
  return { deps, state };
}

describe('graceful shutdown', () => {
  it('closes the WebSocket server and every client before draining', () => {
    const { server } = makeServer();
    const { wss, closed } = makeWss();
    const { deps } = makeDeps();

    shutdown(server, wss, 1000, deps);

    assert.deepEqual(closed, ['server', 'client-1', 'client-2']);
  });

  it('exits 0 once the server finishes closing, and clears the timeout', () => {
    const { server, calls, finishClose } = makeServer();
    const { wss } = makeWss();
    const { deps, state } = makeDeps();

    shutdown(server, wss, 1000, deps);
    assert.equal(calls.closeIdleConnections, 1);
    assert.equal(state.exitCode, undefined); // not yet — close is pending

    finishClose(); // the server drained
    assert.equal(state.exitCode, 0);
    assert.equal(state.cleared, true);
  });

  it('forces exit 1 if draining hangs past the timeout', () => {
    const { server } = makeServer();
    const { wss } = makeWss();
    const { deps, state } = makeDeps();

    shutdown(server, wss, 1000, deps);
    // The server never calls back; fire the timeout instead.
    state.timerFn();
    assert.equal(state.exitCode, 1);
    assert.ok(state.errors.some((m) => /timed out/i.test(m)));
  });

  it('does not exit twice when close finishes after the timeout already fired', () => {
    const { server, finishClose } = makeServer();
    const { wss } = makeWss();
    const { deps, state } = makeDeps();

    shutdown(server, wss, 1000, deps);
    state.timerFn(); // timeout wins
    assert.equal(state.exitCode, 1);

    state.exitCode = 'unchanged';
    finishClose(); // late close callback must be ignored
    assert.equal(state.exitCode, 'unchanged');
  });

  it('exits 1 when the server reports an error closing', () => {
    const { server, finishClose } = makeServer();
    const { deps, state } = makeDeps();

    shutdown(server, undefined, 1000, deps);
    finishClose(new Error('close boom'));
    assert.equal(state.exitCode, 1);
    assert.ok(state.errors.some((m) => /close boom/.test(m)));
  });
});
