import type { ConnectOnboarding, Principal } from '../../../shared/schemas.ts';
import { loadEnv } from '../config/env.ts';
import { AppError, isAppError } from '../errors/appError.ts';
import { userRepository } from '../repositories/userRepository.ts';
import { logger } from '../utils/logger.ts';
import { selectConnectOnboarder } from './paymentProvider.ts';
import type { ConnectOnboardingResult, CreateConnectOnboarding } from './paymentProvider.ts';
import { retryPendingPayoutsForWorker } from './payoutService.ts';

// The Connect onboarder has a globalThis-anchored test override (a fake avoids the network
// call to Stripe while still exercising the account-id persistence). Same rationale as the
// payment-provider override.
const ONBOARDER_OVERRIDE_KEY = '__homefixConnectOnboarderOverride__';

function onboarderRegistry(): Record<string, CreateConnectOnboarding | undefined> {
  return globalThis as unknown as Record<string, CreateConnectOnboarding | undefined>;
}

function activeConnectOnboarder(): CreateConnectOnboarding | undefined {
  return onboarderRegistry()[ONBOARDER_OVERRIDE_KEY] ?? selectConnectOnboarder(loadEnv());
}

export function setConnectOnboarderForTests(onboarder: CreateConnectOnboarding): void {
  onboarderRegistry()[ONBOARDER_OVERRIDE_KEY] = onboarder;
}

export function resetConnectOnboarderForTests(): void {
  onboarderRegistry()[ONBOARDER_OVERRIDE_KEY] = undefined;
}

/**
 * The Stripe SDK's error shape, read structurally — a cross-module `instanceof` against the
 * SDK's error classes is exactly the kind of check that breaks under tsx, and none of these
 * fields are load-bearing enough to be worth that risk. `requestId` is the valuable one: it
 * points at the exact call in the Stripe dashboard's request log.
 */
function stripeErrorContext(err: unknown): Record<string, string> {
  if (typeof err !== 'object' || err === null) {
    return {};
  }
  const candidate = err as { type?: unknown; code?: unknown; requestId?: unknown };
  const context: Record<string, string> = {};
  if (typeof candidate.type === 'string') {
    context['stripeType'] = candidate.type;
  }
  if (typeof candidate.code === 'string') {
    context['stripeCode'] = candidate.code;
  }
  if (typeof candidate.requestId === 'string') {
    context['stripeRequestId'] = candidate.requestId;
  }
  return context;
}

/**
 * Call the payout provider, mapping any failure it throws to an AppError.
 *
 * Without this the Stripe SDK's own error reaches the error boundary, which treats an
 * unrecognized error as a crash: the worker is told "Internal Server Error" and the status
 * is 500 — as if *we* were broken. That is what the go-live dry run hit, and it cost hours:
 * onboarding was rejected because Connect was not yet enabled on the platform, and nothing
 * in the response said so. Every other provider adapter already maps its failures (the
 * PayPal ones all raise 502); this path was the one that did not.
 *
 * 502, not 500: the upstream provider refused, so the request is not the worker's fault and
 * is worth retrying. The message stays generic on purpose — a Stripe failure here is either
 * platform misconfiguration or a transient outage, and neither is something the worker can
 * act on beyond retrying, so the provider's own wording (which can name our platform's
 * configuration) is not repeated back to them.
 *
 * The reason is logged HERE rather than left to the boundary, which deliberately does not
 * log AppErrors — they are expected client errors. Skipping this would trade a misleading
 * status for a lost diagnostic, which is a worse trade than the bug being fixed.
 */
async function createOnboarding(
  onboarder: CreateConnectOnboarding,
  existingAccountId: string | undefined,
): Promise<ConnectOnboardingResult> {
  try {
    return await onboarder(existingAccountId);
  } catch (err) {
    if (isAppError(err)) {
      throw err;
    }
    logger.error('Connect onboarding failed at the provider', {
      type: 'error',
      error: err instanceof Error ? err.name : 'UnknownError',
      reason: err instanceof Error ? err.message : 'Unknown error',
      ...stripeErrorContext(err),
    });
    throw new AppError('Could not start payout setup. Please try again in a few minutes.', 502);
  }
}

/**
 * Start (or resume) a worker's Stripe Connect payout onboarding: create/reuse their
 * connected account, persist its id, and return the hosted onboarding URL to redirect to.
 * Worker-only. 400 when payouts aren't configured, 404 if the account is gone, 502 when the
 * provider rejects the request.
 */
export async function startConnectOnboarding(principal: Principal): Promise<ConnectOnboarding> {
  if (principal.role !== 'worker') {
    throw new AppError('Only workers set up payouts', 403);
  }
  const onboarder = activeConnectOnboarder();
  if (onboarder === undefined) {
    throw new AppError('Payout onboarding is not available', 400);
  }
  const user = await userRepository.findById(principal.id);
  if (!user) {
    throw new AppError('Account not found', 404);
  }
  const result = await createOnboarding(onboarder, user.stripeAccountId);
  if (result.accountId !== user.stripeAccountId) {
    await userRepository.setStripeAccountId(user.id, result.accountId);
  }
  return { url: result.url };
}

/**
 * Record whether a worker's connected account can now receive payouts, keyed by the Stripe
 * account id carried on an `account.updated` webhook. A no-op when no worker owns that
 * account (e.g. an event for an account we don't track), so unrelated Connect events are
 * harmless.
 */
export async function recordConnectPayoutStatus(
  accountId: string,
  payoutsEnabled: boolean,
): Promise<void> {
  const worker = await userRepository.findByStripeAccountId(accountId);
  if (!worker) {
    return;
  }
  await userRepository.setStripePayoutsEnabled(worker.id, payoutsEnabled);
  // Now that the account can receive payouts, flush any payouts that were scheduled while
  // it couldn't (they were left pending by `tryTransferPayout`).
  if (payoutsEnabled) {
    await retryPendingPayoutsForWorker(worker.id);
  }
}
