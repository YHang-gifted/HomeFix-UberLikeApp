import { createReconnectingStream } from '../../app/src/features/messages/messageStream';
import type {
  ConnectLocationStream,
  LocationStreamSubscription,
} from '../../app/src/features/tracking/liveLocationStream';
import type { LiveLocation } from '../../shared/schemas';
import { apiClient } from './api';

/** Server close codes that a reconnect can't fix (auth rejected / not a party). */
const TERMINAL_CLOSE_CODES = new Set([4401, 4403]);

/** The ws(s) URL for a request's live channel, or null when there is no token yet. */
function socketUrl(requestId: string): string | null {
  const token = apiClient.getToken();
  if (token === undefined) {
    return null;
  }
  const wsBase = apiClient.resolveUrl('/ws/messages').replace(/^http/, 'ws');
  return `${wsBase}?requestId=${encodeURIComponent(requestId)}&token=${encodeURIComponent(token)}`;
}

/** Parse a `type:'location'` frame into a LiveLocation, or null for any other frame / noise. */
function locationFromFrame(data: unknown): LiveLocation | null {
  if (typeof data !== 'string') {
    return null;
  }
  let frame: unknown;
  try {
    frame = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof frame !== 'object' || frame === null) {
    return null;
  }
  const outer = frame as { type?: unknown; location?: unknown };
  if (outer.type !== 'location' || typeof outer.location !== 'object' || outer.location === null) {
    return null;
  }
  const loc = outer.location as {
    requestId?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    at?: unknown;
  };
  if (
    typeof loc.requestId !== 'string' ||
    typeof loc.latitude !== 'number' ||
    typeof loc.longitude !== 'number' ||
    typeof loc.at !== 'string'
  ) {
    return null;
  }
  return { requestId: loc.requestId, latitude: loc.latitude, longitude: loc.longitude, at: loc.at };
}

/**
 * Real worker-location stream over the platform WebSocket. Opens the same per-request socket as the
 * message stream, forwards each `type:'location'` frame to the listener, and reconnects with
 * exponential backoff on a drop — except on a terminal auth close (4401/4403). See
 * `docs/live-tracking.md`.
 */
export const deviceConnectLocationStream: ConnectLocationStream = (
  requestId,
  onLocation,
): LocationStreamSubscription => {
  return createReconnectingStream<LiveLocation>(
    (hooks) => {
      const url = socketUrl(requestId);
      if (url === null) {
        hooks.onClose(4401);
        return { close: () => undefined };
      }
      const socket = new WebSocket(url);
      socket.onmessage = (event) => {
        const location = locationFromFrame((event as { data?: unknown }).data);
        if (location !== null) {
          hooks.onMessage(location);
        }
      };
      socket.onopen = () => {
        hooks.onOpen();
      };
      socket.onclose = (event) => {
        hooks.onClose((event as { code?: number }).code);
      };
      socket.onerror = () => undefined;
      return {
        close: () => {
          socket.close();
        },
      };
    },
    onLocation,
    { shouldReconnect: (code) => code === undefined || !TERMINAL_CLOSE_CODES.has(code) },
  );
};
