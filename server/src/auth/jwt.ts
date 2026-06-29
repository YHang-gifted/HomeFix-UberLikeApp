import jwt from 'jsonwebtoken';

import type { Principal } from '../../../shared/schemas.ts';
import { principalSchema } from '../../../shared/schemas.ts';
import { loadEnv } from '../config/env.ts';
import { AppError } from '../errors/appError.ts';

const env = loadEnv();

/** A verified token: the principal plus the token_version it was signed with. */
export interface VerifiedToken {
  principal: Principal;
  tokenVersion: number;
}

export function signToken(principal: Principal, tokenVersion = 0): string {
  return jwt.sign({ role: principal.role, tv: tokenVersion }, env.JWT_SECRET, {
    subject: principal.id,
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

export function verifyToken(token: string): VerifiedToken {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new AppError('Invalid or expired token', 401);
  }

  if (typeof decoded !== 'object' || decoded === null) {
    throw new AppError('Invalid token payload', 401);
  }

  const payload = decoded as { sub?: unknown; role?: unknown; tv?: unknown };
  const result = principalSchema.safeParse({ id: payload.sub, role: payload.role });
  if (!result.success) {
    throw new AppError('Invalid token payload', 401);
  }
  // Tokens issued before token_version existed carry no `tv` claim → treat as 0.
  const tokenVersion = typeof payload.tv === 'number' ? payload.tv : 0;
  return { principal: result.data, tokenVersion };
}
