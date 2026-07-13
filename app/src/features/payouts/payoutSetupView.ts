import type { PayoutAccountStatus } from '../../../../shared/schemas';

/**
 * What the Payouts screen should say about payout setup. Pure, so the copy and the state
 * machine are testable without a renderer — the same approach as `deriveScheduleView` and
 * `deriveQuoteView`.
 */
export interface PayoutSetupView {
  /** Whether to show the setup section at all. */
  visible: boolean;
  /** The heading. Empty when not visible. */
  title: string;
  /** The sentence under it, explaining what the worker should expect. */
  detail: string;
  /** The button's label, or null when there is nothing to press. */
  actionLabel: string | null;
  /** `done` renders as a quiet confirmation rather than a call to action. */
  tone: 'action' | 'waiting' | 'done';
}

const HIDDEN: PayoutSetupView = {
  visible: false,
  title: '',
  detail: '',
  actionLabel: null,
  tone: 'action',
};

/**
 * Derive the payout-setup section from the feature flag and the worker's account status.
 *
 * The `pending` case is the reason this function exists. Before it, the screen keyed off
 * nothing but the build-time feature flag, so it showed **"Set up payouts"** to every worker
 * forever — including one who had already finished, and one whose account Stripe was still
 * verifying. That second worker is the badly served one: their payouts sit `Pending`
 * indefinitely (by design — `tryTransferPayout` will not send to an account Stripe has not
 * cleared), and the screen offered no hint as to why. So say it plainly, and say that it will
 * resolve itself: the backfill releases everything the moment `account.updated` arrives.
 *
 * `undefined` status (a non-worker, or a profile we could not load) hides the section — better
 * to show nothing than to invite someone to set up a payout account they cannot have.
 */
export function derivePayoutSetupView(
  featureEnabled: boolean,
  status: PayoutAccountStatus | undefined,
): PayoutSetupView {
  if (!featureEnabled || status === undefined) {
    return HIDDEN;
  }
  if (status === 'enabled') {
    return {
      visible: true,
      title: 'Payouts are active',
      detail: 'Your earnings are sent to your bank account after each completed payment.',
      actionLabel: 'Update payout details',
      tone: 'done',
    };
  }
  if (status === 'pending') {
    return {
      visible: true,
      title: 'Payout setup is not finished',
      detail:
        'Stripe is still verifying your details, so your earnings are being held. They will be paid out automatically as soon as it is done — you do not need to do anything else unless Stripe asks for more information.',
      actionLabel: 'Finish payout setup',
      tone: 'waiting',
    };
  }
  return {
    visible: true,
    title: 'Set up payouts',
    detail: 'Add your bank details so your earnings can be paid out.',
    actionLabel: 'Set up payouts',
    tone: 'action',
  };
}
