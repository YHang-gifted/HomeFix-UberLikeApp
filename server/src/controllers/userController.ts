import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { AppError } from '../errors/appError.ts';
import { getPublicUserById } from '../services/userService.ts';

const idSchema = z.uuid();

export function getUser(req: Request, res: Response, next: NextFunction): void {
  const principal = req.principal;
  if (!principal) {
    next(new AppError('Authentication required', 401));
    return;
  }

  const idResult = idSchema.safeParse(req.params['id']);
  if (!idResult.success) {
    next(new AppError('Invalid user id', 422));
    return;
  }

  try {
    res.status(200).json(getPublicUserById(idResult.data));
  } catch (error) {
    next(error);
  }
}
