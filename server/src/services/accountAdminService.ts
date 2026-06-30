import type { AccountStatus, AdminUserSummary, Principal } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { userRepository } from '../repositories/userRepository.ts';
import { recordAuditEvent } from './auditService.ts';

export interface AccountStatusResult {
  id: string;
  status: AccountStatus;
}

/** Admin-only: list every account for account management. */
export async function listUsers(principal: Principal): Promise<AdminUserSummary[]> {
  if (principal.role !== 'admin') {
    throw new AppError('Only an admin may list accounts', 403);
  }
  const users = await userRepository.listAll();
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
  }));
}

/**
 * Admin-only: suspend an account so it can no longer sign in. The target's
 * token_version is bumped as well, so any session it already holds is rejected
 * on its next request. Idempotent: re-suspending an already-suspended account is
 * a no-op success. An admin may not suspend their own account, and a
 * soft-deleted account cannot be suspended.
 */
export async function suspendUser(
  principal: Principal,
  targetUserId: string,
): Promise<AccountStatusResult> {
  if (principal.role !== 'admin') {
    throw new AppError('Only an admin may suspend accounts', 403);
  }
  if (targetUserId === principal.id) {
    throw new AppError('You cannot suspend your own account', 400);
  }

  const target = await userRepository.findById(targetUserId);
  if (!target) {
    throw new AppError('Account not found', 404);
  }
  if (target.status === 'deleted') {
    throw new AppError('This account has been deleted', 409);
  }
  if (target.status === 'suspended') {
    return { id: target.id, status: 'suspended' };
  }

  await userRepository.setStatus(target.id, 'suspended');
  await userRepository.bumpTokenVersion(target.id);
  await recordAuditEvent({
    actor: principal,
    action: 'account.suspended',
    resourceId: target.id,
  });
  return { id: target.id, status: 'suspended' };
}

/**
 * Admin-only: lift a suspension, returning the account to `active`. Idempotent
 * for an already-active account. A soft-deleted account cannot be reinstated
 * (its personal data has been scrubbed).
 */
export async function reinstateUser(
  principal: Principal,
  targetUserId: string,
): Promise<AccountStatusResult> {
  if (principal.role !== 'admin') {
    throw new AppError('Only an admin may reinstate accounts', 403);
  }

  const target = await userRepository.findById(targetUserId);
  if (!target) {
    throw new AppError('Account not found', 404);
  }
  if (target.status === 'deleted') {
    throw new AppError('A deleted account cannot be reinstated', 409);
  }
  if (target.status === 'active') {
    return { id: target.id, status: 'active' };
  }

  await userRepository.setStatus(target.id, 'active');
  await recordAuditEvent({
    actor: principal,
    action: 'account.reinstated',
    resourceId: target.id,
  });
  return { id: target.id, status: 'active' };
}
