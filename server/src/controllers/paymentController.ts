import type { NextFunction, Request, Response } from 'express';

import { createPaymentInputSchema } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { parseUuidParam } from './parseUuidParam.ts';
import { createPayment, getPayment, payPayment } from '../services/paymentService.ts';

function parseId(req: Request, next: NextFunction): string | undefined {
  return parseUuidParam(req, next, 'id', 'service request id');
}

export async function getServiceRequestPayment(
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
    res.status(200).json(await getPayment(id, principal));
  } catch (error) {
    next(error);
  }
}

export async function postServiceRequestPayment(
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

  const parsed = createPaymentInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid payment payload', 422));
    return;
  }

  try {
    res.status(201).json(await createPayment(id, parsed.data, principal));
  } catch (error) {
    next(error);
  }
}

export async function postServiceRequestPaymentPay(
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
    res.status(200).json(await payPayment(id, principal));
  } catch (error) {
    next(error);
  }
}
