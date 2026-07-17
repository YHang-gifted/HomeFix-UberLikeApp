import type { NextFunction, Request, Response } from 'express';

import { createRefundRequestInputSchema } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { parseUuidParam } from './parseUuidParam.ts';
import { getRefundRequest, requestRefund } from '../services/refundRequestService.ts';

function parseId(req: Request, next: NextFunction): string | undefined {
  return parseUuidParam(req, next, 'id', 'service request id');
}

/** The owning customer files a refund request on a paid payment. */
export async function postServiceRequestRefundRequest(
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

  const parsed = createRefundRequestInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid refund request payload', 422));
    return;
  }

  try {
    res.status(201).json(await requestRefund(id, principal, parsed.data));
  } catch (error) {
    next(error);
  }
}

/** View the refund request for a request (owning customer or admin). */
export async function getServiceRequestRefundRequest(
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
    res.status(200).json(await getRefundRequest(id, principal));
  } catch (error) {
    next(error);
  }
}
