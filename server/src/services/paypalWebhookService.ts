import { loadEnv } from '../config/env.ts';
import type { PaypalWebhookEvent, VerifyPaypalWebhook } from './paymentProvider.ts';
import { selectPaypalWebhookVerifier } from './paymentProvider.ts';
import { confirmPaymentPaid, settlePaypalOrderById } from './paymentService.ts';

/** Buyer approved the order (may not have returned to complete capture). */
const ORDER_APPROVED = 'CHECKOUT.ORDER.APPROVED';
/** A capture completed (the app-return capture, or one we drove from the webhook). */
const CAPTURE_COMPLETED = 'PAYMENT.CAPTURE.COMPLETED';

// The verifier has a globalThis-anchored test override (a fake avoids the network call to
// PayPal's verify-webhook-signature API while still exercising the handler). Anchored on
// globalThis, not a module-local `let`, so it reaches the request path under tsx.
const VERIFIER_OVERRIDE_KEY = '__homefixPaypalWebhookVerifierOverride__';

function verifierRegistry(): Record<string, VerifyPaypalWebhook | undefined> {
  return globalThis as unknown as Record<string, VerifyPaypalWebhook | undefined>;
}

export function activePaypalWebhookVerifier(): VerifyPaypalWebhook | undefined {
  return verifierRegistry()[VERIFIER_OVERRIDE_KEY] ?? selectPaypalWebhookVerifier(loadEnv());
}

export function setPaypalWebhookVerifierForTests(verifier: VerifyPaypalWebhook): void {
  verifierRegistry()[VERIFIER_OVERRIDE_KEY] = verifier;
}

export function resetPaypalWebhookVerifierForTests(): void {
  verifierRegistry()[VERIFIER_OVERRIDE_KEY] = undefined;
}

/**
 * Act on a verified PayPal webhook. A completed capture settles the payment by its
 * `custom_id` (our paymentId); an approved order is captured server-side and then settled
 * — the backup for a buyer who approved but never returned to complete it. Both are
 * idempotent (a retried delivery, or one racing the app-return capture, is a no-op), and
 * any other event type is acknowledged with no effect.
 */
export async function handlePaypalWebhook(event: PaypalWebhookEvent): Promise<void> {
  if (event.type === CAPTURE_COMPLETED && event.paymentId !== null) {
    await confirmPaymentPaid(event.paymentId);
    return;
  }
  if (event.type === ORDER_APPROVED && event.orderId !== null) {
    await settlePaypalOrderById(event.orderId);
  }
}
