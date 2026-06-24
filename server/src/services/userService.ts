import type { PublicUser } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { findUserById } from '../repositories/userRepository.ts';

/** Available to any authenticated user: a single user's public summary. */
export function getPublicUserById(id: string): PublicUser {
  const user = findUserById(id);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  return { id: user.id, displayName: user.displayName, role: user.role };
}
