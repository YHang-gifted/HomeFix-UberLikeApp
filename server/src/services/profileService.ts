import type { Principal, UpdateProfileInput, UserProfile } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { userRepository } from '../repositories/userRepository.ts';
import type { UserRecord } from '../repositories/userRepository.ts';
import { recordAuditEvent } from './auditService.ts';

function toProfile(user: UserRecord): UserProfile {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    ...(user.phone !== undefined ? { phone: user.phone } : {}),
    ...(user.bio !== undefined ? { bio: user.bio } : {}),
    ...(user.skills !== undefined ? { skills: user.skills } : {}),
    ...(user.availability !== undefined ? { availability: user.availability } : {}),
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
  const updated = await userRepository.updateProfile(principal.id, input);
  if (!updated) {
    throw new AppError('User not found', 404);
  }
  // Record which fields changed (names only — never the values, which may be
  // personal contact details) so profile edits are auditable.
  const changedFields = Object.keys(input);
  if (changedFields.length > 0) {
    await recordAuditEvent({
      actor: principal,
      action: 'profile.updated',
      resourceId: principal.id,
      details: { fields: changedFields.join(',') },
    });
  }
  return toProfile(updated);
}
