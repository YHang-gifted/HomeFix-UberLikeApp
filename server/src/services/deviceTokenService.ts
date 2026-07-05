import type { Principal } from '../../../shared/schemas.ts';
import { deviceTokenRepository } from '../repositories/deviceTokenRepository.ts';
import { recordAuditEvent } from './auditService.ts';

/** Register a push token for the signed-in user, returning their current tokens. */
export async function registerDeviceToken(principal: Principal, token: string): Promise<string[]> {
  await deviceTokenRepository.add(principal.id, token);
  // Audit the registration as a security-relevant event — the raw token (which can
  // be used to push to the device) is never recorded.
  await recordAuditEvent({
    actor: principal,
    action: 'device.registered',
    resourceId: principal.id,
  });
  return deviceTokenRepository.listTokens(principal.id);
}

/** The push tokens registered for a user (used by push delivery to find a recipient). */
export async function getDeviceTokensForUser(userId: string): Promise<string[]> {
  return deviceTokenRepository.listTokens(userId);
}

export async function resetDeviceTokens(): Promise<void> {
  await deviceTokenRepository.clear();
}
