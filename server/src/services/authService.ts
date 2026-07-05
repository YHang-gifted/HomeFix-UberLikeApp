import { randomUUID } from 'node:crypto';

import type {
  ChangePasswordInput,
  DeleteAccountInput,
  LoginInput,
  Principal,
  RegisterInput,
} from '../../../shared/schemas.ts';
import { signToken } from '../auth/jwt.ts';
import { hashPassword, verifyPassword } from '../auth/passwords.ts';
import { AppError } from '../errors/appError.ts';
import { userRepository } from '../repositories/userRepository.ts';
import type { UserRecord } from '../repositories/userRepository.ts';
import { recordAuditEvent } from './auditService.ts';

export interface LoginResult {
  token: string;
  principal: Principal;
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const user = await userRepository.findByEmail(input.email);
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw new AppError('Invalid email or password', 401);
  }
  if (user.status === 'suspended') {
    throw new AppError('This account has been suspended. Please contact support.', 403);
  }
  if (user.status !== 'active') {
    // A deleted (soft-deleted) account must not be distinguishable from a wrong
    // password, so it gets the same generic 401 as bad credentials.
    throw new AppError('Invalid email or password', 401);
  }
  const principal: Principal = { id: user.id, role: user.role };
  return { token: signToken(principal, user.tokenVersion), principal };
}

/** Create a new customer or worker account and sign them in. */
export async function registerUser(input: RegisterInput): Promise<LoginResult> {
  const existing = await userRepository.findByEmail(input.email);
  if (existing) {
    throw new AppError('An account with this email already exists', 409);
  }
  const user: UserRecord = {
    id: randomUUID(),
    email: input.email,
    role: input.role,
    displayName: input.displayName,
    passwordHash: hashPassword(input.password),
    tokenVersion: 0,
    status: 'active',
    notifyEmail: true,
    notifyPush: true,
  };
  await userRepository.create(user);
  const principal: Principal = { id: user.id, role: user.role };
  return { token: signToken(principal, user.tokenVersion), principal };
}

/**
 * Change the authenticated user's own password. The current password is
 * re-verified server-side before the new hash is stored. 404 if the account is
 * gone, 401 if the current password is wrong.
 */
export async function changePassword(
  principal: Principal,
  input: ChangePasswordInput,
): Promise<{ token: string }> {
  const user = await userRepository.findById(principal.id);
  if (!user) {
    throw new AppError('Account not found', 404);
  }
  if (!verifyPassword(input.currentPassword, user.passwordHash)) {
    throw new AppError('Current password is incorrect', 401);
  }
  await userRepository.updatePassword(user.id, hashPassword(input.newPassword));
  // Invalidate all existing sessions (other devices), then issue a fresh token so
  // the caller's current device stays signed in.
  const newVersion = await userRepository.bumpTokenVersion(user.id);
  await recordAuditEvent({
    actor: principal,
    action: 'account.password_changed',
    resourceId: user.id,
  });
  return { token: signToken(principal, newVersion ?? user.tokenVersion + 1) };
}

/**
 * Log out of all devices: bump the user's token_version so every previously
 * issued token is rejected, and return a fresh token for the current device.
 */
export async function logoutAllDevices(principal: Principal): Promise<{ token: string }> {
  const newVersion = await userRepository.bumpTokenVersion(principal.id);
  if (newVersion === undefined) {
    throw new AppError('Account not found', 404);
  }
  await recordAuditEvent({
    actor: principal,
    action: 'account.sessions_revoked',
    resourceId: principal.id,
  });
  return { token: signToken(principal, newVersion) };
}

/**
 * Soft-delete the authenticated user's own account. The current password is
 * re-verified, then the account's personal data is scrubbed and its status set
 * to `deleted` (every token is revoked). The row is retained so foreign keys and
 * de-identified history stay intact. 404 if the account is gone, 401 on a wrong
 * password.
 */
export async function deleteAccount(
  principal: Principal,
  input: DeleteAccountInput,
): Promise<void> {
  const user = await userRepository.findById(principal.id);
  if (!user) {
    throw new AppError('Account not found', 404);
  }
  if (!verifyPassword(input.currentPassword, user.passwordHash)) {
    throw new AppError('Current password is incorrect', 401);
  }
  await userRepository.anonymize(user.id);
  await recordAuditEvent({
    actor: principal,
    action: 'account.deleted',
    resourceId: user.id,
  });
}
