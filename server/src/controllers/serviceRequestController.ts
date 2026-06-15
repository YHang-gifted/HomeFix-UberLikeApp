import type { NextFunction, Request, Response } from 'express';

import { createServiceRequestInputSchema } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { createServiceRequest } from '../services/serviceRequestService.ts';

export function postServiceRequest(req: Request, res: Response, next: NextFunction): void {
  const principal = req.principal;
  if (!principal) {
    next(new AppError('Authentication required', 401));
    return;
  }

  const body: unknown = req.body;
  const parsed = createServiceRequestInputSchema.safeParse(body);
  if (!parsed.success) {
    next(new AppError('Invalid service request payload', 422));
    return;
  }

  try {
    const created = createServiceRequest(parsed.data, principal);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}
