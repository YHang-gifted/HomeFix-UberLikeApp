import type { NextFunction, Request, Response } from 'express';

import { principalSchema } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const result = principalSchema.safeParse({
    id: req.header('x-user-id'),
    role: req.header('x-user-role'),
  });
  if (!result.success) {
    next(new AppError('Authentication required', 401));
    return;
  }
  req.principal = result.data;
  next();
}
