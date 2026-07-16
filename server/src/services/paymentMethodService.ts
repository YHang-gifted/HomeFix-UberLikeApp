import { randomUUID } from 'node:crypto';

import type { CheckoutSession, Principal, SavedCard } from '../../../shared/schemas.ts';
import { loadEnv } from '../config/env.ts';
import { AppError, isAppError } from '../errors/appError.ts';
import { userRepository } from '../repositories/userRepository.ts';
import { logger } from '../utils/logger.ts';
import {
  selectSavedCardLister,
  selectStripeCustomerCreator,
  selectStripeSetupSessionCreator,
} from './paymentProvider.ts';
import type {
  CreateStripeCustomer,
  CreateStripeSetupSession,
  ListSavedCards,
} from './paymentProvider.ts';

/**
 * The three Stripe seams the saved-card flow uses, overridable together for tests (fakes
 * avoid the network calls while still exercising the Customer-id persistence and the
 * checkout/list plumbing). Same globalThis-anchored rationale as the payment-provider and
 * Connect-onboarder overrides — a direct import of a repository singleton from a `.mjs` test
 * would hit tsx's module-identity trap.
 */
export interface SavedCardSeams {
  customerCreator?: CreateStripeCustomer;
  setupSessionCreator?: CreateStripeSetupSession;
  cardLister?: ListSavedCards;
}

const SEAMS_OVERRIDE_KEY = '__homefixSavedCardSeamsOverride__';

function seamsRegistry(): Record<string, SavedCardSeams | undefined> {
  return globalThis as unknown as Record<string, SavedCardSeams | undefined>;
}

function overrides(): SavedCardSeams {
  return seamsRegistry()[SEAMS_OVERRIDE_KEY] ?? {};
}

export function setSavedCardSeamsForTests(seams: SavedCardSeams): void {
  seamsRegistry()[SEAMS_OVERRIDE_KEY] = seams;
}

export function resetSavedCardSeamsForTests(): void {
  seamsRegistry()[SEAMS_OVERRIDE_KEY] = undefined;
}

/**
 * The Stripe SDK's error shape, read structurally (a cross-module `instanceof` against the
 * SDK's error classes is exactly what breaks under tsx). `requestId` points at the exact
 * call in the Stripe dashboard's request log. Mirrors connectService's helper.
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
 * Run a Stripe call, mapping any raw SDK failure to a 502 AppError so the error boundary
 * returns a clean client error (not a misleading "Internal Server Error") and the reason is
 * logged here (the boundary deliberately does not log AppErrors). AppErrors we raise
 * ourselves pass through unchanged.
 */
async function callStripe<T>(fn: () => Promise<T>, action: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isAppError(err)) {
      throw err;
    }
    logger.error('A Stripe saved-card call failed', {
      type: 'error',
      action,
      error: err instanceof Error ? err.name : 'UnknownError',
      reason: err instanceof Error ? err.message : 'Unknown error',
      ...stripeErrorContext(err),
    });
    throw new AppError(`Could not ${action}. Please try again in a few minutes.`, 502);
  }
}

/**
 * Get-or-create the customer's Stripe Customer id, persisting it the first time. Only the
 * decision to reuse lives here; the create itself is the injected seam. 404 if the account is
 * gone, 400 when saved cards aren't configured.
 */
async function ensureStripeCustomer(userId: string): Promise<string> {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('Account not found', 404);
  }
  if (user.stripeCustomerId !== undefined) {
    return user.stripeCustomerId;
  }
  const creator = overrides().customerCreator ?? selectStripeCustomerCreator(loadEnv());
  if (creator === undefined) {
    throw new AppError('Saved cards are not available', 400);
  }
  const customerId = await callStripe(
    () => creator({ email: user.email, userId: user.id }),
    'save your card',
  );
  await userRepository.setStripeCustomerId(user.id, customerId);
  return customerId;
}

/**
 * Start saving a card: ensure the customer has a Stripe Customer, then open a one-time hosted
 * Checkout Session in setup mode and return its URL for the app to redirect to. Customer-only.
 * A FRESH idempotency key each call — a setup session, like a payment session, expires, so a
 * later "add card" must get a genuinely new one. 400 when not configured, 502 on provider
 * failure.
 */
export async function startCardSetup(principal: Principal): Promise<CheckoutSession> {
  if (principal.role !== 'customer') {
    throw new AppError('Only customers save cards', 403);
  }
  const create = overrides().setupSessionCreator ?? selectStripeSetupSessionCreator(loadEnv());
  if (create === undefined) {
    throw new AppError('Saved cards are not available', 400);
  }
  const customerId = await ensureStripeCustomer(principal.id);
  const session = await callStripe(
    () => create({ customerId }, { idempotencyKey: randomUUID() }),
    'start saving your card',
  );
  if (session.url === null) {
    throw new AppError('Could not start saving your card. Please try again.', 502);
  }
  return { checkoutUrl: session.url };
}

/**
 * List the customer's saved cards (safe display fields only). Customer-only. Returns an empty
 * list when they have never saved one (no Stripe Customer yet) or when saved cards aren't
 * configured, so the screen renders cleanly rather than erroring.
 */
export async function listPaymentMethods(principal: Principal): Promise<SavedCard[]> {
  if (principal.role !== 'customer') {
    throw new AppError('Only customers save cards', 403);
  }
  const user = await userRepository.findById(principal.id);
  if (!user) {
    throw new AppError('Account not found', 404);
  }
  if (user.stripeCustomerId === undefined) {
    return [];
  }
  const lister = overrides().cardLister ?? selectSavedCardLister(loadEnv());
  if (lister === undefined) {
    return [];
  }
  const customerId = user.stripeCustomerId;
  return callStripe(() => lister(customerId), 'list your saved cards');
}
