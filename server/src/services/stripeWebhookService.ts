import type { Buffer } from 'node:buffer';

import Stripe from 'stripe';

import { loadEnv } from '../config/env.ts';
import type { Env } from '../config/env.ts';
import { AppError } from '../errors/appError.ts';
import { confirmPaymentPaid } from './paymentService.ts';

/** The Stripe event type that signals the customer finished hosted checkout. */
const CHECKOUT_COMPLETED = 'checkout.session.completed';

/**
 * The reduced Stripe event we act on: its type and the id of *our* payment, read
 * from the metadata we set when opening the Checkout Session. Using our own id (not
 * Stripe's) as the join key avoids the session-id-vs-PaymentIntent-id ambiguity —
 * the session metadata is always present and is what the signed event echoes back.
 */
export interface StripeWebhookEvent {
  type: string;
  paymentId: string | null;
}

/**
 * Verifies a Stripe webhook's `Stripe-Signature` over the raw body and returns the
 * reduced event. Injected so the handler is unit-testable without the SDK making a
 * network call (signature verification itself is local); the real one is
 * {@link stripeEventConstructor}. Throws `AppError(401)` on a bad/absent signature.
 */
export type ConstructStripeEvent = (rawBody: Buffer, signature: string) => StripeWebhookEvent;

/** Resolved Stripe webhook configuration. */
interface StripeWebhookConfig {
  secretKey: string;
  webhookSecret: string;
}

/**
 * The real Stripe event constructor. `stripe.webhooks.constructEvent` verifies the
 * HMAC signature locally (no network) and throws if it doesn't match; we surface
 * that as a 401. The metadata carries our payment id (set on the Checkout Session in
 * {@link stripeCheckoutCreator}).
 */
export function stripeEventConstructor(config: StripeWebhookConfig): ConstructStripeEvent {
  const stripe = new Stripe(config.secretKey);
  return (rawBody, signature) => {
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret);
    } catch {
      throw new AppError('Invalid Stripe webhook signature', 401);
    }
    const object = event.data.object as { metadata?: Record<string, string> | null };
    return { type: event.type, paymentId: object.metadata?.['paymentId'] ?? null };
  };
}

/**
 * Resolve the real Stripe event constructor from the environment, or undefined when
 * Stripe webhooks aren't configured (no secret key or no webhook secret) — in which
 * case the endpoint is disabled.
 */
export function selectStripeEventConstructor(
  env: Env = loadEnv(),
): ConstructStripeEvent | undefined {
  const secretKey = env.STRIPE_SECRET_KEY;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (secretKey === undefined || webhookSecret === undefined) {
    return undefined;
  }
  return stripeEventConstructor({ secretKey, webhookSecret });
}

/**
 * Act on a verified Stripe event. A `checkout.session.completed` carrying our
 * payment id settles that payment idempotently (a retried delivery is a no-op).
 * Any other event type — or one without our metadata — is acknowledged with no
 * effect, so unrelated Stripe events never touch a payment or 404.
 */
export async function handleStripeWebhook(event: StripeWebhookEvent): Promise<void> {
  if (event.type !== CHECKOUT_COMPLETED || event.paymentId === null) {
    return;
  }
  await confirmPaymentPaid(event.paymentId);
}
