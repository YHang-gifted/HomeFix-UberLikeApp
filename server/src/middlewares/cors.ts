import type { NextFunction, Request, Response } from 'express';

const METHODS = 'GET, POST, PATCH, PUT, DELETE, OPTIONS';
const HEADERS = 'Content-Type, Authorization';

/**
 * CORS middleware. The API authenticates with a Bearer token in the
 * `Authorization` header, not cookies, so it never uses credentialed CORS.
 *
 * - With no allowlist (the dev default), it returns `Access-Control-Allow-Origin: *`.
 * - With an allowlist (production), it echoes back the request's `Origin` only
 *   when it is on the list, and adds `Vary: Origin`; a disallowed origin gets no
 *   allow-origin header, so the browser blocks the cross-origin response.
 *
 * Never combine an allowlist with `Access-Control-Allow-Credentials: true` while
 * the origin is `*`. See SEC-0002.
 */
export function createCorsMiddleware(
  allowedOrigins: readonly string[],
): (req: Request, res: Response, next: NextFunction) => void {
  const restricted = allowedOrigins.length > 0;

  return function cors(req: Request, res: Response, next: NextFunction): void {
    if (restricted) {
      const origin = req.headers.origin;
      res.header('Vary', 'Origin');
      if (typeof origin === 'string' && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
      }
    } else {
      res.header('Access-Control-Allow-Origin', '*');
    }
    res.header('Access-Control-Allow-Methods', METHODS);
    res.header('Access-Control-Allow-Headers', HEADERS);

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
