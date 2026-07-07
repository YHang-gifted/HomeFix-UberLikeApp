import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';

import { isAppError } from '../errors/appError.ts';
import { logger } from '../utils/logger.ts';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not Found' });
}

/** Structured context logged for an unexpected (5xx) error, correlated by request id. */
export interface ErrorLogEntry {
  requestId: string;
  method: string;
  /** Route path only (no query string), matching the access log. */
  path: string;
  error: string;
  message: string;
  stack?: string;
}

/**
 * Central error boundary. A thrown {@link AppError} maps to its status and message
 * (expected client errors — not logged). Anything else is an unexpected failure:
 * it is logged with structured context (request id, method, path, error name,
 * message, stack) so it can be traced in the logs, and the client gets a generic
 * 500 that never leaks internal details. `logError` is injectable for testing.
 */
export function createErrorHandler(
  logError: (entry: ErrorLogEntry) => void = (entry) => {
    const { message, ...rest } = entry;
    logger.error(message, { type: 'error', ...rest });
  },
): ErrorRequestHandler {
  return function errorHandler(
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void {
    if (isAppError(err)) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    logError({
      requestId: String(res.getHeader('X-Request-Id') ?? ''),
      method: req.method,
      path: req.path,
      error: err instanceof Error ? err.name : 'UnknownError',
      message: err instanceof Error ? err.message : 'Unknown error',
      ...(err instanceof Error && err.stack !== undefined ? { stack: err.stack } : {}),
    });
    res.status(500).json({ error: 'Internal Server Error' });
  };
}

/** The default error handler used by the app. */
export const errorHandler = createErrorHandler();
