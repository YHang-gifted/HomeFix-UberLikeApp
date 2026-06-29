import type { NextFunction, Request, Response } from 'express';

import type { Principal } from '../../../shared/schemas.ts';
import type { VerifiedToken } from '../auth/jwt.ts';
import { verifyToken } from '../auth/jwt.ts';
import { AppError } from '../errors/appError.ts';
import { userRepository } from '../repositories/userRepository.ts';

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    next(new AppError('Authentication required', 401));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  let verified: VerifiedToken;
  try {
    verified = verifyToken(token);
  } catch (error) {
    next(error instanceof AppError ? error : new AppError('Authentication required', 401));
    return;
  }

  // Token revocation: a token is rejected once its version is behind the user's
  // current token_version (bumped by logout-all / password change). An unknown
  // user is allowed through — only known accounts are version-checked — so a
  // forged-id token still hits the same per-resource authorization as before.
  try {
    const user = await userRepository.findById(verified.principal.id);
    if (user !== undefined && user.tokenVersion !== verified.tokenVersion) {
      next(new AppError('Session expired. Please sign in again.', 401));
      return;
    }
  } catch (error) {
    next(error instanceof AppError ? error : new AppError('Authentication failed', 401));
    return;
  }

  req.principal = verified.principal;
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
