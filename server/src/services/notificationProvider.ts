import type { Notification } from '../../../shared/schemas.ts';
import { loadEnv } from '../config/env.ts';
import { logger } from '../utils/logger.ts';
import type { LogFields } from '../utils/logger.ts';
import type { NotificationDelivery } from './notificationDelivery.ts';

/** A channel-agnostic outbound message ready to hand to a provider. */
export interface OutboundMessage {
  channel: string;
  /** The recipient's user id. An internal identifier — unlike `to`, this is safe to log. */
  userId: string;
  /**
   * The resolved destination: an email address, a device token, a phone number, …
   *
   * **Never log this.** See {@link notificationLogFields} and SEC-0009.
   */
  to: string;
  subject: string;
  /**
   * The message text. **Never log this** — it is the delivery channel itself, so it can
   * carry a secret meant only for the recipient. The password-reset mail puts the
   * plaintext reset token in here (`passwordResetService.requestPasswordReset`). SEC-0009.
   */
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
  return {
    channel,
    userId: notification.userId,
    to,
    subject: 'HomeFix notification',
    body: notification.message,
  };
}

/**
 * The **only** fields of an outbound message that may be written to a log (SEC-0009).
 *
 * `to` and `body` are excluded by construction, not by discipline: the recipient is PII (an
 * email address or a push device token), and the body is the secret channel itself — the
 * password-reset mail carries the plaintext reset token in it. Logs are shipped off-box to a
 * drain, so anything in them is effectively disclosed to every operator and to a third party.
 *
 * `userId` is an internal UUID that is already the join key in the audit log; it identifies
 * the delivery without revealing how to reach the person. `bodyChars` is enough to tell an
 * empty message from a real one.
 *
 * Exported so the redaction is locked by a test rather than trusted to a reviewer's eye.
 */
export function notificationLogFields(message: OutboundMessage): LogFields {
  return {
    type: 'notify',
    channel: message.channel,
    userId: message.userId,
    bodyChars: message.body.length,
  };
}

/**
 * Whether to log the recipient and body in full. **A development escape hatch, and refused in
 * production** — `env.ts` fails the boot if `NOTIFY_LOG_BODY` is set in production, the same
 * way SEC-0004 refuses the default `JWT_SECRET` there.
 *
 * It exists because the reset token is stored only as a SHA-256 hash: with no mail provider
 * configured and nothing in the log, a developer testing forgot-password locally could not
 * recover the token at all. That is a real need — but only on a laptop.
 */
function logsMessageContent(): boolean {
  return loadEnv().NOTIFY_LOG_BODY;
}

/**
 * Default sender: records that the message *would* have been sent, instead of contacting a
 * provider. Safe for dev/test and honors the project rule against provider-side production
 * actions. Swap in a real SDK-backed sender (email/push) without touching callers.
 *
 * It is deliberately **not** a full transcript. This is the sender a deployment falls back to
 * whenever `EMAIL_API_URL` / `PUSH_API_URL` are unset — which is every deployment that has not
 * yet configured mail — so treating it as a debug printf put live password-reset tokens into
 * the production log next to the address they unlock (SEC-0009).
 */
export const loggingSender: MessageSender = (message) => {
  if (logsMessageContent()) {
    logger.info(`[notify:${message.channel}] to=${message.to} :: ${message.body}`, {
      ...notificationLogFields(message),
      unsafeContentLogging: true,
    });
    return Promise.resolve();
  }
  logger.info('notification not sent (no provider configured)', notificationLogFields(message));
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
      logger.info('notification skipped (no recipient)', {
        type: 'notify',
        channel: this.channel,
        userId: notification.userId,
      });
      return;
    }
    await this.sender(formatOutboundMessage(this.channel, to, notification));
  }
}
