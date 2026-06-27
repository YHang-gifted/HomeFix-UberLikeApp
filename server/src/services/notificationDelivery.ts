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

// Default channels: recording mocks for email and push. Swap these for real
// provider-backed implementations in a later slice.
export const emailDelivery = new RecordingDelivery('email');
export const pushDelivery = new RecordingDelivery('push');
export const notificationDelivery: NotificationDelivery = new CompositeDelivery([
  emailDelivery,
  pushDelivery,
]);

/** Clear the recorded delivery attempts (used by tests and reset flows). */
export function resetDeliveries(): void {
  emailDelivery.clear();
  pushDelivery.clear();
}
