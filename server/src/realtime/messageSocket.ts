import type { IncomingMessage, Server } from 'node:http';
import { URL } from 'node:url';

import { WebSocket, WebSocketServer } from 'ws';

import type { Principal } from '../../../shared/schemas.ts';
import { verifyToken } from '../auth/jwt.ts';
import { locationHub } from '../services/locationHub.ts';
import { messageHub } from '../services/messageHub.ts';
import { isRequestParty } from '../services/serviceRequestService.ts';
import { serviceRequestRepository } from '../repositories/serviceRequestRepository.ts';
import { userRepository } from '../repositories/userRepository.ts';
import { logger } from '../utils/logger.ts';

/** The path clients open a message-thread socket on. */
export const MESSAGES_SOCKET_PATH = '/ws/messages';

// Application close codes (the 4000–4999 range is reserved for app use).
const CLOSE_BAD_REQUEST = 4400;
const CLOSE_UNAUTHENTICATED = 4401;
const CLOSE_FORBIDDEN = 4403;

/** The outcome of authorizing a socket: the request thread it may join, or a close code. */
type Authorization = { ok: true; requestId: string } | { ok: false; code: number };

/**
 * Authorize a connection from its query string: a valid, current token whose
 * principal is a party to the requested thread. Mirrors the HTTP `authenticate`
 * checks (token signature, token_version revocation, active account) plus the
 * same `isRequestParty` gate the REST message routes use.
 */
async function authorize(url: URL): Promise<Authorization> {
  const token = url.searchParams.get('token');
  const requestId = url.searchParams.get('requestId');
  if (requestId === null) {
    return { ok: false, code: CLOSE_BAD_REQUEST };
  }
  if (token === null) {
    return { ok: false, code: CLOSE_UNAUTHENTICATED };
  }

  let principal: Principal;
  let tokenVersion: number;
  try {
    const verified = verifyToken(token);
    principal = verified.principal;
    tokenVersion = verified.tokenVersion;
  } catch {
    return { ok: false, code: CLOSE_UNAUTHENTICATED };
  }

  const user = await userRepository.findById(principal.id);
  if (user !== undefined && user.tokenVersion !== tokenVersion) {
    return { ok: false, code: CLOSE_UNAUTHENTICATED };
  }
  if (user !== undefined && user.status !== 'active') {
    return { ok: false, code: CLOSE_FORBIDDEN };
  }

  const request = await serviceRequestRepository.findById(requestId);
  if (!request) {
    return { ok: false, code: CLOSE_BAD_REQUEST };
  }
  if (!isRequestParty(request, principal)) {
    return { ok: false, code: CLOSE_FORBIDDEN };
  }

  return { ok: true, requestId };
}

async function handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
  const url = new URL(request.url ?? '', 'http://localhost');
  const auth = await authorize(url);
  if (!auth.ok) {
    socket.close(auth.code);
    return;
  }
  // The client may have gone away while we were authorizing.
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  const unsubscribeMessages = messageHub.subscribe(auth.requestId, (message) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  });
  // The same per-request channel also relays the worker's live position while they are on the way
  // (live-tracking Phase 2), tagged `type:'location'` so the client can tell it from a chat message.
  const unsubscribeLocation = locationHub.subscribe(auth.requestId, (location) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'location', location }));
    }
  });
  const cleanup = (): void => {
    unsubscribeMessages();
    unsubscribeLocation();
  };
  socket.on('close', cleanup);
  socket.on('error', cleanup);
  // Tell the client the subscription is live, so it knows messages posted from
  // now on will be pushed (and tests can post without racing the subscribe).
  socket.send(JSON.stringify({ type: 'ready' }));
  // A party joining mid-trip sees the worker's last known position immediately.
  const latestLocation = locationHub.latest(auth.requestId);
  if (latestLocation !== undefined) {
    socket.send(JSON.stringify({ type: 'location', location: latestLocation }));
  }
}

/**
 * Attach the message-thread WebSocket server to an HTTP server. Clients connect
 * to {@link MESSAGES_SOCKET_PATH} with `?requestId=…&token=…` (browsers can't set
 * an Authorization header on a WebSocket, so the bearer token rides the query
 * string) and receive each new message on that thread as JSON, pushed live from
 * {@link messageHub} — no polling.
 */
export function attachMessageSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: MESSAGES_SOCKET_PATH });
  wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    void handleConnection(socket, request).catch((error: unknown) => {
      logger.error(`Message socket error: ${error instanceof Error ? error.message : 'unknown'}`);
      socket.close(CLOSE_UNAUTHENTICATED);
    });
  });
  return wss;
}
