import { loadEnv } from '../config/env.ts';
import type { Notification } from '../../../shared/schemas.ts';
import { logger } from '../utils/logger.ts';

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

// Known channels: recording mocks for email and push. Swap these for real
// provider-backed implementations in a later slice without changing callers.
export const emailDelivery = new RecordingDelivery('email');
export const pushDelivery = new RecordingDelivery('push');

const KNOWN_CHANNELS: Readonly<Record<string, NotificationDelivery>> = {
  email: emailDelivery,
  push: pushDelivery,
};

/**
 * Build a delivery from the configured channel names, keeping only known ones
 * (unknown names are ignored). An empty list yields a no-op delivery, so nothing
 * is sent unless a channel is explicitly enabled via `NOTIFY_CHANNELS`.
 */
export function buildDelivery(channelNames: readonly string[]): NotificationDelivery {
  const channels = channelNames
    .map((name) => KNOWN_CHANNELS[name])
    .filter((channel): channel is NotificationDelivery => channel !== undefined);
  return new CompositeDelivery(channels);
}

export const notificationDelivery: NotificationDelivery = buildDelivery(loadEnv().NOTIFY_CHANNELS);

/** Clear the recorded delivery attempts (used by tests and reset flows). */
export function resetDeliveries(): void {
  emailDelivery.clear();
  pushDelivery.clear();
}
