import type { Coordinates, LiveLocation, Principal } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { serviceRequestRepository } from '../repositories/serviceRequestRepository.ts';
import { locationHub } from './locationHub.ts';

/**
 * The assigned worker posts their live position while on the way to a visit; it is relayed to the
 * request's parties over the WebSocket and **never stored** (live-tracking Phase 2, see
 * `docs/live-tracking.md`). Worker-only, and only once they have set out (`enRouteAt` set) so a
 * location never flows outside an active trip — the privacy boundary. 404/403/409 as appropriate.
 */
export async function publishLiveLocation(
  requestId: string,
  input: Coordinates,
  principal: Principal,
): Promise<LiveLocation> {
  const request = await serviceRequestRepository.findById(requestId);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }
  if (principal.role !== 'worker' || principal.id !== request.workerId) {
    throw new AppError('Only the assigned worker may share their location', 403);
  }
  if (request.enRouteAt === undefined) {
    throw new AppError('Location is only shared once you are on the way', 409);
  }
  const location: LiveLocation = {
    requestId,
    latitude: input.latitude,
    longitude: input.longitude,
    at: new Date().toISOString(),
  };
  locationHub.publish(location);
  return location;
}

export function resetTracking(): void {
  locationHub.clear();
}
