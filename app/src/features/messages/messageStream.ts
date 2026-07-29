import type { Message } from '../../../../shared/schemas';

/** Notified with each message pushed live on a subscribed request thread. */
export type MessageStreamListener = (message: Message) => void;

/** A live message subscription; call `close` to stop receiving and release it. */
export interface MessageStreamSubscription {
  close: () => void;
}

/**
 * Opens a live subscription to a request's message thread (a WebSocket in the
 * real app). Injected into the screen so tests can supply a fake and the web
 * build can omit it and fall back to polling.
 */
export type ConnectMessageStream = (
  requestId: string,
  onMessage: MessageStreamListener,
) => MessageStreamSubscription;

/**
 * Merge a pushed message into the current thread: append it, unless the list is
 * still loading (start it) or the message id is already present (a poll and a
 * push can both deliver the same message — keep it once).
 */
export function mergeIncomingMessage(current: Message[] | null, incoming: Message): Message[] {
  if (current === null) {
    return [incoming];
  }
  if (current.some((message) => message.id === incoming.id)) {
    return current;
  }
  return [...current, incoming];
}

/** Callbacks a single socket attempt reports back to the reconnect wrapper. Generic over the item
 *  type so the same backoff logic drives both the chat stream and the live-location stream. */
export interface StreamHooks<T> {
  onMessage: (item: T) => void;
  /** The connection is live — used to reset the backoff. */
  onOpen: () => void;
  /** The connection ended; `code` is the close code, when known. */
  onClose: (code?: number) => void;
}
/** @deprecated Chat-specific alias of {@link StreamHooks}. */
export type SocketHooks = StreamHooks<Message>;

/** Opens one socket attempt, wired to the given hooks; returns how to close it. */
export type OpenStream<T> = (hooks: StreamHooks<T>) => { close: () => void };
/** @deprecated Chat-specific alias of {@link OpenStream}. */
export type OpenMessageSocket = OpenStream<Message>;

export interface ReconnectOptions {
  /** First reconnect delay; doubles each attempt. Default 1000ms. */
  baseDelayMs?: number;
  /** Cap on the reconnect delay. Default 30000ms. */
  maxDelayMs?: number;
  /** Whether to reconnect for a given close code. Default: always. */
  shouldReconnect?: (code: number | undefined) => boolean;
  /** Injectable timer (for tests). Defaults to setTimeout/clearTimeout. */
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

/**
 * Wrap a socket-opening function with automatic reconnection and exponential
 * backoff: a live connection resets the delay, an unexpected close schedules a
 * retry (base, 2×, 4×, … capped at max), and `close()` stops retrying and tears
 * down the current socket. `shouldReconnect` lets the caller stop on terminal
 * closes (e.g. an auth rejection that a retry can't fix). Pure and fully
 * injectable, so the backoff logic is testable without a real WebSocket or timers.
 */
export function createReconnectingStream<T>(
  open: OpenStream<T>,
  onItem: (item: T) => void,
  options: ReconnectOptions = {},
): MessageStreamSubscription {
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30000;
  const shouldReconnect = options.shouldReconnect ?? (() => true);
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel =
    options.cancel ??
    ((handle) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    });

  let closed = false;
  let attempt = 0;
  let current: { close: () => void } | null = null;
  let timer: unknown = null;

  function openOnce(): void {
    if (closed) {
      return;
    }
    current = open({
      onMessage: (item) => {
        if (!closed) {
          onItem(item);
        }
      },
      onOpen: () => {
        attempt = 0;
      },
      onClose: (code) => {
        current = null;
        if (closed || !shouldReconnect(code)) {
          return;
        }
        const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
        attempt += 1;
        timer = schedule(() => {
          timer = null;
          openOnce();
        }, delay);
      },
    });
  }

  openOnce();

  return {
    close: () => {
      closed = true;
      if (timer !== null) {
        cancel(timer);
        timer = null;
      }
      if (current !== null) {
        current.close();
        current = null;
      }
    },
  };
}
