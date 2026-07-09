import { randomUUID } from 'node:crypto';

import Stripe from 'stripe';

import type { PaymentMethod, PaymentProviderId } from '../../../shared/schemas.ts';
import { loadEnv } from '../config/env.ts';
import type { Env } from '../config/env.ts';
import { AppError } from '../errors/appError.ts';

/** What a provider needs to open a charge for one of our payments. */
export interface PaymentChargeInput {
  paymentId: string;
  requestId: string;
  amountCents: number;
  currency: string;
}

/**
 * The provider's result: its own reference for the charge (stored on our payment so
 * webhooks can map back to it) and, for a real provider using hosted checkout, the
 * URL the app sends the customer to. The mock provider returns neither.
 */
export interface PaymentChargeResult {
  providerRef: string;
  clientSecret?: string;
  /** Hosted checkout URL to redirect the customer to (e.g. a Stripe Checkout page). */
  checkoutUrl?: string;
}

/**
 * The seam a real payment provider (Stripe / PayPal / ECPay …) slots into.
 * `createCharge` opens a charge and returns its provider reference plus, for a
 * hosted-checkout provider, the URL to send the customer to; a verified webhook
 * later confirms the payment by that reference.
 */
export interface PaymentProvider {
  /** Which backend this is (recorded on the payment so webhooks/refunds route back). */
  readonly id: PaymentProviderId;
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
  id: 'mock',
  usesExternalCheckout: false,
  createCharge(_input: PaymentChargeInput): Promise<PaymentChargeResult> {
    return Promise.resolve({ providerRef: `mock_${randomUUID()}` });
  },
};

/** The subset of a Stripe Checkout Session we depend on. */
export interface StripeCheckoutSessionResult {
  id: string;
  url: string | null;
  /** The PaymentIntent id the session created (a webhook references it). */
  paymentIntentId: string | null;
}

/**
 * Creates a Stripe Checkout Session. Injected so the adapter is unit-testable
 * without the SDK making a network call; the real one is {@link stripeCheckoutCreator}.
 */
export type CreateStripeCheckoutSession = (
  params: { amountCents: number; currency: string; metadata: Record<string, string> },
  options: { idempotencyKey: string },
) => Promise<StripeCheckoutSessionResult>;

/**
 * A real payment provider backed by Stripe hosted Checkout. `createCharge` opens a
 * Checkout Session for the amount and returns the URL the app redirects the
 * customer to, plus the PaymentIntent id (stored as our `providerRef`) so the
 * webhook can map the completed payment back. The payment id is the idempotency
 * key, so a retry never opens a second session for the same payment.
 *
 * Note: the amount is passed in the currency's minor unit (cents). Verify the
 * minor-unit convention for zero-decimal currencies in Stripe before going live.
 */
export function createStripePaymentProvider(
  createSession: CreateStripeCheckoutSession,
): PaymentProvider {
  return {
    id: 'stripe',
    usesExternalCheckout: true,
    async createCharge(input: PaymentChargeInput): Promise<PaymentChargeResult> {
      const session = await createSession(
        {
          amountCents: input.amountCents,
          currency: input.currency.toLowerCase(),
          metadata: { paymentId: input.paymentId, requestId: input.requestId },
        },
        { idempotencyKey: input.paymentId },
      );
      return {
        // Prefer the PaymentIntent id (what the webhook references); fall back to the
        // session id if Stripe hasn't populated it.
        providerRef: session.paymentIntentId ?? session.id,
        ...(session.url !== null ? { checkoutUrl: session.url } : {}),
      };
    },
  };
}

/** Resolved Stripe configuration. */
interface StripeConfig {
  secretKey: string;
  successUrl: string;
  cancelUrl: string;
}

/** The real Stripe-backed Checkout Session creator (only built when configured). */
function stripeCheckoutCreator(config: StripeConfig): CreateStripeCheckoutSession {
  const stripe = new Stripe(config.secretKey);
  return async (params, options) => {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: params.currency,
              unit_amount: params.amountCents,
              product_data: { name: 'HomeFix service payment' },
            },
          },
        ],
        metadata: params.metadata,
        payment_intent_data: { metadata: params.metadata },
        success_url: config.successUrl,
        cancel_url: config.cancelUrl,
      },
      options,
    );
    const intent = session.payment_intent;
    return {
      id: session.id,
      url: session.url,
      paymentIntentId: typeof intent === 'string' ? intent : (intent?.id ?? null),
    };
  };
}

/**
 * Resolve the Stripe config from the environment. Returns undefined (→ mock) when
 * no key is set; throws when a key is set but the required checkout return URLs are
 * missing, so a half-configured provider fails fast rather than silently.
 */
function stripeConfigFromEnv(env: Env): StripeConfig | undefined {
  const secretKey = env.STRIPE_SECRET_KEY;
  if (secretKey === undefined) {
    return undefined;
  }
  const successUrl = env.STRIPE_CHECKOUT_SUCCESS_URL;
  const cancelUrl = env.STRIPE_CHECKOUT_CANCEL_URL;
  if (successUrl === undefined || cancelUrl === undefined) {
    throw new AppError(
      'STRIPE_SECRET_KEY is set but STRIPE_CHECKOUT_SUCCESS_URL and STRIPE_CHECKOUT_CANCEL_URL are required for Stripe checkout.',
      500,
    );
  }
  return { secretKey, successUrl, cancelUrl };
}

/**
 * Choose the payment provider from configuration: real Stripe hosted checkout when
 * `STRIPE_SECRET_KEY` (+ return URLs) is set, otherwise the inert mock. Credentials
 * are supplied by the operator via the environment and never committed.
 */
export function selectPaymentProvider(env: Env = loadEnv()): PaymentProvider {
  const config = stripeConfigFromEnv(env);
  return config !== undefined
    ? createStripePaymentProvider(stripeCheckoutCreator(config))
    : mockPaymentProvider;
}

/**
 * Resolve the provider for the customer's chosen method, so multiple providers can
 * coexist. `card` (or an unspecified method, for back-compat) uses the configured card
 * provider — Stripe when set, otherwise the mock. `paypal` will use the PayPal adapter
 * once it is wired; until then it is unavailable (400) rather than silently charging via
 * another provider.
 */
export function selectPaymentProviderForMethod(
  method: PaymentMethod | undefined,
  env: Env = loadEnv(),
): PaymentProvider {
  if (method === 'paypal') {
    throw new AppError('PayPal is not available yet — please choose card.', 400);
  }
  return selectPaymentProvider(env);
}

export const paymentProvider: PaymentProvider = selectPaymentProvider();
