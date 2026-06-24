import type { NextFunction, Request, Response } from 'express';

import type { Principal } from '../../../shared/schemas.ts';
import { verifyToken } from '../auth/jwt.ts';
import { AppError } from '../errors/appError.ts';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    next(new AppError('Authentication required', 401));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  let principal: Principal;
  try {
    principal = verifyToken(token);
  } catch (error) {
    next(error instanceof AppError ? error : new AppError('Authentication required', 401));
    return;
  }

  req.principal = principal;
  next();
}

/**
 * Returns the authenticated principal, or calls `next` with a 401 and returns
 * undefined. Lets handlers behind `authenticate` satisfy the optional
 * `req.principal` type without repeating the guard.
 */
export function requirePrincipal(req: Request, next: NextFunction): Principal | undefined {
  const principal = req.principal;
  if (!principal) {
    next(new AppError('Authentication required', 401));
    return undefined;
  }
  return principal;
}
