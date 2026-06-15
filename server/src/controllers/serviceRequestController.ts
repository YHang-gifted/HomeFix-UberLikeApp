import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { createServiceRequestInputSchema } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import {
  createServiceRequest,
  getServiceRequestForPrincipal,
} from '../services/serviceRequestService.ts';

const idParamSchema = z.uuid();

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

export function getServiceRequest(req: Request, res: Response, next: NextFunction): void {
  const principal = req.principal;
  if (!principal) {
    next(new AppError('Authentication required', 401));
    return;
  }

  const idResult = idParamSchema.safeParse(req.params['id']);
  if (!idResult.success) {
    next(new AppError('Invalid service request id', 422));
    return;
  }

  try {
    const request = getServiceRequestForPrincipal(idResult.data, principal);
    res.status(200).json(request);
  } catch (error) {
    next(error);
  }
}
