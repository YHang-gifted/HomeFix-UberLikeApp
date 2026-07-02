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
