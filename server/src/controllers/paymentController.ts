import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { createPaymentInputSchema } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { createPayment, getPayment, payPayment } from '../services/paymentService.ts';

const idParamSchema = z.uuid();

export async function getServiceRequestPayment(
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
    res.status(200).json(await getPayment(idResult.data, principal));
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

  const idResult = idParamSchema.safeParse(req.params['id']);
  if (!idResult.success) {
    next(new AppError('Invalid service request id', 422));
    return;
  }

  const parsed = createPaymentInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid payment payload', 422));
    return;
  }

  try {
    res.status(201).json(await createPayment(idResult.data, parsed.data, principal));
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

  const idResult = idParamSchema.safeParse(req.params['id']);
  if (!idResult.success) {
    next(new AppError('Invalid service request id', 422));
    return;
  }

  try {
    res.status(200).json(await payPayment(idResult.data, principal));
  } catch (error) {
    next(error);
  }
}
