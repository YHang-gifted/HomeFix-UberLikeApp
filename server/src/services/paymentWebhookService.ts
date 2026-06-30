import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';

import type { PaymentWebhookEvent } from '../../../shared/schemas.ts';
import type { Env } from '../config/env.ts';
import { AppError } from '../errors/appError.ts';
import { confirmPaymentPaid } from './paymentService.ts';

/** The webhook event type that settles a payment. Other types are ignored. */
const PAYMENT_SUCCEEDED = 'payment.succeeded';

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Authenticate a payment-provider webhook. When `PAYMENTS_WEBHOOK_SECRET` is set,
 * the request must carry a matching `x-webhook-secret`. When it is unset, the
 * (mock) webhook is accepted outside production but rejected in production, so a
 * real deployment can never confirm a payment without configuring the secret.
 * Throws `AppError(401)` when authentication fails.
 */
export function verifyPaymentWebhook(providedSecret: string | undefined, env: Env): void {
  const expected = env.PAYMENTS_WEBHOOK_SECRET;
  if (expected === undefined) {
    if (env.NODE_ENV === 'production') {
      throw new AppError('Payment webhooks are not configured', 401);
    }
    return;
  }
  if (providedSecret === undefined || !secretsMatch(providedSecret, expected)) {
    throw new AppError('Invalid webhook signature', 401);
  }
}

/**
 * Act on a verified webhook event. A `payment.succeeded` event settles the
 * referenced payment (idempotently); any other event type is acknowledged with
 * no effect.
 */
export async function handlePaymentWebhook(event: PaymentWebhookEvent): Promise<void> {
  if (event.type === PAYMENT_SUCCEEDED) {
    await confirmPaymentPaid(event.paymentId);
  }
}
