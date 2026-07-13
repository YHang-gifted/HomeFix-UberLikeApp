import type {
  PayoutAccountStatus,
  Principal,
  UpdateProfileInput,
  UserProfile,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { userRepository } from '../repositories/userRepository.ts';
import type { UserRecord } from '../repositories/userRepository.ts';
import { recordAuditEvent } from './auditService.ts';

/**
 * Where a worker stands with payout onboarding, derived from the two facts we store.
 *
 * The distinction that matters is **`pending`**: having a connected account is not the same as
 * being able to receive money. Stripe only confirms that through the `account.updated` webhook
 * (`stripePayoutsEnabled`), and returning from the hosted onboarding flow proves nothing —
 * verification can still be outstanding. Treating "has an account" as "done" is what let the
 * app keep offering "Set up payouts" to a worker who had already finished, and say nothing at
 * all to one who was stuck half-way while their payouts quietly piled up as pending.
 *
 * Exported so the mapping is locked by a test rather than re-derived in the UI.
 */
export function payoutAccountStatus(user: UserRecord): PayoutAccountStatus {
  if (user.stripeAccountId === undefined) {
    return 'none';
  }
  const enabled = user.stripePayoutsEnabled ?? false;
  return enabled ? 'enabled' : 'pending';
}

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
    // Workers only — nobody else can be paid out, so the field is meaningless for them.
    ...(user.role === 'worker' ? { payoutAccountStatus: payoutAccountStatus(user) } : {}),
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
