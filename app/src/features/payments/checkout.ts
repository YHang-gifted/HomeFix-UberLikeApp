/**
 * Opens the provider's hosted checkout page for a payment (e.g. a Stripe Checkout
 * URL returned on the create-payment response). The customer completes the payment
 * there, and the payment is settled by the provider's verified webhook — the app
 * never observes the result inline, so this signals nothing about success.
 *
 * Injected into RequestDetailScreen so tests can supply a fake and the real
 * platform redirect is wired in App.tsx:
 *   - web:    window.location.assign(url) — the current page navigates to Stripe.
 *   - native: Linking.openURL(url) — opens the system browser.
 *
 * Resolves once the redirect/open has been handed off; rejects if the page could
 * not be opened. When no opener is injected — or the payment carries no
 * `checkoutUrl` (the mock provider) — the screen falls back to the mock `/pay` flow.
 */
export type OpenCheckout = (url: string) => Promise<void>;
