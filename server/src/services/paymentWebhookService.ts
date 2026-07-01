import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';

import type { PaymentWebhookEvent } from '../../../shared/schemas.ts';
import type { Env } from '../config/env.ts';
import { AppError } from '../errors/appError.ts';
import { confirmPaymentPaidByRef, confirmPaymentRefundedByRef } from './paymentService.ts';

/** The webhook event types we act on; any other type is acknowledged and ignored. */
const PAYMENT_SUCCEEDED = 'payment.succeeded';
const PAYMENT_REFUNDED = 'payment.refunded';

function signaturesMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Authenticate a payment-provider webhook by verifying an HMAC-SHA256 signature
 * over the raw request body (what real providers sign — the signature covers the
 * exact bytes, so a tampered payload fails). When `PAYMENTS_WEBHOOK_SECRET` is set,
 * the request's `x-webhook-signature` must equal `hmac_sha256(secret, rawBody)`.
 * When it is unset, the (mock) webhook is accepted outside production but rejected
 * in production, so a real deployment can never confirm a payment without a secret.
 * Throws `AppError(401)` when authentication fails.
 */
export function verifyPaymentWebhook(
  rawBody: Buffer,
  providedSignature: string | undefined,
  env: Env,
): void {
  const secret = env.PAYMENTS_WEBHOOK_SECRET;
  if (secret === undefined) {
    if (env.NODE_ENV === 'production') {
      throw new AppError('Payment webhooks are not configured', 401);
    }
    return;
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  if (providedSignature === undefined || !signaturesMatch(providedSignature, expected)) {
    throw new AppError('Invalid webhook signature', 401);
  }
}

/**
 * Act on a verified webhook event. The event identifies the charge by the
 * provider's own reference (`providerRef`), which we map back to our payment. A
 * `payment.succeeded` event settles it and `payment.refunded` reverses it, both
 * idempotently; any other event type is acknowledged with no effect (and no
 * lookup, so unrelated events never 404).
 */
export async function handlePaymentWebhook(event: PaymentWebhookEvent): Promise<void> {
  if (event.type === PAYMENT_SUCCEEDED) {
    await confirmPaymentPaidByRef(event.providerRef);
    return;
  }
  if (event.type === PAYMENT_REFUNDED) {
    await confirmPaymentRefundedByRef(event.providerRef);
  }
}
