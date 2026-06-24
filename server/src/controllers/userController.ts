import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { AppError } from '../errors/appError.ts';
import { getPublicUserById, getPublicUsersByIds } from '../services/userService.ts';

const idSchema = z.uuid();
const idsQuerySchema = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  )
  .pipe(z.array(z.uuid()).max(200));

export function getUsers(req: Request, res: Response, next: NextFunction): void {
  const principal = req.principal;
  if (!principal) {
    next(new AppError('Authentication required', 401));
    return;
  }

  const raw = req.query['ids'];
  const idsResult = idsQuerySchema.safeParse(typeof raw === 'string' ? raw : '');
  if (!idsResult.success) {
    next(new AppError('Invalid user ids', 422));
    return;
  }

  try {
    res.status(200).json(getPublicUsersByIds(idsResult.data));
  } catch (error) {
    next(error);
  }
}

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
