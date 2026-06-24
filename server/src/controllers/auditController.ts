import type { NextFunction, Request, Response } from 'express';

import { paginationQuerySchema } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { listAuditEvents } from '../services/auditService.ts';

export async function getAuditEvents(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const parsed = paginationQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    next(new AppError('Invalid query parameters', 422));
    return;
  }

  try {
    const page = await listAuditEvents(principal, parsed.data.limit, parsed.data.offset);
    res.status(200).json(page);
  } catch (error) {
    next(error);
  }
}
