import type { NextFunction, Request, Response } from 'express';

import { registerDeviceTokenInputSchema } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { registerDeviceToken } from '../services/deviceTokenService.ts';

export async function postDeviceToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const parsed = registerDeviceTokenInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid device token payload', 422));
    return;
  }

  try {
    const tokens = await registerDeviceToken(principal, parsed.data.token);
    res.status(201).json({ tokens });
  } catch (error) {
    next(error);
  }
}
