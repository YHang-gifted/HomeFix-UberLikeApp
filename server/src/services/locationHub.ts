import type { LiveLocation } from '../../../shared/schemas.ts';

/** Notified with each new live position published for a subscribed request. */
export type LocationListener = (location: LiveLocation) => void;

/**
 * In-process pub/sub for a worker's live position during a visit, keyed by request id — the
 * location counterpart of {@link MessageHub}. It also keeps the **latest** position per request so a
 * party connecting mid-trip sees where the worker is immediately, without waiting for the next
 * update. Nothing is persisted: the track is ephemeral by design (live-tracking Phase 2, see
 * `docs/live-tracking.md`).
 *
 * In-memory and single-process — correct for one server instance. A multi-instance deployment would
 * back this with a shared broker (e.g. Redis pub/sub); the interface here stays the same.
 */
export class LocationHub {
  private readonly listeners = new Map<string, Set<LocationListener>>();
  private readonly latestByRequest = new Map<string, LiveLocation>();

  /** Subscribe to a request's live positions. Returns an unsubscribe function. */
  public subscribe(requestId: string, listener: LocationListener): () => void {
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

  /** Publish a position to every subscriber, and record it as the request's latest. */
  public publish(location: LiveLocation): void {
    this.latestByRequest.set(location.requestId, location);
    const set = this.listeners.get(location.requestId);
    if (!set) {
      return;
    }
    // Copy so a listener that unsubscribes during dispatch doesn't mutate the set we're iterating.
    for (const listener of [...set]) {
      listener(location);
    }
  }

  /** The most recent position for a request, or undefined if none has been published. */
  public latest(requestId: string): LiveLocation | undefined {
    return this.latestByRequest.get(requestId);
  }

  public clear(): void {
    this.listeners.clear();
    this.latestByRequest.clear();
  }
}

export const locationHub = new LocationHub();
