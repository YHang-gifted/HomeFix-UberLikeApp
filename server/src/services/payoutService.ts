import { randomUUID } from 'node:crypto';

import type {
  EarningsSummary,
  Payment,
  Payout,
  PayoutWebhookEvent,
  Principal,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { payoutRepository } from '../repositories/payoutRepository.ts';
import { userRepository } from '../repositories/userRepository.ts';
import { recordNotification } from './notificationService.ts';
import { selectPayoutSender } from './paymentProvider.ts';
import type { SendPayout } from './paymentProvider.ts';

/** The webhook event type that settles a payout. Other types are ignored. */
const PAYOUT_PAID = 'payout.paid';

// The payout sender has a globalThis-anchored test override (a fake avoids the Stripe
// Transfer network call while still exercising the send-then-settle path).
const SENDER_OVERRIDE_KEY = '__homefixPayoutSenderOverride__';

function senderRegistry(): Record<string, SendPayout | undefined> {
  return globalThis as unknown as Record<string, SendPayout | undefined>;
}

function activePayoutSender(): SendPayout | undefined {
  return senderRegistry()[SENDER_OVERRIDE_KEY] ?? selectPayoutSender();
}

export function setPayoutSenderForTests(sender: SendPayout): void {
  senderRegistry()[SENDER_OVERRIDE_KEY] = sender;
}

export function resetPayoutSenderForTests(): void {
  senderRegistry()[SENDER_OVERRIDE_KEY] = undefined;
}

function workerNetOf(payment: Payment): number {
  return payment.workerNetCents ?? payment.amountCents - (payment.platformFeeCents ?? 0);
}

/**
 * Best-effort: transfer a pending payout to the worker's connected account and settle it.
 * A no-op unless payouts are configured AND the worker has completed Connect onboarding
 * AND Stripe has confirmed their account can receive payouts (`payouts_enabled`, tracked
 * from the account.updated webhook) — transferring before then would be rejected. A
 * transfer failure leaves the payout pending (it can be retried) and never disturbs the
 * payment settlement that scheduled it.
 */
async function tryTransferPayout(payout: Payout): Promise<void> {
  const sender = activePayoutSender();
  if (sender === undefined) {
    return;
  }
  const worker = await userRepository.findById(payout.workerId);
  if (worker?.stripeAccountId === undefined) {
    return;
  }
  if (worker.stripePayoutsEnabled !== true) {
    return;
  }
  try {
    await sender({
      amountCents: payout.amountCents,
      currency: payout.currency,
      destinationAccountId: worker.stripeAccountId,
    });
    await confirmPayoutPaid(payout.id);
  } catch {
    // Leave the payout pending; a later retry or webhook can settle it.
  }
}

/**
 * Create a pending payout of a paid payment's worker net (Model B). Idempotent:
 * a payment that already has a payout is left as-is, so re-confirming a payment
 * never creates a duplicate. When payouts are configured and the worker has onboarded,
 * the transfer is sent immediately (best-effort); otherwise it stays pending.
 */
export async function createPayoutForPayment(payment: Payment): Promise<Payout> {
  const existing = await payoutRepository.findByPayment(payment.id);
  if (existing) {
    return existing;
  }
  const payout: Payout = {
    id: randomUUID(),
    paymentId: payment.id,
    workerId: payment.workerId,
    amountCents: workerNetOf(payment),
    currency: 'TWD',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await payoutRepository.save(payout);
  await tryTransferPayout(payout);
  return payout;
}

/**
 * Backfill: retry every still-pending payout for a worker, best-effort. Called when the
 * worker's connected account becomes payouts-enabled (the `account.updated` webhook), so
 * payouts scheduled BEFORE onboarding finished — which `tryTransferPayout` left pending —
 * now go out. Each retry is the same guarded, best-effort transfer, so a failure just
 * leaves that payout pending for a later attempt.
 */
export async function retryPendingPayoutsForWorker(workerId: string): Promise<void> {
  const payouts = await payoutRepository.findByWorker(workerId);
  for (const payout of payouts) {
    if (payout.status === 'pending') {
      await tryTransferPayout(payout);
    }
  }
}

/**
 * Confirm a payout as settled (from a verified provider webhook). Idempotent: an
 * already-paid payout is returned unchanged. 404 if the payout is unknown. No
 * authorization here — the caller verifies the webhook.
 */
export async function confirmPayoutPaid(payoutId: string): Promise<Payout> {
  const payout = await payoutRepository.findById(payoutId);
  if (!payout) {
    throw new AppError('Payout not found', 404);
  }
  if (payout.status === 'paid') {
    return payout;
  }
  const updated: Payout = { ...payout, status: 'paid', paidAt: new Date().toISOString() };
  await payoutRepository.save(updated);
  await recordNotification({
    userId: payout.workerId,
    message: 'Your payout has been sent to your account.',
  });
  return updated;
}

/**
 * Reverse the worker's payout for a payment that is being refunded. A still-pending
 * payout is removed (the job was cancelled before it settled). A payout that has
 * already been paid out to the worker cannot be auto-reversed — that needs a manual
 * clawback — so this throws 409. A no-op when the payment has no payout.
 */
export async function reversePendingPayout(paymentId: string): Promise<void> {
  const payout = await payoutRepository.findByPayment(paymentId);
  if (!payout) {
    return;
  }
  if (payout.status === 'paid') {
    throw new AppError(
      'The worker has already been paid out; cancelling with a refund needs a manual clawback',
      409,
    );
  }
  await payoutRepository.deleteByPayment(paymentId);
}

/**
 * Reconcile the worker's payout for a refund that ALREADY happened at the provider (a
 * verified `payment.refunded` webhook — e.g. a refund issued from the Stripe/PayPal
 * dashboard, or a chargeback). Unlike {@link reversePendingPayout} this NEVER throws: the
 * refund is a fait accompli, so the webhook must be acknowledged. A still-pending payout is
 * removed so it can never transfer (no double-pay); an already-paid-out payout is left as-is
 * (the net is gone and needs a manual clawback — a reversal is impossible from here). A
 * no-op when the payment has no payout.
 */
export async function reconcilePayoutForExternalRefund(paymentId: string): Promise<void> {
  const payout = await payoutRepository.findByPayment(paymentId);
  if (!payout || payout.status === 'paid') {
    return;
  }
  await payoutRepository.deleteByPayment(paymentId);
}

/** A worker's own payouts, most-recent-first. Only workers have payouts. */
export async function listMyPayouts(principal: Principal): Promise<Payout[]> {
  if (principal.role !== 'worker') {
    throw new AppError('No payout history for this role', 403);
  }
  return payoutRepository.findByWorker(principal.id);
}

/** A worker's own earnings summary: paid-out vs. still-pending totals. Worker-only. */
export async function myEarnings(principal: Principal): Promise<EarningsSummary> {
  if (principal.role !== 'worker') {
    throw new AppError('No earnings for this role', 403);
  }
  return payoutRepository.workerTotals(principal.id);
}

/** Act on a verified payout webhook. Only 'payout.paid' settles a payout. */
export async function handlePayoutWebhook(event: PayoutWebhookEvent): Promise<void> {
  if (event.type === PAYOUT_PAID) {
    await confirmPayoutPaid(event.payoutId);
  }
}

export async function resetPayouts(): Promise<void> {
  await payoutRepository.clear();
}
