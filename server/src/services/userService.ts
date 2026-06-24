import type { PublicUser } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { userRepository } from '../repositories/userRepository.ts';
import type { UserRecord } from '../repositories/userRepository.ts';

function toPublicUser(user: UserRecord): PublicUser {
  return { id: user.id, displayName: user.displayName, role: user.role };
}

/** Available to any authenticated user: a single user's public summary. */
export async function getPublicUserById(id: string): Promise<PublicUser> {
  const user = await userRepository.findById(id);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  return toPublicUser(user);
}

/**
 * Public summaries for a set of ids, in one call. Unknown ids are skipped (no
 * error), so a caller can resolve display names for a list of mixed ids.
 */
export async function getPublicUsersByIds(ids: string[]): Promise<PublicUser[]> {
  const uniqueIds = [...new Set(ids)];
  const users = await Promise.all(uniqueIds.map((id) => userRepository.findById(id)));
  return users
    .filter((user): user is UserRecord => user !== undefined)
    .map((user) => toPublicUser(user));
}
