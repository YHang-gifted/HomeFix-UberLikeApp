import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { logger } from '../utils/logger.ts';

const REQUEST_ID_HEADER = 'x-request-id';

/** One structured access-log record, emitted once per completed request. */
export interface RequestLogEntry {
  requestId: string;
  method: string;
  /** Route path only (no query string) so tokens/secrets in the URL are never logged. */
  path: string;
  status: number;
  durationMs: number;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * Structured request logging. On every response it emits one JSON line with the
 * method, route path, status code, and duration, correlated by a request id.
 *
 * Deliberately logs only this whitelist — never the body, headers, or query
 * string — so credentials, bearer tokens, and other secrets cannot leak into
 * logs. The request id is taken from an inbound `X-Request-Id` (e.g. set by a
 * proxy) or generated, and echoed back on the response for end-to-end tracing.
 *
 * `sink` and `clock` are injectable for testing.
 */
export function createRequestLogger(
  sink: (entry: RequestLogEntry) => void = (entry) => {
    logger.info(JSON.stringify(entry));
  },
  clock: () => number = () => performance.now(),
): RequestHandler {
  return function requestLogger(req: Request, res: Response, next: NextFunction): void {
    const start = clock();
    const requestId = firstHeaderValue(req.headers[REQUEST_ID_HEADER]) ?? randomUUID();
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      sink({
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(clock() - start),
      });
    });

    next();
  };
}
