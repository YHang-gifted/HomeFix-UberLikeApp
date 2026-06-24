import type { Principal, UpdateProfileInput, UserProfile } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { findUserById, updateUserDisplayName } from '../repositories/userRepository.ts';
import type { UserRecord } from '../repositories/userRepository.ts';

function toProfile(user: UserRecord): UserProfile {
  return { id: user.id, email: user.email, role: user.role, displayName: user.displayName };
}

/** The authenticated user's own profile. */
export function getProfile(principal: Principal): UserProfile {
  const user = findUserById(principal.id);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  return toProfile(user);
}

/** Update the authenticated user's own display name. */
export function updateProfile(principal: Principal, input: UpdateProfileInput): UserProfile {
  const updated = updateUserDisplayName(principal.id, input.displayName);
  if (!updated) {
    throw new AppError('User not found', 404);
  }
  return toProfile(updated);
}
