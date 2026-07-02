import type { Message } from '../../../shared/schemas.ts';

/** Notified with each new message posted to a subscribed request thread. */
export type MessageListener = (message: Message) => void;

/**
 * In-process pub/sub for chat messages, keyed by request id. The message service
 * publishes each new message here; the WebSocket layer subscribes per request
 * thread and pushes to the connected parties, so clients see messages without
 * polling.
 *
 * In-memory and single-process — correct for one server instance. A multi-instance
 * deployment would back this with a shared broker (e.g. Redis pub/sub) so a message
 * posted on one instance reaches subscribers on another; the interface here stays
 * the same.
 */
export class MessageHub {
  private readonly listeners = new Map<string, Set<MessageListener>>();

  /** Subscribe to a request's thread. Returns an unsubscribe function. */
  public subscribe(requestId: string, listener: MessageListener): () => void {
    let set = this.listeners.get(requestId);
    if (!set) {
      set = new Set();
      this.listeners.set(requestId, set);
    }
    set.add(listener);
    return () => {
      const current = this.listeners.get(requestId);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(requestId);
      }
    };
  }

  /** Publish a message to every subscriber of its request thread. */
  public publish(message: Message): void {
    const set = this.listeners.get(message.requestId);
    if (!set) {
      return;
    }
    // Copy so a listener that unsubscribes during dispatch doesn't mutate the set
    // we're iterating.
    for (const listener of [...set]) {
      listener(message);
    }
  }

  /** Number of active subscribers for a request (used in tests/diagnostics). */
  public subscriberCount(requestId: string): number {
    return this.listeners.get(requestId)?.size ?? 0;
  }

  public clear(): void {
    this.listeners.clear();
  }
}

export const messageHub = new MessageHub();
