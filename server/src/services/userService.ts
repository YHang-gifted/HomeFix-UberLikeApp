import type { PublicUser } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { findUserById } from '../repositories/userRepository.ts';

/** Available to any authenticated user: a single user's public summary. */
export function getPublicUserById(id: string): PublicUser {
  const user = findUserById(id);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  return {
    id: user.id,
    displayName: user.displayName,
    role: user.role,
    ...(user.phone !== undefined ? { phone: user.phone } : {}),
  };
}

/**
 * Public summaries for a set of ids, in one call. Unknown ids are skipped (no
 * error), so a caller can resolve display names for a list of mixed ids.
 */
export function getPublicUsersByIds(ids: string[]): PublicUser[] {
  const seen = new Set<string>();
  const result: PublicUser[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const user = findUserById(id);
    if (user) {
      result.push({
        id: user.id,
        displayName: user.displayName,
        role: user.role,
        ...(user.phone !== undefined ? { phone: user.phone } : {}),
      });
    }
  }
  return result;
}
