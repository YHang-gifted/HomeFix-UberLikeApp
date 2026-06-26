import type { NextFunction, Request, Response } from 'express';

/**
 * Minimal CORS middleware for local development.
 *
 * The API authenticates with a Bearer token in the `Authorization` header, not
 * cookies, so it does not use credentialed CORS — `Access-Control-Allow-Origin: *`
 * is safe here (no ambient credentials are exposed cross-origin). It lets the
 * Expo web client (a different localhost port) call the API. For production,
 * restrict the allowed origin to the known web origin(s).
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
}
