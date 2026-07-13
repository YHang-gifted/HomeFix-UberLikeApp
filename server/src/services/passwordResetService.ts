import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { loadEnv } from '../config/env.ts';
import { hashPassword } from '../auth/passwords.ts';
import { AppError } from '../errors/appError.ts';
import {
  passwordResetRepository,
  type PasswordResetToken,
} from '../repositories/passwordResetRepository.ts';
import { userRepository } from '../repositories/userRepository.ts';
import { logger } from '../utils/logger.ts';
import { redactProviderError } from './emailSender.ts';
import { selectSenders } from './notificationDelivery.ts';
import { loggingSender, type MessageSender, type OutboundMessage } from './notificationProvider.ts';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/** The configured email sender, or the inert logging sender when EMAIL_* is unset. */
const defaultEmailSender: MessageSender = selectSenders(loadEnv())['email'] ?? loggingSender;

/** SHA-256 of the reset token. The plaintext is emailed; only the hash is stored. */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface ResetOptions {
  /** Override the email sender (tests). Defaults to the configured/inert sender. */
  sender?: MessageSender;
  /** Override the clock (tests). */
  now?: () => Date;
}

/**
 * Request a password reset. Generates a single-use token, stores its hash, and
 * emails the plaintext to the user (best-effort). Always resolves — it never
 * reveals whether the email belongs to an account.
 */
export async function requestPasswordReset(
  email: string,
  options: ResetOptions = {},
): Promise<void> {
  const sender = options.sender ?? defaultEmailSender;
  const now = options.now ?? ((): Date => new Date());

  const user = await userRepository.findByEmail(email);
  if (!user) {
    return;
  }

  const token = randomBytes(32).toString('hex');
  const record: PasswordResetToken = {
    id: randomUUID(),
    userId: user.id,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(now().getTime() + TOKEN_TTL_MS).toISOString(),
    createdAt: now().toISOString(),
  };
  await passwordResetRepository.create(record);

  // Delivery is best-effort: a provider failure must not fail (or leak from) the request. The
  // response stays 204 either way — telling the caller the mail bounced would tell them the
  // account exists, which is the disclosure this endpoint is built to avoid.
  //
  // SEC-0009: `body` carries the PLAINTEXT reset token — the one secret this whole flow is
  // built to keep (only its SHA-256 hash is stored). It goes to the sender and nowhere else;
  // no sender may log it. When EMAIL_* is unset this is `loggingSender`, which used to print
  // the token and the address together into the application log.
  const mail: OutboundMessage = {
    channel: 'email',
    userId: user.id,
    to: user.email,
    subject: 'Reset your HomeFix password',
    body: `Use this code to reset your password: ${token}\nIt expires in 1 hour. If you did not request this, you can ignore this email.`,
  };

  try {
    await sender(mail);
  } catch (failure) {
    // Best-effort, but NOT silent. This used to be a bare `catch {}`: a misconfigured mail
    // provider — a 403 for an unverified sending domain is the normal way this fails on day
    // one — produced a cheerful 204 and left no trace anywhere. The user waits for a mail
    // that never arrives and cannot get into their account, and nobody finds out. Swallowing
    // the error is right; swallowing the *evidence* is not.
    //
    // The reason is redacted HERE, not just in the sender: `sender` is injectable, so a
    // future one could throw an error carrying the token, and this function is the one that
    // knows the token is a secret. Guarantee it where the secret lives (SEC-0009).
    logger.error('Password-reset email failed to send', {
      type: 'notify',
      channel: 'email',
      userId: user.id,
      reason: redactProviderError(
        failure instanceof Error ? failure.message : 'Unknown error',
        mail,
      ),
    });
  }
}

/**
 * Reset a password using an emailed token. The token must exist, be unused, and
 * not be expired (else 400). On success the password is updated, all existing
 * sessions are revoked (token_version bump), and the token is marked used.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
  options: Pick<ResetOptions, 'now'> = {},
): Promise<void> {
  const now = options.now ?? ((): Date => new Date());
  const record = await passwordResetRepository.findByTokenHash(hashResetToken(token));
  if (
    record === undefined ||
    record.usedAt !== undefined ||
    new Date(record.expiresAt).getTime() <= now().getTime()
  ) {
    throw new AppError('Invalid or expired reset token', 400);
  }

  await userRepository.updatePassword(record.userId, hashPassword(newPassword));
  await userRepository.bumpTokenVersion(record.userId);
  await passwordResetRepository.markUsed(record.id, now().toISOString());
}

export async function resetPasswordResetTokens(): Promise<void> {
  await passwordResetRepository.clear();
}
