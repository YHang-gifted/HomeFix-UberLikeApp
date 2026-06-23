import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { AppError } from '../errors/appError.ts';
import { listAuditEvents } from '../services/auditService.ts';

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function getAuditEvents(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = req.principal;
  if (!principal) {
    next(new AppError('Authentication required', 401));
    return;
  }

  const parsed = auditQuerySchema.safeParse(req.query);
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
