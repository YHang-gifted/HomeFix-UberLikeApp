import process from 'node:process';

import { logger } from '../utils/logger.ts';

/** The bits of an `http.Server` graceful shutdown needs. */
export interface ClosableServer {
  /** Stop accepting connections and call back once all in-flight requests have finished. */
  close(callback: (err?: Error) => void): void;
  /** Close idle keep-alive sockets so they don't keep `close()` waiting (Node 18.2+). */
  closeIdleConnections?: () => void;
}

/** The bits of a `ws` WebSocketServer graceful shutdown needs. */
export interface ClosableWss {
  close(): void;
  /** Currently connected sockets — long-lived, so they must be closed to let `close()` finish. */
  clients: Iterable<{ close: () => void }>;
}

/** Injected so the flow is unit-testable without real timers, `process.exit`, or a real server. */
export interface ShutdownDeps {
  log: (message: string) => void;
  logError: (message: string) => void;
  exit: (code: number) => void;
  setTimer: (fn: () => void, ms: number) => NodeJS.Timeout;
  clearTimer: (handle: NodeJS.Timeout) => void;
}

/**
 * Drain the server and exit. Stops accepting new work, closes long-lived WebSocket connections
 * (which would otherwise keep the HTTP server open forever), waits for in-flight HTTP requests to
 * finish, then exits 0. A `timeoutMs` guard forces exit 1 if draining hangs, so a stuck request can
 * never wedge a deploy. Idempotent via a `settled` latch — the timeout and the close callback race,
 * and only the first one to fire wins.
 */
export function shutdown(
  server: ClosableServer,
  wss: ClosableWss | undefined,
  timeoutMs: number,
  deps: ShutdownDeps,
): void {
  deps.log('Graceful shutdown: draining in-flight requests, no longer accepting new connections');
  let settled = false;

  const timer = deps.setTimer(() => {
    if (settled) {
      return;
    }
    settled = true;
    deps.logError(`Graceful shutdown timed out after ${String(timeoutMs)}ms; forcing exit`);
    deps.exit(1);
  }, timeoutMs);

  // Close live WebSocket connections first: they are long-lived, so `server.close` would otherwise
  // wait on them until the timeout every single time.
  if (wss !== undefined) {
    wss.close();
    for (const client of wss.clients) {
      client.close();
    }
  }
  server.closeIdleConnections?.();

  server.close((err) => {
    if (settled) {
      return;
    }
    settled = true;
    deps.clearTimer(timer);
    if (err !== undefined) {
      deps.logError(`Graceful shutdown error while closing the server: ${err.message}`);
      deps.exit(1);
      return;
    }
    deps.log('Graceful shutdown: all connections closed, exiting cleanly');
    deps.exit(0);
  });
}

/**
 * Wire {@link shutdown} to `SIGTERM` and `SIGINT` (the signals a container runtime / Ctrl-C send on
 * a redeploy). `once` so a repeated signal can't re-enter. Real timers/exit/logger are supplied
 * here; the shutdown logic itself stays injected and tested.
 */
export function registerGracefulShutdown(
  server: ClosableServer,
  wss: ClosableWss | undefined,
  timeoutMs = 10_000,
): void {
  const run = (): void => {
    shutdown(server, wss, timeoutMs, {
      log: (message) => {
        logger.info(message);
      },
      logError: (message) => {
        logger.error(message);
      },
      exit: (code) => process.exit(code),
      setTimer: (fn, ms) => {
        const handle = setTimeout(fn, ms);
        // Don't let the force-exit timer itself keep the process alive.
        handle.unref();
        return handle;
      },
      clearTimer: (handle) => {
        clearTimeout(handle);
      },
    });
  };
  process.once('SIGTERM', run);
  process.once('SIGINT', run);
}
