import { Buffer } from 'node:buffer';

import type { NextFunction, Request, Response } from 'express';

import { payoutWebhookEventSchema } from '../../../shared/schemas.ts';
import { loadEnv } from '../config/env.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import {
  handleConnectWebhook,
  selectConnectEventConstructor,
} from '../services/connectWebhookService.ts';
import { handlePayoutWebhook, listMyPayouts, myEarnings } from '../services/payoutService.ts';
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

export async function getMyEarnings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  try {
    res.status(200).json(await myEarnings(principal));
  } catch (error) {
    next(error);
  }
}

/**
 * Payout-provider webhook (unauthenticated — verified by an HMAC signature over
 * the raw body, the same scheme as the payment webhook). Confirms a payout was
 * settled to the worker's account. The seam a real provider calls; mock by default.
 */
export async function postPayoutWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    verifyPaymentWebhook(rawBody, req.header('x-webhook-signature') ?? undefined, loadEnv());

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

/**
 * Stripe Connect webhook (unauthenticated — verified by Stripe's own signature). An
 * `account.updated` event records whether the worker's connected account can receive
 * payouts. Disabled (404) unless STRIPE_SECRET_KEY + STRIPE_CONNECT_WEBHOOK_SECRET are set.
 */
export async function postConnectWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const construct = selectConnectEventConstructor(loadEnv());
    if (construct === undefined) {
      throw new AppError('Connect webhooks are not configured', 404);
    }
    const signature = req.header('stripe-signature');
    if (signature === undefined) {
      throw new AppError('Missing Stripe signature', 400);
    }
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    await handleConnectWebhook(construct(rawBody, signature));
    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
}
