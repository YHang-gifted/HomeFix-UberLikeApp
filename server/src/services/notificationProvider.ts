import type { Notification } from '../../../shared/schemas.ts';
import { logger } from '../utils/logger.ts';
import type { NotificationDelivery } from './notificationDelivery.ts';

/** A channel-agnostic outbound message ready to hand to a provider. */
export interface OutboundMessage {
  channel: string;
  /** The resolved destination: an email address, a device token, a phone number, … */
  to: string;
  subject: string;
  body: string;
}

/** Sends a fully-formed message via a real provider. Injected so it can be inert in tests/dev. */
export type MessageSender = (message: OutboundMessage) => Promise<void>;

/** Resolves a recipient's address for a channel from their user id (undefined = unreachable). */
export type RecipientResolver = (userId: string) => Promise<string | undefined>;

/** Turn a stored notification into an outbound message for a resolved recipient. */
export function formatOutboundMessage(
  channel: string,
  to: string,
  notification: Notification,
): OutboundMessage {
  return { channel, to, subject: 'HomeFix notification', body: notification.message };
}

/**
 * Default sender: logs the message instead of contacting a provider. Safe for
 * dev/test and honors the project rule against provider-side production actions.
 * Swap in a real SDK-backed sender (email/push) without touching callers.
 */
export const loggingSender: MessageSender = (message) => {
  logger.info(`[notify:${message.channel}] to=${message.to} :: ${message.body}`);
  return Promise.resolve();
};

/**
 * A provider-backed delivery channel: resolve the recipient's address, format the
 * message, and hand it to a {@link MessageSender}. A missing recipient is skipped
 * (logged), never thrown, so it can't break the action that triggered it.
 */
export class ProviderDelivery implements NotificationDelivery {
  private readonly channel: string;
  private readonly resolveRecipient: RecipientResolver;
  private readonly sender: MessageSender;

  public constructor(channel: string, resolveRecipient: RecipientResolver, sender: MessageSender) {
    this.channel = channel;
    this.resolveRecipient = resolveRecipient;
    this.sender = sender;
  }

  public async deliver(notification: Notification): Promise<void> {
    const to = await this.resolveRecipient(notification.userId);
    if (to === undefined || to === '') {
      logger.info(
        `[notify:${this.channel}] no ${this.channel} recipient for user ${notification.userId}; skipped`,
      );
      return;
    }
    await this.sender(formatOutboundMessage(this.channel, to, notification));
  }
}
