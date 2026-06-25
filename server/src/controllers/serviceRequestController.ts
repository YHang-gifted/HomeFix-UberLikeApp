import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import {
  createServiceRequestInputSchema,
  paginationQuerySchema,
  serviceRequestStatusSchema,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import {
  assignWorker,
  createServiceRequest,
  getRequestContacts,
  getRequestHistory,
  getServiceRequestForPrincipal,
  listServiceRequests,
  updateServiceRequestStatus,
} from '../services/serviceRequestService.ts';

const idParamSchema = z.uuid();
const statusBodySchema = z.object({
  status: serviceRequestStatusSchema,
  reason: z.string().trim().min(1).max(500).optional(),
});
const assignBodySchema = z.object({ workerId: z.uuid() });
const listQuerySchema = paginationQuerySchema.extend({
  status: serviceRequestStatusSchema.optional(),
  q: z.string().trim().max(100).optional(),
});

export async function postServiceRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const body: unknown = req.body;
  const parsed = createServiceRequestInputSchema.safeParse(body);
  if (!parsed.success) {
    next(new AppError('Invalid service request payload', 422));
    return;
  }

  try {
    const created = await createServiceRequest(parsed.data, principal);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

export async function getServiceRequests(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const query: unknown = req.query;
  const parsed = listQuerySchema.safeParse(query);
  if (!parsed.success) {
    next(new AppError('Invalid query parameters', 422));
    return;
  }

  try {
    const page = await listServiceRequests(
      principal,
      parsed.data.limit,
      parsed.data.offset,
      parsed.data.status,
      parsed.data.q,
    );
    res.status(200).json(page);
  } catch (error) {
    next(error);
  }
}

export async function getServiceRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const idResult = idParamSchema.safeParse(req.params['id']);
  if (!idResult.success) {
    next(new AppError('Invalid service request id', 422));
    return;
  }

  try {
    const request = await getServiceRequestForPrincipal(idResult.data, principal);
    res.status(200).json(request);
  } catch (error) {
    next(error);
  }
}

export async function getServiceRequestContacts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const idResult = idParamSchema.safeParse(req.params['id']);
  if (!idResult.success) {
    next(new AppError('Invalid service request id', 422));
    return;
  }

  try {
    res.status(200).json(await getRequestContacts(idResult.data, principal));
  } catch (error) {
    next(error);
  }
}

export async function getServiceRequestHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const idResult = idParamSchema.safeParse(req.params['id']);
  if (!idResult.success) {
    next(new AppError('Invalid service request id', 422));
    return;
  }

  try {
    res.status(200).json(await getRequestHistory(idResult.data, principal));
  } catch (error) {
    next(error);
  }
}

export async function patchServiceRequestAssignment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const idResult = idParamSchema.safeParse(req.params['id']);
  if (!idResult.success) {
    next(new AppError('Invalid service request id', 422));
    return;
  }

  const body: unknown = req.body;
  const parsed = assignBodySchema.safeParse(body);
  if (!parsed.success) {
    next(new AppError('Invalid assignment payload', 422));
    return;
  }

  try {
    const updated = await assignWorker(idResult.data, parsed.data.workerId, principal);
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

export async function patchServiceRequestStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
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
    const updated = await updateServiceRequestStatus(
      idResult.data,
      parsed.data.status,
      principal,
      parsed.data.reason,
    );
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}
