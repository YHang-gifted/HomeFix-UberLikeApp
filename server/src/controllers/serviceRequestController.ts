import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import {
  createServiceRequestInputSchema,
  serviceRequestStatusSchema,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import {
  createServiceRequest,
  getServiceRequestForPrincipal,
  updateServiceRequestStatus,
} from '../services/serviceRequestService.ts';

const idParamSchema = z.uuid();
const statusBodySchema = z.object({ status: serviceRequestStatusSchema });

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

export function patchServiceRequestStatus(req: Request, res: Response, next: NextFunction): void {
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

  const body: unknown = req.body;
  const parsed = statusBodySchema.safeParse(body);
  if (!parsed.success) {
    next(new AppError('Invalid status payload', 422));
    return;
  }

  try {
    const updated = updateServiceRequestStatus(idResult.data, parsed.data.status, principal);
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}
