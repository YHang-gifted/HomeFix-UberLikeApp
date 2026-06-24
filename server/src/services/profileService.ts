import type { Principal, UpdateProfileInput, UserProfile } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { userRepository } from '../repositories/userRepository.ts';
import type { UserRecord } from '../repositories/userRepository.ts';

function toProfile(user: UserRecord): UserProfile {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    ...(user.phone !== undefined ? { phone: user.phone } : {}),
  };
}

/** The authenticated user's own profile. */
export async function getProfile(principal: Principal): Promise<UserProfile> {
  const user = await userRepository.findById(principal.id);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  return toProfile(user);
}

/** Update the authenticated user's own display name and contact phone. */
export async function updateProfile(
  principal: Principal,
  input: UpdateProfileInput,
): Promise<UserProfile> {
  const updated = await userRepository.updateProfile(principal.id, input.displayName, input.phone);
  if (!updated) {
    throw new AppError('User not found', 404);
  }
  return toProfile(updated);
}
