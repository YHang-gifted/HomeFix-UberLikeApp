/** The result of running the provider's checkout for a payment. */
export interface CheckoutOutcome {
  status: 'succeeded' | 'processing' | 'failed' | 'canceled';
  /** A user-facing message, typically set on a failure. */
  message?: string;
}

/**
 * Runs the payment provider's checkout for a PaymentIntent client secret (e.g.
 * Stripe's PaymentSheet on native / Stripe.js on web). Injected into
 * RequestDetailScreen so tests can supply a fake and the real platform provider is
 * wired in App.tsx. When no checkout is injected — or the payment carries no client
 * secret (the mock provider) — the screen falls back to the mock `/pay` flow.
 *
 * `succeeded`/`processing` mean the customer completed checkout; the payment is
 * then settled by the provider's verified webhook, so the app refreshes to reflect
 * the latest status. `failed` shows the message; `canceled` is a silent no-op.
 */
export type PaymentCheckout = (clientSecret: string) => Promise<CheckoutOutcome>;
