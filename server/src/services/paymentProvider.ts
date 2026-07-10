import { Buffer } from 'node:buffer';
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

// --- PayPal Orders v2 (a second hosted-checkout provider) ------------------------

/** Resolved PayPal REST config. Base URL differs by environment (sandbox/live). */
export interface PaypalConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  returnUrl: string;
  cancelUrl: string;
}

/** The bits of a created PayPal order we depend on: its id + the buyer-approval URL. */
export interface PaypalOrderResult {
  id: string;
  approveUrl: string | null;
}

/**
 * Opens a PayPal order. Injected so the adapter is unit-testable without a network
 * call; the real one is {@link paypalOrderCreator}. `metadata.paymentId` is carried on
 * the order (as `custom_id`) so the capture webhook can map it back to our payment.
 */
export type CreatePaypalOrder = (params: {
  amountCents: number;
  currency: string;
  metadata: { paymentId: string; requestId: string };
}) => Promise<PaypalOrderResult>;

/**
 * A payment provider backed by PayPal hosted checkout. `createCharge` opens an order
 * and returns the buyer-approval URL the app redirects to, plus the order id (stored as
 * our `providerRef`). Like Stripe, it settles only via a verified webhook — but PayPal's
 * flow additionally needs a capture step after approval (wired in a later slice).
 */
export function createPaypalPaymentProvider(createOrder: CreatePaypalOrder): PaymentProvider {
  return {
    id: 'paypal',
    usesExternalCheckout: true,
    async createCharge(input: PaymentChargeInput): Promise<PaymentChargeResult> {
      const order = await createOrder({
        amountCents: input.amountCents,
        currency: input.currency,
        metadata: { paymentId: input.paymentId, requestId: input.requestId },
      });
      return {
        providerRef: order.id,
        ...(order.approveUrl !== null ? { checkoutUrl: order.approveUrl } : {}),
      };
    },
  };
}

interface PaypalTokenResponse {
  access_token: string;
}
interface PaypalOrderResponse {
  id: string;
  links?: { rel: string; href: string }[];
}

/**
 * PayPal wants the amount as a decimal string. Most currencies use 2 decimals
 * (cents/100); a few are zero-decimal and must be whole numbers. Our amounts are stored
 * in minor units (`amountCents`). Verify the full zero-decimal set for your live
 * currencies before go-live.
 */
function paypalAmountValue(amountCents: number, currency: string): string {
  const zeroDecimal = new Set(['JPY', 'TWD', 'HUF', 'KRW']);
  return zeroDecimal.has(currency.toUpperCase())
    ? String(Math.round(amountCents / 100))
    : (amountCents / 100).toFixed(2);
}

/** OAuth2 client-credentials token for the PayPal REST API. */
async function paypalAccessToken(config: PaypalConfig): Promise<string> {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const res = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    throw new AppError('Could not authenticate with PayPal', 502);
  }
  const body = (await res.json()) as PaypalTokenResponse;
  return body.access_token;
}

/** The result of capturing a PayPal order: its status and our `custom_id` (paymentId). */
export interface PaypalCaptureResult {
  status: string;
  paymentId: string | null;
}

/**
 * Captures an approved PayPal order (charges the buyer). Injected so the settlement
 * flow is unit-testable without a network call; the real one is
 * {@link paypalOrderCapturer}.
 */
export type CapturePaypalOrder = (orderId: string) => Promise<PaypalCaptureResult>;

interface PaypalCaptureResponse {
  status?: string;
  purchase_units?: { payments?: { captures?: { status?: string; custom_id?: string }[] } }[];
}

/** The real capturer: authenticates, then captures the order (charges the buyer). */
export function paypalOrderCapturer(config: PaypalConfig): CapturePaypalOrder {
  return async (orderId) => {
    const token = await paypalAccessToken(config);
    const res = await fetch(`${config.baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    });
    if (!res.ok) {
      throw new AppError('Could not capture the PayPal order', 502);
    }
    const body = (await res.json()) as PaypalCaptureResponse;
    const capture = body.purchase_units?.[0]?.payments?.captures?.[0];
    return {
      status: body.status ?? capture?.status ?? 'UNKNOWN',
      paymentId: capture?.custom_id ?? null,
    };
  };
}

/** The real order creator: authenticates, then opens a CAPTURE-intent order. */
export function paypalOrderCreator(config: PaypalConfig): CreatePaypalOrder {
  return async ({ amountCents, currency, metadata }) => {
    const token = await paypalAccessToken(config);
    const res = await fetch(`${config.baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            custom_id: metadata.paymentId,
            amount: {
              currency_code: currency.toUpperCase(),
              value: paypalAmountValue(amountCents, currency),
            },
          },
        ],
        application_context: {
          return_url: config.returnUrl,
          cancel_url: config.cancelUrl,
          user_action: 'PAY_NOW',
        },
      }),
    });
    if (!res.ok) {
      throw new AppError('Could not create the PayPal order', 502);
    }
    const body = (await res.json()) as PaypalOrderResponse;
    const approveUrl = body.links?.find((link) => link.rel === 'approve')?.href ?? null;
    return { id: body.id, approveUrl };
  };
}

/**
 * Resolve PayPal config from the environment. Returns undefined (→ PayPal unavailable)
 * when no client id/secret is set; throws when they are set but the return URLs are
 * missing, so a half-configured provider fails fast rather than silently.
 */
