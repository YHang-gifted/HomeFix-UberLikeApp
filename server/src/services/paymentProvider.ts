import { randomUUID } from 'node:crypto';

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
 * The seam a real payment provider (Stripe Connect / PayPal / ECPay …) slots into.
 * `createCharge` is where a real adapter would create a PaymentIntent and return
 * its id + client secret; a real webhook then references that id.
 */
export interface PaymentProvider {
  createCharge(input: PaymentChargeInput): Promise<PaymentChargeResult>;
}

/**
 * The default, inert provider. It assigns a deterministic-looking mock reference
 * and contacts nothing external — honoring the project rule against provider-side
 * production actions. A real provider is config-gated and swapped in at
 * {@link selectPaymentProvider} without touching callers.
 */
export const mockPaymentProvider: PaymentProvider = {
  createCharge(_input: PaymentChargeInput): Promise<PaymentChargeResult> {
    return Promise.resolve({ providerRef: `mock_${randomUUID()}` });
  },
};

/**
 * Choose the payment provider. Only the inert mock exists today; a real provider
 * would be selected here from configuration (e.g. an API key), keeping the rest of
 * the payment flow provider-agnostic.
 */
export function selectPaymentProvider(): PaymentProvider {
  return mockPaymentProvider;
}

export const paymentProvider: PaymentProvider = selectPaymentProvider();
