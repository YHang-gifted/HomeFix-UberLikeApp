import type { NextFunction, Request, Response } from 'express';

import { createCertificationInputSchema } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { addCertification, listMyCertifications } from '../services/certificationService.ts';

export async function postCertification(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const parsed = createCertificationInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid certification payload', 422));
    return;
  }

  try {
    res.status(201).json(await addCertification(parsed.data, principal));
  } catch (error) {
    next(error);
  }
}

export async function getMyCertifications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  try {
    res.status(200).json({ items: await listMyCertifications(principal) });
  } catch (error) {
    next(error);
  }
}
