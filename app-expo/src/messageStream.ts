import type {
  ConnectMessageStream,
  MessageStreamListener,
  MessageStreamSubscription,
} from '../../app/src/features/messages/messageStream';
import { createReconnectingStream } from '../../app/src/features/messages/messageStream';
import type { Message } from '../../shared/schemas';
import { apiClient } from './api';

/** Server close codes that a reconnect can't fix (auth rejected / not a party). */
const TERMINAL_CLOSE_CODES = new Set([4401, 4403]);

/**
 * Build the ws(s) URL for a request's message socket from the API base and the
 * current bearer token, or null when there is no token (the token rides the query
 * string because a WebSocket can't carry an Authorization header).
 */
function socketUrl(requestId: string): string | null {
  const token = apiClient.getToken();
  if (token === undefined) {
    return null;
  }
  const wsBase = apiClient.resolveUrl('/ws/messages').replace(/^http/, 'ws');
  return `${wsBase}?requestId=${encodeURIComponent(requestId)}&token=${encodeURIComponent(token)}`;
}

/** Forward a raw socket frame to the listener, ignoring the `ready` ack and noise. */
function forwardFrame(data: unknown, onMessage: MessageStreamListener): void {
  if (typeof data !== 'string') {
    return;
  }
  let frame: unknown;
  try {
    frame = JSON.parse(data);
  } catch {
    return;
  }
  if (typeof frame !== 'object' || frame === null) {
    return;
  }
  const candidate = frame as { type?: unknown; id?: unknown; body?: unknown };
  if (candidate.type === 'ready') {
    return;
  }
  if (typeof candidate.id === 'string' && typeof candidate.body === 'string') {
    onMessage(frame as Message);
  }
}

/**
 * Real message stream over the platform WebSocket (React Native and browser both
 * provide `WebSocket`). Opens a socket to `/ws/messages`, forwards each pushed
 * message to the listener, and automatically reconnects with exponential backoff
 * when the connection drops — except on a terminal auth close (4401/4403), which a
 * retry can't fix. Message polling remains the fallback when the stream can't be
 * opened at all.
 */
export const deviceConnectMessageStream: ConnectMessageStream = (
  requestId,
  onMessage,
): MessageStreamSubscription => {
  return createReconnectingStream(
    (hooks) => {
      const url = socketUrl(requestId);
      if (url === null) {
        // No token yet: report a terminal close so we stop rather than loop.
        hooks.onClose(4401);
        return { close: () => undefined };
      }
      const socket = new WebSocket(url);
      socket.onmessage = (event) => {
        forwardFrame((event as { data?: unknown }).data, hooks.onMessage);
      };
      socket.onopen = () => {
        hooks.onOpen();
      };
      socket.onclose = (event) => {
        hooks.onClose((event as { code?: number }).code);
      };
      // `onerror` is followed by `onclose`, which drives the reconnect.
      socket.onerror = () => undefined;
      return {
        close: () => {
          socket.close();
        },
      };
    },
    onMessage,
    { shouldReconnect: (code) => code === undefined || !TERMINAL_CLOSE_CODES.has(code) },
  );
};
