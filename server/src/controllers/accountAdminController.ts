import type { NextFunction, Request, Response } from 'express';

import { requirePrincipal } from '../middlewares/auth.ts';
import { parseUuidParam } from './parseUuidParam.ts';
import { reinstateUser, suspendUser } from '../services/accountAdminService.ts';

export async function postSuspendUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const id = parseUuidParam(req, next, 'id', 'user id');
  if (id === undefined) {
    return;
  }

  try {
    res.status(200).json(await suspendUser(principal, id));
  } catch (error) {
    next(error);
  }
}

export async function postReinstateUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const id = parseUuidParam(req, next, 'id', 'user id');
  if (id === undefined) {
    return;
  }

  try {
    res.status(200).json(await reinstateUser(principal, id));
  } catch (error) {
    next(error);
  }
}
