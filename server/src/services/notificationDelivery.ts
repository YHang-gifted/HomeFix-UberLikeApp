import { loadEnv } from '../config/env.ts';
import type { Env } from '../config/env.ts';
import type { Notification } from '../../../shared/schemas.ts';
import { deviceTokenRepository } from '../repositories/deviceTokenRepository.ts';
import { userRepository } from '../repositories/userRepository.ts';
import { logger } from '../utils/logger.ts';
import { createHttpEmailSender } from './emailSender.ts';
import { createExpoPushSender } from './pushSender.ts';
import { ProviderDelivery, loggingSender } from './notificationProvider.ts';
import type { MessageSender, RecipientResolver } from './notificationProvider.ts';

/** A single outbound channel that delivers a notification (email, push, …). */
export interface NotificationDelivery {
  deliver(notification: Notification): Promise<void>;
}

/** One delivery attempt captured by {@link RecordingDelivery}. */
export interface DeliveryRecord {
  channel: string;
  userId: string;
  message: string;
  requestId?: string;
}

/**
 * A mock delivery channel that records what it *would* have sent rather than
 * contacting a real provider. This keeps notifications testable and observable
 * while honoring the project rule against provider-side production actions; a
 * real email/push provider can be dropped in behind {@link NotificationDelivery}
 * later without touching callers.
 */
export class RecordingDelivery implements NotificationDelivery {
  public readonly sent: DeliveryRecord[] = [];
  private readonly channel: string;

  public constructor(channel: string) {
    this.channel = channel;
  }

  public deliver(notification: Notification): Promise<void> {
    this.sent.push({
      channel: this.channel,
      userId: notification.userId,
      message: notification.message,
      ...(notification.requestId !== undefined ? { requestId: notification.requestId } : {}),
    });
    return Promise.resolve();
  }

  public clear(): void {
    this.sent.length = 0;
  }
}

/**
 * Fan a notification out to every configured channel, isolating failures: one
 * channel throwing is logged but never prevents the others from delivering.
 */
export class CompositeDelivery implements NotificationDelivery {
  private readonly channels: readonly NotificationDelivery[];

  public constructor(channels: readonly NotificationDelivery[]) {
    this.channels = channels;
  }

  public async deliver(notification: Notification): Promise<void> {
    const results = await Promise.allSettled(
      this.channels.map((channel) => channel.deliver(notification)),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        const reason = result.reason instanceof Error ? result.reason.message : 'unknown error';
        logger.error(`Notification delivery failed: ${reason}`);
      }
    }
  }
}

// How to resolve a recipient's address per channel. Email uses the user's
// stored email; push uses the user's most recently registered device token
// (undefined when none is registered, so the notification is skipped).
const DEFAULT_RESOLVERS: Readonly<Record<string, RecipientResolver>> = {
  email: async (userId) => (await userRepository.findById(userId))?.email,
  push: async (userId) => (await deviceTokenRepository.listTokens(userId))[0],
};

export interface BuildDeliveryOptions {
  /** Per-channel recipient resolvers (defaults to email-from-user-record / push-none). */
  resolvers?: Readonly<Record<string, RecipientResolver>>;
  /** Per-channel provider senders (each defaults to the inert logging sender). */
  senders?: Readonly<Record<string, MessageSender>>;
}

/**
 * Build a delivery from the configured channel names. Each known channel becomes
 * a provider-backed {@link ProviderDelivery} with its own resolver and sender;
 * unknown names (no resolver) are ignored, and an empty list yields a no-op
 * delivery, so nothing is sent unless a channel is enabled via `NOTIFY_CHANNELS`.
 * A channel with no configured sender uses the inert logging sender.
 */
export function buildDelivery(
  channelNames: readonly string[],
  options?: BuildDeliveryOptions,
): NotificationDelivery {
  const resolvers = options?.resolvers ?? DEFAULT_RESOLVERS;
  const senders = options?.senders ?? {};
  const channels = channelNames
    .map((name) => {
      const resolve = resolvers[name];
      return resolve === undefined
        ? undefined
        : new ProviderDelivery(name, resolve, senders[name] ?? loggingSender);
    })
    .filter((channel): channel is ProviderDelivery => channel !== undefined);
  return new CompositeDelivery(channels);
}

/**
 * Build the per-channel senders from configuration. The email channel sends via
 * the HTTP email provider only when all `EMAIL_*` values are set; otherwise it
 * (and every other channel) falls back to the inert logging sender.
 */
export function selectSenders(env: Env): Record<string, MessageSender> {
  const senders: Record<string, MessageSender> = {};
  if (
    env.EMAIL_API_URL !== undefined &&
    env.EMAIL_API_KEY !== undefined &&
    env.EMAIL_FROM !== undefined
  ) {
    senders['email'] = createHttpEmailSender({
      apiUrl: env.EMAIL_API_URL,
      apiKey: env.EMAIL_API_KEY,
      from: env.EMAIL_FROM,
    });
  }
  if (env.PUSH_API_URL !== undefined) {
    senders['push'] = createExpoPushSender({ apiUrl: env.PUSH_API_URL });
  }
  return senders;
}

const env = loadEnv();
export const notificationDelivery: NotificationDelivery = buildDelivery(env.NOTIFY_CHANNELS, {
  senders: selectSenders(env),
});
