import type {
  ConnectMessageStream,
  MessageStreamListener,
  MessageStreamSubscription,
} from '../../app/src/features/messages/messageStream';
import type { Message } from '../../shared/schemas';
import { apiClient } from './api';

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
 * provide `WebSocket`). Opens a socket to `/ws/messages` and forwards each pushed
 * message to the listener. No reconnect is attempted — the thread re-subscribes
 * on focus and after sending, and message polling remains the fallback when the
 * stream isn't available at all.
 */
export const deviceConnectMessageStream: ConnectMessageStream = (
  requestId,
  onMessage,
): MessageStreamSubscription => {
  const url = socketUrl(requestId);
  if (url === null) {
    return { close: () => undefined };
  }

  const socket = new WebSocket(url);
  socket.onmessage = (event) => {
    forwardFrame((event as { data?: unknown }).data, onMessage);
  };
  // Swallow socket errors: without a reconnect strategy there's nothing to do but
  // stop receiving; the user can refresh to re-open the thread.
  socket.onerror = () => undefined;

  return {
    close: () => {
      socket.close();
    },
  };
};
