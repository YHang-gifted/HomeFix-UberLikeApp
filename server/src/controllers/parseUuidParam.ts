import type { NextFunction, Request } from 'express';
import { z } from 'zod';

import { AppError } from '../errors/appError.ts';

const uuidSchema = z.uuid();

/**
 * Validate a UUID route parameter. Returns the value on success; on failure it
 * forwards a 422 `AppError` (message `Invalid <label>`) to `next` and returns
 * undefined, so the caller can `if (value === undefined) return;`. Centralizes
 * the id-parsing that every controller would otherwise repeat.
 */
export function parseUuidParam(
  req: Request,
  next: NextFunction,
  paramName: string,
  label: string,
): string | undefined {
  const result = uuidSchema.safeParse(req.params[paramName]);
  if (!result.success) {
    next(new AppError(`Invalid ${label}`, 422));
    return undefined;
  }
  return result.data;
}
