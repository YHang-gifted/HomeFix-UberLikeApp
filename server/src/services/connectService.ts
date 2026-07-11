import type { ConnectOnboarding, Principal } from '../../../shared/schemas.ts';
import { loadEnv } from '../config/env.ts';
import { AppError } from '../errors/appError.ts';
import { userRepository } from '../repositories/userRepository.ts';
import { selectConnectOnboarder } from './paymentProvider.ts';
import type { CreateConnectOnboarding } from './paymentProvider.ts';

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
 * Start (or resume) a worker's Stripe Connect payout onboarding: create/reuse their
 * connected account, persist its id, and return the hosted onboarding URL to redirect to.
 * Worker-only. 400 when payouts aren't configured, 404 if the account is gone.
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
  const result = await onboarder(user.stripeAccountId);
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
}
