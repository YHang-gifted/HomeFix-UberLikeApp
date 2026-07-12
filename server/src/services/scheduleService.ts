import type {
  Principal,
  ProposeScheduleInput,
  ScheduleProposer,
  ServiceRequest,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { serviceRequestRepository } from '../repositories/serviceRequestRepository.ts';
import { recordAuditEvent } from './auditService.ts';
import { recordNotification } from './notificationService.ts';

/**
 * The visit schedule is a two-party agreement, negotiated exactly like a counter-offer:
 * either party puts a time on the table (`proposed`), and only the OTHER party can accept it
 * (`confirmed`). Proposing again — even after a confirmation — drops it back to `proposed`,
 * which is how a reschedule is asked for. Admins are deliberately excluded: they can see the
 * request but they are not a party to the appointment.
 */

/** Statuses in which a visit can no longer be scheduled. */
const TERMINAL_STATUSES = ['completed', 'cancelled'];

/** The scheduling party the principal acts as, or undefined if they are not a party. */
function proposerFor(request: ServiceRequest, principal: Principal): ScheduleProposer | undefined {
  if (principal.role === 'customer' && principal.id === request.customerId) {
    return 'customer';
  }
  if (principal.role === 'worker' && principal.id === request.workerId) {
    return 'worker';
  }
  return undefined;
}

/** The other party's user id — who to notify when one side moves. */
function counterpartyId(request: ServiceRequest, me: ScheduleProposer): string | undefined {
  return me === 'customer' ? request.workerId : request.customerId;
}

/**
 * Load a request and check the caller may schedule on it: they must be a party (the owning
 * customer or the assigned worker), the request must have an assigned worker to agree with,
 * and it must not be finished or cancelled.
 */
async function loadForScheduling(
  requestId: string,
  principal: Principal,
): Promise<{ request: ServiceRequest; me: ScheduleProposer }> {
  const request = await serviceRequestRepository.findById(requestId);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }
  const me = proposerFor(request, principal);
  if (me === undefined) {
    throw new AppError('Only the customer and the assigned worker may schedule the visit', 403);
  }
  if (request.workerId === undefined) {
    throw new AppError('This request has no assigned worker to schedule with', 422);
  }
  if (TERMINAL_STATUSES.includes(request.status)) {
    throw new AppError('This request is closed and can no longer be scheduled', 422);
  }
  return { request, me };
}

/**
 * Put a visit time on the table (or ask to reschedule an agreed one). The time must be in the
 * future. Sets the schedule to `proposed` by the caller, and notifies the other party — who is
 * the only one who can confirm it.
 */
export async function proposeSchedule(
  requestId: string,
  input: ProposeScheduleInput,
  principal: Principal,
): Promise<ServiceRequest> {
  const { request, me } = await loadForScheduling(requestId, principal);
  if (Date.parse(input.scheduledAt) <= Date.now()) {
    throw new AppError('The visit time must be in the future', 422);
  }

  const updated: ServiceRequest = {
    ...request,
    scheduledAt: input.scheduledAt,
    scheduleStatus: 'proposed',
    scheduleProposedBy: me,
  };
  await serviceRequestRepository.save(updated);

  const other = counterpartyId(request, me);
  if (other !== undefined) {
    await recordNotification({
      userId: other,
      message:
        request.scheduleStatus === 'confirmed'
          ? 'A new visit time has been proposed for a request — please confirm it.'
          : 'A visit time has been proposed for a request — please confirm it.',
      requestId: request.id,
    });
  }
  await recordAuditEvent({
    actor: principal,
    action: 'schedule.proposed',
    resourceId: request.id,
    details: { scheduledAt: input.scheduledAt },
  });
  return updated;
}

/**
 * Confirm the time the OTHER party proposed. You cannot confirm your own proposal (that would
 * let one side book the other unilaterally), and there must be a proposal outstanding.
 */
export async function confirmSchedule(
  requestId: string,
  principal: Principal,
): Promise<ServiceRequest> {
  const { request, me } = await loadForScheduling(requestId, principal);
  if (request.scheduleStatus !== 'proposed' || request.scheduledAt === undefined) {
    throw new AppError('There is no proposed visit time to confirm', 409);
  }
  if (request.scheduleProposedBy === me) {
    throw new AppError('The other party must confirm the time you proposed', 409);
  }

  const updated: ServiceRequest = { ...request, scheduleStatus: 'confirmed' };
  await serviceRequestRepository.save(updated);

  const other = counterpartyId(request, me);
  if (other !== undefined) {
    await recordNotification({
      userId: other,
      message: 'Your proposed visit time was confirmed.',
      requestId: request.id,
    });
  }
  await recordAuditEvent({
    actor: principal,
    action: 'schedule.confirmed',
    resourceId: request.id,
    details: { scheduledAt: request.scheduledAt },
  });
  return updated;
}