function paypalConfigFromEnv(env: Env): PaypalConfig | undefined {
  const clientId = env.PAYPAL_CLIENT_ID;
  const clientSecret = env.PAYPAL_CLIENT_SECRET;
  if (clientId === undefined || clientSecret === undefined) {
    return undefined;
  }
  const returnUrl = env.PAYPAL_RETURN_URL;
  const cancelUrl = env.PAYPAL_CANCEL_URL;
  if (returnUrl === undefined || cancelUrl === undefined) {
    throw new AppError(
      'PAYPAL_CLIENT_ID is set but PAYPAL_RETURN_URL and PAYPAL_CANCEL_URL are required for PayPal checkout.',
      500,
    );
  }
  const baseUrl =
    env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  return { clientId, clientSecret, baseUrl, returnUrl, cancelUrl };
}

/** The configured PayPal order capturer, or undefined when PayPal is not configured. */
export function selectPaypalCapturer(env: Env = loadEnv()): CapturePaypalOrder | undefined {
  const config = paypalConfigFromEnv(env);
  return config === undefined ? undefined : paypalOrderCapturer(config);
}

// --- PayPal webhook verification -------------------------------------------------

/** The PayPal signature headers on a webhook delivery. */
export interface PaypalWebhookHeaders {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
}

/** The reduced webhook event we act on: its type + our ids for settlement. */
export interface PaypalWebhookEvent {
  type: string;
  /** Our paymentId (the order's `custom_id`), when the event carries it. */
  paymentId: string | null;
  /** The PayPal order id (on order events), used to capture an approved order. */
  orderId: string | null;
}

/**
 * Verifies a PayPal webhook delivery and returns the reduced event. Injected so the
 * handler is unit-testable without a network call; the real one is
 * {@link paypalWebhookVerifier}. Throws `AppError(401)` when verification fails.
 */
export type VerifyPaypalWebhook = (
  headers: PaypalWebhookHeaders,
  rawBody: Buffer,
) => Promise<PaypalWebhookEvent>;

interface PaypalEventBody {
  event_type?: string;
  resource?: {
    id?: string;
    custom_id?: string;
    purchase_units?: { custom_id?: string }[];
  };
}

function reducePaypalEvent(event: PaypalEventBody): PaypalWebhookEvent {
  const resource = event.resource;
  const customId = resource?.custom_id ?? resource?.purchase_units?.[0]?.custom_id ?? null;
  return { type: event.event_type ?? '', paymentId: customId, orderId: resource?.id ?? null };
}

/**
 * The real verifier: posts the delivery back to PayPal's verify-webhook-signature API
 * (authenticated) and only accepts it on `verification_status === 'SUCCESS'`.
 */
export function paypalWebhookVerifier(
  config: PaypalConfig,
  webhookId: string,
): VerifyPaypalWebhook {
  return async (headers, rawBody) => {
    const token = await paypalAccessToken(config);
    const event = JSON.parse(rawBody.toString('utf8')) as PaypalEventBody;
    const res = await fetch(`${config.baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        auth_algo: headers.authAlgo,
        cert_url: headers.certUrl,
        transmission_id: headers.transmissionId,
        transmission_sig: headers.transmissionSig,
        transmission_time: headers.transmissionTime,
        webhook_id: webhookId,
        webhook_event: event,
      }),
    });
    if (!res.ok) {
      throw new AppError('Could not verify the PayPal webhook', 502);
    }
    const body = (await res.json()) as { verification_status?: string };
    if (body.verification_status !== 'SUCCESS') {
      throw new AppError('Invalid PayPal webhook signature', 401);
    }
    return reducePaypalEvent(event);
  };
}

// --- Refunds --------------------------------------------------------------------

/**
 * Reverses a charge at the provider by its reference (for Stripe, the PaymentIntent id
 * stored as our `providerRef`). Injected so the refund flow is unit-testable without a
 * network call; the real one is {@link stripeRefunder}. Throws when the refund fails.
 */
export type RefundCharge = (providerRef: string) => Promise<void>;

/** The real Stripe refunder: refunds the full amount of the PaymentIntent. */
export function stripeRefunder(secretKey: string): RefundCharge {
  const stripe = new Stripe(secretKey);
  return async (providerRef) => {
    await stripe.refunds.create({ payment_intent: providerRef });
  };
}

/** The configured Stripe refunder, or undefined when Stripe isn't configured. */
export function selectStripeRefunder(env: Env = loadEnv()): RefundCharge | undefined {
  const secretKey = env.STRIPE_SECRET_KEY;
  return secretKey === undefined ? undefined : stripeRefunder(secretKey);
}

/** The configured PayPal webhook verifier, or undefined when it is not fully configured. */
export function selectPaypalWebhookVerifier(env: Env = loadEnv()): VerifyPaypalWebhook | undefined {
  const config = paypalConfigFromEnv(env);
  const webhookId = env.PAYPAL_WEBHOOK_ID;
  if (config === undefined || webhookId === undefined) {
    return undefined;
  }
  return paypalWebhookVerifier(config, webhookId);
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
    const config = paypalConfigFromEnv(env);
    if (config === undefined) {
      throw new AppError('PayPal is not available — it is not configured.', 400);
    }
    return createPaypalPaymentProvider(paypalOrderCreator(config));
  }
  return selectPaymentProvider(env);
}

export const paymentProvider: PaymentProvider = selectPaymentProvider();
