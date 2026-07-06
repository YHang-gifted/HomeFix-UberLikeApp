import { Linking, Platform } from 'react-native';

import type { OpenCheckout } from '../../app/src/features/payments/checkout';

/**
 * Real hosted-checkout opener. On web it navigates the current page to the Stripe
 * Checkout URL; on native it opens the system browser. Either way the payment is
 * settled by the provider's verified webhook — this only hands off the redirect.
 *
 * `window.location.assign` throws synchronously if navigation is blocked; wrap it so
 * the caller always gets a rejected promise it can surface as an error.
 */
export const deviceOpenCheckout: OpenCheckout = async (url: string): Promise<void> => {
  if (Platform.OS === 'web') {
    globalThis.window.location.assign(url);
    return;
  }
  await Linking.openURL(url);
};
