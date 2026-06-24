import type { NextFunction, Request, Response } from 'express';

import { updateProfileInputSchema } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { getProfile, updateProfile } from '../services/profileService.ts';

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }
  try {
    res.status(200).json(await getProfile(principal));
  } catch (error) {
    next(error);
  }
}

export async function patchMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }
  const parsed = updateProfileInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid profile payload', 422));
    return;
  }
  try {
    res.status(200).json(await updateProfile(principal, parsed.data));
  } catch (error) {
    next(error);
  }
}
