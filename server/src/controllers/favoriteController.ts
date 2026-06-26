import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { addFavorite, listFavorites, removeFavorite } from '../services/favoriteService.ts';

const workerIdSchema = z.uuid();

export async function getFavorites(req: Request, res: Response, next: NextFunction): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  try {
    res.status(200).json(await listFavorites(principal));
  } catch (error) {
    next(error);
  }
}

export async function putFavorite(req: Request, res: Response, next: NextFunction): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const idResult = workerIdSchema.safeParse(req.params['workerId']);
  if (!idResult.success) {
    next(new AppError('Invalid worker id', 422));
    return;
  }

  try {
    res.status(200).json(await addFavorite(principal, idResult.data));
  } catch (error) {
    next(error);
  }
}

export async function deleteFavorite(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const idResult = workerIdSchema.safeParse(req.params['workerId']);
  if (!idResult.success) {
    next(new AppError('Invalid worker id', 422));
    return;
  }

  try {
    res.status(200).json(await removeFavorite(principal, idResult.data));
  } catch (error) {
    next(error);
  }
}
