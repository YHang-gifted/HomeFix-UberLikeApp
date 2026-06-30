import type { NextFunction, Request, Response } from 'express';

import { createPaymentInputSchema, paymentWebhookEventSchema } from '../../../shared/schemas.ts';
import { loadEnv } from '../config/env.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { parseUuidParam } from './parseUuidParam.ts';
import {
  createPayment,
  getPayment,
  listMyPayments,
  payPayment,
  refundPayment,
} from '../services/paymentService.ts';
import { handlePaymentWebhook, verifyPaymentWebhook } from '../services/paymentWebhookService.ts';

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

export async function getMyPayments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  try {
    res.status(200).json({ items: await listMyPayments(principal) });
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

export async function postServiceRequestPaymentRefund(
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
    res.status(200).json(await refundPayment(id, principal));
  } catch (error) {
    next(error);
  }
}

/**
 * Payment-provider webhook (unauthenticated — verified by a shared secret rather
 * than a session). Confirms a payment out-of-band; this is the seam a real
 * provider calls in place of the mock checkout.
 */
export async function postPaymentWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.header('x-webhook-secret');
    verifyPaymentWebhook(header ?? undefined, loadEnv());

    const parsed = paymentWebhookEventSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new AppError('Invalid webhook payload', 422));
      return;
    }

    await handlePaymentWebhook(parsed.data);
    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
}
