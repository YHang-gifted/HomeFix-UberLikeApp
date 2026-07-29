import type { LiveLocation } from '../../../../shared/schemas';

/** Notified with each live position pushed for a subscribed request while the worker is on the way. */
export type LocationStreamListener = (location: LiveLocation) => void;

/** A live location subscription; call `close` to stop receiving and release it. */
export interface LocationStreamSubscription {
  close: () => void;
}

/**
 * Opens a live subscription to a request's worker-location stream (a WebSocket in the real app,
 * relayed over the same per-request channel as chat). Injected into the screen so tests supply a
 * fake and the web build can omit it. See `docs/live-tracking.md`.
 */
export type ConnectLocationStream = (
  requestId: string,
  onLocation: LocationStreamListener,
) => LocationStreamSubscription;
