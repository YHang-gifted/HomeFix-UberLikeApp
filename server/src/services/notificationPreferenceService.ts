import type {
  NotificationPreferences,
  Principal,
  UpdateNotificationPreferencesInput,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { userRepository } from '../repositories/userRepository.ts';

/** The signed-in user's notification channel preferences. */
export async function getNotificationPreferences(
  principal: Principal,
): Promise<NotificationPreferences> {
  const user = await userRepository.findById(principal.id);
  if (!user) {
    throw new AppError('Account not found', 404);
  }
  return { email: user.notifyEmail, push: user.notifyPush };
}

/** Update the signed-in user's notification channel preferences (partial). */
export async function updateNotificationPreferences(
  principal: Principal,
  input: UpdateNotificationPreferencesInput,
): Promise<NotificationPreferences> {
  const updated = await userRepository.updateNotificationPreferences(principal.id, input);
  if (!updated) {
    throw new AppError('Account not found', 404);
  }
  return { email: updated.notifyEmail, push: updated.notifyPush };
}
