import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { type ReactElement, type ReactNode, useEffect } from 'react';

import { setNextActionHandler } from './cardAction';

/**
 * Wraps the app so `@stripe/stripe-react-native` (PaymentSheet, saved cards, in-app payments) is
 * available beneath it. Phase 1 of the Uber-style saved-card work: just the provider, so the app
 * boots with the SDK in place — the actual save/pay flows come in later phases.
 *
 * `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` is a **publishable** key, safe to ship in client code
 * (that is what it is for). It is inlined at build time like every `EXPO_PUBLIC_*` var, so a
 * change needs a rebuild. Unset (dev/test, or before it's configured) → render without the SDK,
 * so nothing crashes and the hosted-checkout flow keeps working; the saved-card UI stays hidden.
 *
 * A `.web.tsx` sibling renders children as-is — the RN SDK is native-only, and web pays via
 * hosted checkout, so it needs no provider.
 */
const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

/**
 * Captures the SDK's `handleNextAction` into `cardAction.ts` while mounted, so the saved-card pay
 * flow (Phase 3b) can drive 3-D Secure without calling a Stripe hook itself. Renders nothing; must
 * live under `StripeProvider` (that is where `useStripe` is valid).
 */
function CardActionBridge(): null {
  const { handleNextAction } = useStripe();
  useEffect(() => {
    setNextActionHandler((clientSecret) => handleNextAction(clientSecret));
    return () => {
      setNextActionHandler(undefined);
    };
  }, [handleNextAction]);
  return null;
}

export function StripeAppProvider({ children }: { children: ReactNode }): ReactElement {
  if (PUBLISHABLE_KEY === undefined || PUBLISHABLE_KEY === '') {
    return <>{children}</>;
  }
  // StripeProvider types `children` as ReactElement, so wrap the (ReactNode) children in a
  // fragment to hand it a single element.
  return (
    <StripeProvider publishableKey={PUBLISHABLE_KEY}>
      <>
        <CardActionBridge />
        {children}
      </>
    </StripeProvider>
  );
}
