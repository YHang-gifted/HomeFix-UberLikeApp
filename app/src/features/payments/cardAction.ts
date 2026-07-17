/**
 * Completes a saved-card payment that needs Strong Customer Authentication (3-D Secure), given
 * the PaymentIntent client secret from `paySavedCard`'s `requires_action` result. It drives the
 * native SDK's `handleNextAction`, presenting the bank's 3DS challenge; it resolves once the
 * challenge is passed and rejects if the customer fails or cancels it.
 *
 * Injected into RequestDetailScreen so tests can supply a fake; the real one is wired in App.tsx:
 *   - native: `@stripe/stripe-react-native`'s `handleNextAction`, captured while the app is under
 *     `StripeProvider` (see `stripeProvider.tsx`).
 *   - web: rejects — web pays via hosted checkout, which never returns `requires_action`.
 *
 * Like {@link OpenCheckout}, this only drives the client-side UI: the payment itself still settles
 * via the verified `payment_intent.succeeded` webhook, so a resolved promise means "3DS passed,
 * the charge will proceed", not "the payment is now marked paid".
 */
export type ConfirmCardAction = (clientSecret: string) => Promise<void>;
