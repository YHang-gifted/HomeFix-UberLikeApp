import type { ServiceRequestStatus } from '../../../../shared/schemas.ts';

/**
 * Whether the owning customer may cancel a request in the given status. Mirrors
 * the server rule: cancellation is allowed from any non-terminal status
 * (pending, matched, accepted, in_progress) and rejected once the request is
 * completed or already cancelled.
 */
export function customerCanCancel(status: ServiceRequestStatus): boolean {
  return status !== 'completed' && status !== 'cancelled';
}
