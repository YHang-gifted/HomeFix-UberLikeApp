import type { Buffer } from 'node:buffer';

import Stripe from 'stripe';

import { loadEnv } from '../config/env.ts';
import type { Env } from '../config/env.ts';
import { AppError } from '../errors/appError.ts';
import { recordConnectPayoutStatus } from './connectService.ts';

/** The Connect event type signalling a connected account's capabilities changed. */
const ACCOUNT_UPDATED = 'account.updated';

/**
 * The reduced Connect event we act on: its type, the connected account id, and whether
 * that account can now receive payouts (`payouts_enabled`). The account id maps back to
 * the worker who onboarded it.
 */
export interface ConnectWebhookEvent {
  type: string;
  accountId: string | null;
  payoutsEnabled: boolean;
}

/**
 * Verifies a Connect webhook's `Stripe-Signature` over the raw body and returns the
 * reduced event. Injected so the handler is unit-testable without a network call
 * (signature verification itself is local); the real one is
 * {@link stripeConnectEventConstructor}. Throws `AppError(401)` on a bad/absent signature.
 */
export type ConstructConnectEvent = (rawBody: Buffer, signature: string) => ConnectWebhookEvent;

/** Resolved Connect webhook configuration. */
interface ConnectWebhookConfig {
  secretKey: string;
  webhookSecret: string;
}

/**
 * The real Connect event constructor. `stripe.webhooks.constructEvent` verifies the HMAC
 * signature locally (no network) and throws if it doesn't match; we surface that as a 401.
 * An `account.updated` event's object is the connected `Account`, whose `payouts_enabled`
 * tells us whether it can receive transfers.
 */
export function stripeConnectEventConstructor(config: ConnectWebhookConfig): ConstructConnectEvent {
  const stripe = new Stripe(config.secretKey);
  return (rawBody, signature) => {
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret);
    } catch {
      throw new AppError('Invalid Stripe webhook signature', 401);
    }
    const account = event.data.object as { id?: string; payouts_enabled?: boolean };
    return {
      type: event.type,
      accountId: account.id ?? null,
      payoutsEnabled: account.payouts_enabled === true,
    };
  };
}

/**
 * Resolve the real Connect event constructor from the environment, or undefined when
 * Connect webhooks aren't configured (no secret key or no Connect webhook secret) — in
 * which case the endpoint is disabled (404).
 */
export function selectConnectEventConstructor(
  env: Env = loadEnv(),
): ConstructConnectEvent | undefined {
  const secretKey = env.STRIPE_SECRET_KEY;
  const webhookSecret = env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (secretKey === undefined || webhookSecret === undefined) {
    return undefined;
  }
  return stripeConnectEventConstructor({ secretKey, webhookSecret });
}

/**
 * Act on a verified Connect event. An `account.updated` carrying a connected account id
 * records whether that worker can now receive payouts (idempotent). Any other event type
 * — or one without an account id — is acknowledged with no effect, so unrelated Connect
 * events never touch a worker.
 */
export async function handleConnectWebhook(event: ConnectWebhookEvent): Promise<void> {
  if (event.type !== ACCOUNT_UPDATED || event.accountId === null) {
    return;
  }
  await recordConnectPayoutStatus(event.accountId, event.payoutsEnabled);
}
