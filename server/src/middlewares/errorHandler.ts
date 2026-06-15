import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../errors/appError.ts';
import { logger } from '../utils/logger.ts';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not Found' });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  logger.error(err instanceof Error ? err.message : 'Unknown error');
  res.status(500).json({ error: 'Internal Server Error' });
}
