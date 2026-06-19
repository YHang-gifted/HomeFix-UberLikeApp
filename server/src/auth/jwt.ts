import jwt from 'jsonwebtoken';

import type { Principal } from '../../../shared/schemas.ts';
import { principalSchema } from '../../../shared/schemas.ts';
import { loadEnv } from '../config/env.ts';
import { AppError } from '../errors/appError.ts';

const env = loadEnv();

export function signToken(principal: Principal): string {
  return jwt.sign({ role: principal.role }, env.JWT_SECRET, {
    subject: principal.id,
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

export function verifyToken(token: string): Principal {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new AppError('Invalid or expired token', 401);
  }

  if (typeof decoded !== 'object' || decoded === null) {
    throw new AppError('Invalid token payload', 401);
  }

  const payload = decoded as { sub?: unknown; role?: unknown };
  const result = principalSchema.safeParse({ id: payload.sub, role: payload.role });
  if (!result.success) {
    throw new AppError('Invalid token payload', 401);
  }
  return result.data;
}
