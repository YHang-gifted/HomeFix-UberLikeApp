import type { ConfirmCardAction } from '../../app/src/features/payments/cardAction';

/**
 * Native SCA (3-D Secure) driver for saved-card payments. `handleNextAction` comes from the
 * `@stripe/stripe-react-native` `useStripe()` hook, which is only usable inside a React component
 * under `StripeProvider` — so a small bridge in `stripeProvider.tsx` captures it here while the
 * provider is mounted (and clears it on unmount). `deviceConfirmCardAction` is a plain function
 * RequestDetailScreen can call without touching the SDK or a hook directly.
 *
 * The `.web.ts` sibling rejects — web pays via hosted checkout, which never needs SCA inline.
 */
type NextActionResult = { error?: { message?: string } | undefined };
type NextActionHandler = (clientSecret: string) => Promise<NextActionResult>;

let handler: NextActionHandler | undefined;

/** Wire (or clear) the native `handleNextAction`. Called by the bridge in `stripeProvider.tsx`. */
export function setNextActionHandler(fn: NextActionHandler | undefined): void {
  handler = fn;
}

export const deviceConfirmCardAction: ConfirmCardAction = async (
  clientSecret: string,
): Promise<void> => {
  if (handler === undefined) {
    // No provider mounted (publishable key unset) — the saved-card UI is hidden in that case, so
    // this is a belt-and-braces guard rather than a path a user reaches.
    throw new Error('Card authentication is unavailable. Please use the hosted checkout.');
  }
  const { error } = await handler(clientSecret);
  if (error !== undefined) {
    throw new Error(error.message ?? 'Card authentication failed. Please try again.');
  }
};
