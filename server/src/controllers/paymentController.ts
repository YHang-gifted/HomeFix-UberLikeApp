import { Buffer } from 'node:buffer';

import type { NextFunction, Request, Response } from 'express';

import { createPaymentInputSchema, paymentWebhookEventSchema } from '../../../shared/schemas.ts';
import { loadEnv } from '../config/env.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { parseUuidParam } from './parseUuidParam.ts';
import {
  buildPaymentReceipt,
  capturePaypalPayment,
  createPayment,
  getPayment,
  listMyPayments,
  payPayment,
  refundPayment,
} from '../services/paymentService.ts';
import { handlePaymentWebhook, verifyPaymentWebhook } from '../services/paymentWebhookService.ts';
import {
  activePaypalWebhookVerifier,
  handlePaypalWebhook,
} from '../services/paypalWebhookService.ts';
import {
  handleStripeWebhook,
  selectStripeEventConstructor,
} from '../services/stripeWebhookService.ts';

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

export async function getServiceRequestPaymentReceipt(
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
    res.status(200).json(await buildPaymentReceipt(id, principal));
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

export async function postServiceRequestPaypalCapture(
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
    res.status(200).json(await capturePaypalPayment(id, principal));
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
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    verifyPaymentWebhook(rawBody, req.header('x-webhook-signature') ?? undefined, loadEnv());

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

/**
 * Stripe hosted-checkout webhook (unauthenticated — verified by Stripe's own
 * signature). A `checkout.session.completed` event settles the matching payment.
 * Disabled (404) unless STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET are configured.
 */
export async function postStripeWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const construct = selectStripeEventConstructor(loadEnv());
    if (construct === undefined) {
      throw new AppError('Stripe webhooks are not configured', 404);
    }
    const signature = req.header('stripe-signature');
    if (signature === undefined) {
      throw new AppError('Missing Stripe signature', 400);
    }
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    await handleStripeWebhook(construct(rawBody, signature));
    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
}

/**
 * PayPal webhook (unauthenticated — verified via PayPal's verify-webhook-signature API).
 * A completed capture settles the payment; an approved order is captured server-side.
 * Disabled (404) unless the PayPal credentials + `PAYPAL_WEBHOOK_ID` are configured.
 */
export async function postPaypalWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const verify = activePaypalWebhookVerifier();
    if (verify === undefined) {
      throw new AppError('PayPal webhooks are not configured', 404);
    }
    const headers = {
      authAlgo: req.header('paypal-auth-algo') ?? '',
      certUrl: req.header('paypal-cert-url') ?? '',
      transmissionId: req.header('paypal-transmission-id') ?? '',
      transmissionSig: req.header('paypal-transmission-sig') ?? '',
      transmissionTime: req.header('paypal-transmission-time') ?? '',
    };
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    await handlePaypalWebhook(await verify(headers, rawBody));
    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
}
