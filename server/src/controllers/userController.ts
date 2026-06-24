import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
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

export async function getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const raw = req.query['ids'];
  const idsResult = idsQuerySchema.safeParse(typeof raw === 'string' ? raw : '');
  if (!idsResult.success) {
    next(new AppError('Invalid user ids', 422));
    return;
  }

  try {
    res.status(200).json(await getPublicUsersByIds(idsResult.data));
  } catch (error) {
    next(error);
  }
}

export async function getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const idResult = idSchema.safeParse(req.params['id']);
  if (!idResult.success) {
    next(new AppError('Invalid user id', 422));
    return;
  }

  try {
    res.status(200).json(await getPublicUserById(idResult.data));
  } catch (error) {
    next(error);
  }
}
