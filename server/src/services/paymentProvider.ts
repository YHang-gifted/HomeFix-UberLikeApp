import { randomUUID } from 'node:crypto';

import Stripe from 'stripe';

import { loadEnv } from '../config/env.ts';
import type { Env } from '../config/env.ts';

/** What a provider needs to open a charge for one of our payments. */
export interface PaymentChargeInput {
  paymentId: string;
  requestId: string;
  amountCents: number;
  currency: string;
}

/**
 * The provider's result: its own reference for the charge (stored on our payment
 * so webhooks can map back to it) and, for a real provider, a client secret the
 * app uses to complete the payment. The mock provider returns no secret.
 */
export interface PaymentChargeResult {
  providerRef: string;
  clientSecret?: string;
}

/**
 * The seam a real payment provider (Stripe / PayPal / ECPay …) slots into.
 * `createCharge` creates a PaymentIntent and returns its id + client secret; a
 * real webhook then references that id.
 */
export interface PaymentProvider {
  /**
   * True when the customer completes the payment at the provider's checkout (e.g.
   * Stripe), so the payment is settled only by the provider's verified webhook —
   * NOT by our mock `/pay` endpoint. False for the mock provider (dev/test).
   */
  readonly usesExternalCheckout: boolean;
  createCharge(input: PaymentChargeInput): Promise<PaymentChargeResult>;
}

/**
 * The default, inert provider. It assigns a deterministic-looking mock reference
 * and contacts nothing external — honoring the project rule against provider-side
 * production actions. A real provider is config-gated and swapped in at
 * {@link selectPaymentProvider} without touching callers.
 */
export const mockPaymentProvider: PaymentProvider = {
  usesExternalCheckout: false,
  createCharge(_input: PaymentChargeInput): Promise<PaymentChargeResult> {
    return Promise.resolve({ providerRef: `mock_${randomUUID()}` });
  },
};

/** The subset of a Stripe PaymentIntent we depend on. */
export interface StripeIntentResult {
  id: string;
  client_secret: string | null;
}

/**
 * Creates a Stripe PaymentIntent. Injected so the adapter is unit-testable without
 * the SDK making a network call; the real one is {@link stripeIntentCreator}.
 */
export type CreateStripeIntent = (
  params: { amount: number; currency: string; metadata: Record<string, string> },
  options: { idempotencyKey: string },
) => Promise<StripeIntentResult>;

/**
 * A real payment provider backed by Stripe. `createCharge` opens a PaymentIntent
 * for the amount and returns its id (stored as our `providerRef`) plus the client
 * secret the app uses to confirm the payment. The payment id is the idempotency
 * key, so a retry never opens a second intent for the same payment.
 *
 * Note: the amount is passed in the currency's minor unit (cents). Verify the
 * minor-unit convention for zero-decimal currencies in Stripe before going live.
 */
export function createStripePaymentProvider(createIntent: CreateStripeIntent): PaymentProvider {
  return {
    usesExternalCheckout: true,
    async createCharge(input: PaymentChargeInput): Promise<PaymentChargeResult> {
      const intent = await createIntent(
        {
          amount: input.amountCents,
          currency: input.currency.toLowerCase(),
          metadata: { paymentId: input.paymentId, requestId: input.requestId },
        },
        { idempotencyKey: input.paymentId },
      );
      return {
        providerRef: intent.id,
        ...(intent.client_secret !== null ? { clientSecret: intent.client_secret } : {}),
      };
    },
  };
}

/** The real Stripe-backed intent creator (only constructed when a key is set). */
function stripeIntentCreator(secretKey: string): CreateStripeIntent {
  const stripe = new Stripe(secretKey);
  return (params, options) => stripe.paymentIntents.create(params, options);
}

/**
 * Choose the payment provider from configuration: real Stripe when
 * `STRIPE_SECRET_KEY` is set, otherwise the inert mock. The key is supplied by the
 * operator via the environment and is never committed.
 */
export function selectPaymentProvider(env: Env = loadEnv()): PaymentProvider {
  const secretKey = env.STRIPE_SECRET_KEY;
  return secretKey !== undefined
    ? createStripePaymentProvider(stripeIntentCreator(secretKey))
    : mockPaymentProvider;
}

export const paymentProvider: PaymentProvider = selectPaymentProvider();
