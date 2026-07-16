import { type ReactElement, type ReactNode } from 'react';

/**
 * Web has no `@stripe/stripe-react-native` provider — the RN SDK is native-only, and the web app
 * pays through hosted checkout. So this renders children unchanged, keeping the web bundle free
 * of the native module (the same split as `mapPicker.web.tsx`).
 */
export function StripeAppProvider({ children }: { children: ReactNode }): ReactElement {
  return <>{children}</>;
}
