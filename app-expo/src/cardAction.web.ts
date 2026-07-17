import type { ConfirmCardAction } from '../../app/src/features/payments/cardAction';

/**
 * Web has no native Stripe SDK, and it pays via hosted checkout — which never returns
 * `requires_action` — so inline SCA is never reached here. Reject if somehow called, so the
 * screen surfaces a clear message rather than hanging.
 */
export const deviceConfirmCardAction: ConfirmCardAction = (): Promise<void> =>
  Promise.reject(new Error('Saved-card authentication is not available on web.'));

/** No-op on web: there is no native handler to wire (the `.ts` sibling owns the real one). */
export function setNextActionHandler(): void {
  // intentionally empty
}
