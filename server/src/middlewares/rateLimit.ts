import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../errors/appError.ts';

export interface RateLimitOptions {
  /** Length of the fixed window, in milliseconds. */
  windowMs: number;
  /** Maximum number of requests allowed per client per window. */
  max: number;
}

interface WindowState {
  count: number;
  resetAt: number;
}

/**
 * A small in-memory, per-client fixed-window rate limiter. Each returned
 * middleware keeps its own counters, so different routes can have independent
 * limits. Intended for abuse/brute-force protection on unauthenticated
 * endpoints (login, register); not a substitute for an edge/CDN limiter in
 * production, but a sensible application-level backstop.
 */
export function createRateLimiter({
  windowMs,
  max,
}: RateLimitOptions): (req: Request, res: Response, next: NextFunction) => void {
  const windows = new Map<string, WindowState>();

  return function rateLimit(req: Request, _res: Response, next: NextFunction): void {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const existing = windows.get(key);

    if (existing === undefined || now >= existing.resetAt) {
      windows.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    existing.count += 1;
    if (existing.count > max) {
      next(new AppError('Too many requests. Please try again later.', 429));
      return;
    }
    next();
  };
}
