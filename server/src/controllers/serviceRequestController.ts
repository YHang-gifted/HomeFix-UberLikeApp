import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import {
  createMessageInputSchema,
  createServiceRequestInputSchema,
  paginationQuerySchema,
  serviceRequestStatusSchema,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { parseUuidParam } from './parseUuidParam.ts';
import { listMessages, postMessage } from '../services/messageService.ts';
import {
  assignWorker,
  claimRequest,
  createServiceRequest,
  getRequestContacts,
  getRequestHistory,
  getServiceRequestForPrincipal,
  listAvailableRequests,
  listServiceRequests,
  releaseRequest,
  updateServiceRequestStatus,
} from '../services/serviceRequestService.ts';

function parseId(req: Request, next: NextFunction): string | undefined {
  return parseUuidParam(req, next, 'id', 'service request id');
}
const statusBodySchema = z.object({
  status: serviceRequestStatusSchema,
  reason: z.string().trim().min(1).max(500).optional(),
});
const assignBodySchema = z.object({ workerId: z.uuid() });
const listQuerySchema = paginationQuerySchema.extend({
  status: serviceRequestStatusSchema.optional(),
  q: z.string().trim().max(100).optional(),
});
const availableQuerySchema = paginationQuerySchema.extend({
  category: z.string().trim().min(1).max(50).optional(),
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

export async function getAvailableServiceRequests(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const parsed = availableQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    next(new AppError('Invalid query parameters', 422));
    return;
  }

  try {
    const page = await listAvailableRequests(
      principal,
      parsed.data.limit,
      parsed.data.offset,
      parsed.data.category,
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

  const id = parseId(req, next);
  if (id === undefined) {
    return;
  }

  try {
    const request = await getServiceRequestForPrincipal(id, principal);
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

  const id = parseId(req, next);
  if (id === undefined) {
    return;
  }

  try {
    res.status(200).json(await getRequestContacts(id, principal));
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

  const id = parseId(req, next);
  if (id === undefined) {
    return;
  }

  try {
    res.status(200).json(await getRequestHistory(id, principal));
  } catch (error) {
    next(error);
  }
}

export async function getServiceRequestMessages(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const id = parseId(req, next);
  if (id === undefined) {
    return;
  }

  try {
    res.status(200).json(await listMessages(id, principal));
  } catch (error) {
    next(error);
  }
}

export async function postServiceRequestMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const id = parseId(req, next);
  if (id === undefined) {
    return;
  }

  const parsed = createMessageInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid message payload', 422));
    return;
  }

  try {
    res.status(201).json(await postMessage(id, parsed.data, principal));
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

  const id = parseId(req, next);
  if (id === undefined) {
    return;
  }

  const body: unknown = req.body;
  const parsed = assignBodySchema.safeParse(body);
  if (!parsed.success) {
    next(new AppError('Invalid assignment payload', 422));
    return;
  }

  try {
    const updated = await assignWorker(id, parsed.data.workerId, principal);
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

export async function patchServiceRequestClaim(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const id = parseId(req, next);
  if (id === undefined) {
    return;
  }

  try {
    const updated = await claimRequest(id, principal);
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

export async function patchServiceRequestRelease(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const id = parseId(req, next);
  if (id === undefined) {
    return;
  }

  try {
    res.status(200).json(await releaseRequest(id, principal));
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

  const id = parseId(req, next);
  if (id === undefined) {
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
      id,
      parsed.data.status,
      principal,
      parsed.data.reason,
    );
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}
