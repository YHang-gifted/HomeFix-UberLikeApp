import type { NextFunction, Request, Response } from 'express';

import { requirePrincipal } from '../middlewares/auth.ts';
import { parseUuidParam } from './parseUuidParam.ts';
import { addFavorite, listFavorites, removeFavorite } from '../services/favoriteService.ts';

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

  const workerId = parseUuidParam(req, next, 'workerId', 'worker id');
  if (workerId === undefined) {
    return;
  }

  try {
    res.status(200).json(await addFavorite(principal, workerId));
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

  const workerId = parseUuidParam(req, next, 'workerId', 'worker id');
  if (workerId === undefined) {
    return;
  }

  try {
    res.status(200).json(await removeFavorite(principal, workerId));
  } catch (error) {
    next(error);
  }
}
