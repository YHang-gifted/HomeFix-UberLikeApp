import type { NextFunction, Request, Response } from 'express';

import {
  certificationStatusSchema,
  createCertificationInputSchema,
  reviewCertificationInputSchema,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import {
  addCertification,
  listCertificationsByStatus,
  listMyCertifications,
  reviewCertification,
} from '../services/certificationService.ts';
import { parseUuidParam } from './parseUuidParam.ts';

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

export async function getAdminCertifications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  // Default to the pending review queue; allow ?status=verified|rejected|pending.
  const status = req.query['status'] ?? 'pending';
  const parsed = certificationStatusSchema.safeParse(status);
  if (!parsed.success) {
    next(new AppError('Invalid status filter', 422));
    return;
  }

  try {
    res.status(200).json({ items: await listCertificationsByStatus(parsed.data, principal) });
  } catch (error) {
    next(error);
  }
}

export async function postCertificationReview(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const id = parseUuidParam(req, next, 'id', 'certification id');
  if (id === undefined) {
    return;
  }

  const parsed = reviewCertificationInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid review payload', 422));
    return;
  }

  try {
    res.status(200).json(await reviewCertification(id, parsed.data, principal));
  } catch (error) {
    next(error);
  }
}
