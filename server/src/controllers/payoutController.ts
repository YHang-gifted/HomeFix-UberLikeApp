import type { NextFunction, Request, Response } from 'express';

import { payoutWebhookEventSchema } from '../../../shared/schemas.ts';
import { loadEnv } from '../config/env.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { handlePayoutWebhook, listMyPayouts } from '../services/payoutService.ts';
import { verifyPaymentWebhook } from '../services/paymentWebhookService.ts';

export async function getMyPayouts(req: Request, res: Response, next: NextFunction): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  try {
    res.status(200).json({ items: await listMyPayouts(principal) });
  } catch (error) {
    next(error);
  }
}

/**
 * Payout-provider webhook (unauthenticated — verified by the shared webhook
 * secret). Confirms a payout was settled to the worker's account. The seam a real
 * provider calls; mock by default.
 */
export async function postPayoutWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    verifyPaymentWebhook(req.header('x-webhook-secret') ?? undefined, loadEnv());

    const parsed = payoutWebhookEventSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new AppError('Invalid webhook payload', 422));
      return;
    }

    await handlePayoutWebhook(parsed.data);
    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
}
