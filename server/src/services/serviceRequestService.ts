import { randomUUID } from 'node:crypto';

import type {
  AuditEvent,
  CreateServiceRequestInput,
  Principal,
  RequestContacts,
  ServiceRequest,
  ServiceRequestStatus,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { serviceRequestRepository } from '../repositories/serviceRequestRepository.ts';
import { userRepository } from '../repositories/userRepository.ts';
import { listEventsForResource, recordAuditEvent } from './auditService.ts';
import { recordNotification } from './notificationService.ts';

export interface ServiceRequestPage {
  items: ServiceRequest[];
  total: number;
  limit: number;
  offset: number;
}

const allowedTransitions: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
  pending: ['matched', 'cancelled'],
  matched: ['accepted', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** True if the principal is a party to the request: admin, owning customer, or assigned worker. */
export function isRequestParty(request: ServiceRequest, principal: Principal): boolean {
  if (principal.role === 'admin') {
    return true;
  }
  if (principal.role === 'customer') {
    return principal.id === request.customerId;
  }
  return request.workerId !== undefined && principal.id === request.workerId;
}

export async function createServiceRequest(
  input: CreateServiceRequestInput,
  principal: Principal,
): Promise<ServiceRequest> {
  if (principal.role !== 'customer' || principal.id !== input.customerId) {
    throw new AppError('Not allowed to create a service request for another user', 403);
  }

  const request: ServiceRequest = {
    id: randomUUID(),
    customerId: input.customerId,
    category: input.category,
    description: input.description,
    location: input.location,
    status: 'pending',
    createdAt: new Date().toISOString(),
    photoUrls: input.photoUrls ?? [],
  };
  await serviceRequestRepository.save(request);
  await recordAuditEvent({
    actor: principal,
    action: 'service_request.created',
    resourceId: request.id,
  });
  return request;
}

export async function getServiceRequestForPrincipal(
  id: string,
  principal: Principal,
): Promise<ServiceRequest> {
  const request = await serviceRequestRepository.findById(id);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }
  if (!isRequestParty(request, principal)) {
    throw new AppError('Not allowed to view this service request', 403);
  }
  return request;
}

export async function listServiceRequests(
  principal: Principal,
  limit: number,
  offset: number,
  status?: ServiceRequestStatus,
  q?: string,
): Promise<ServiceRequestPage> {
  let scoped: ServiceRequest[];
  if (principal.role === 'admin') {
    scoped = await serviceRequestRepository.findAll();
  } else if (principal.role === 'customer') {
    const all = await serviceRequestRepository.findAll();
    scoped = all.filter((request) => request.customerId === principal.id);
  } else {
    // worker: only the requests assigned to them
    const all = await serviceRequestRepository.findAll();
    scoped = all.filter((request) => request.workerId === principal.id);
  }

  const byStatus =
    status === undefined ? scoped : scoped.filter((request) => request.status === status);
  const needle = q?.trim().toLowerCase();
  const filtered =
    needle === undefined || needle === ''
      ? byStatus
      : byStatus.filter((request) => request.description.toLowerCase().includes(needle));
  const sorted = [...filtered].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const items = sorted.slice(offset, offset + limit);
  return { items, total: sorted.length, limit, offset };
}

/**
 * Pending requests with no assigned worker, for a worker (or admin) to browse
 * and claim. Lets matching happen self-serve instead of admin-only assignment.
 */
export async function listAvailableRequests(
  principal: Principal,
  limit: number,
  offset: number,
  category?: string,
): Promise<ServiceRequestPage> {
  if (principal.role !== 'worker' && principal.role !== 'admin') {
    throw new AppError('Only workers can browse available requests', 403);
  }
  const all = await serviceRequestRepository.findAll();
  const needle = category?.trim().toLowerCase();
  const available = all.filter(
    (request) =>
      request.status === 'pending' &&
      request.workerId === undefined &&
      (needle === undefined || needle === '' || request.category.toLowerCase() === needle),
  );
  const sorted = [...available].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const items = sorted.slice(offset, offset + limit);
  return { items, total: sorted.length, limit, offset };
}

export async function assignWorker(
  id: string,
  workerId: string,
  principal: Principal,
): Promise<ServiceRequest> {
  if (principal.role !== 'admin') {
    throw new AppError('Only an admin may assign a worker', 403);
  }

  const request = await serviceRequestRepository.findById(id);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }

  // Atomic claim: if a concurrent claim/assignment already took it, this returns
  // undefined rather than overwriting the existing assignment.
  const updated = await serviceRequestRepository.assignWorkerIfPending(id, workerId);
  if (!updated) {
    throw new AppError('Only a pending request can be assigned', 422);
  }
  // Snapshot the worker's name into the audit trail so the history reads
  // "Worker assigned: <name>" without a later lookup (and survives renames).
  const worker = await userRepository.findById(workerId);
  await recordAuditEvent({
    actor: principal,
    action: 'service_request.assigned',
    resourceId: id,
    details: {
      workerId,
      ...(worker?.displayName !== undefined ? { workerName: worker.displayName } : {}),
    },
  });
  await recordNotification({
    userId: workerId,
    message: 'You were assigned a new request.',
    requestId: id,
  });
  return updated;
}

/**
 * A worker claims a pending, unassigned request for themselves (self-serve
 * matching). Mirrors admin assignment — pending -> matched, sets workerId, and
 * snapshots the worker's name into the audit trail so the history reads
 * "Worker assigned: <name>". The owning customer is notified that a worker took
 * the job. Worker-only; 422 if the request is not pending or already taken.
 */
export async function claimRequest(id: string, principal: Principal): Promise<ServiceRequest> {
  if (principal.role !== 'worker') {
    throw new AppError('Only a worker may claim a request', 403);
  }

  const request = await serviceRequestRepository.findById(id);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }

  // Atomic claim: two workers racing for the same request can never both win;
  // the loser gets undefined here and a 422.
  const updated = await serviceRequestRepository.assignWorkerIfPending(id, principal.id);
  if (!updated) {
    throw new AppError('This request is no longer available to claim', 422);
  }
  const worker = await userRepository.findById(principal.id);
  await recordAuditEvent({
    actor: principal,
    action: 'service_request.assigned',
    resourceId: id,
    details: {
      workerId: principal.id,
      ...(worker?.displayName !== undefined ? { workerName: worker.displayName } : {}),
    },
  });
  await recordNotification({
    userId: request.customerId,
    message: 'A worker has accepted your request.',
    requestId: id,
  });
  return updated;
}

export async function updateServiceRequestStatus(
  id: string,
  nextStatus: ServiceRequestStatus,
  principal: Principal,
  reason?: string,
): Promise<ServiceRequest> {
  const request = await serviceRequestRepository.findById(id);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }

  if (!isRequestParty(request, principal)) {
    throw new AppError('Not allowed to update this service request', 403);
  }

  const isAdmin = principal.role === 'admin';
  const isOwnerCustomer = principal.role === 'customer' && principal.id === request.customerId;
  const transitions = allowedTransitions[request.status];
  let permitted: ServiceRequestStatus[];
  if (isAdmin) {
    permitted = transitions;
  } else if (isOwnerCustomer) {
    permitted = transitions.filter((status) => status === 'cancelled');
  } else {
    permitted = transitions.filter((status) => status !== 'cancelled');
  }
  if (!permitted.includes(nextStatus)) {
    throw new AppError(`Cannot transition from ${request.status} to ${nextStatus}`, 422);
  }

  const updated: ServiceRequest = { ...request, status: nextStatus };
  await serviceRequestRepository.save(updated);
  await recordAuditEvent({
    actor: principal,
    action: 'service_request.status_changed',
    resourceId: id,
    details: {
      from: request.status,
      to: nextStatus,
      ...(reason !== undefined ? { reason } : {}),
    },
  });
  await recordNotification({
    userId: request.customerId,
    message: `Your request is now ${nextStatus}.`,
    requestId: id,
  });
  return updated;
}

/**
 * Contact phone numbers for the parties of a request, visible only to the
 * request's own parties: the owning customer, the assigned worker, or an admin.
 * Keeps contact info scoped to a transaction rather than exposing it globally.
 */
export async function getRequestContacts(
  id: string,
  principal: Principal,
): Promise<RequestContacts> {
  const request = await serviceRequestRepository.findById(id);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }

  if (!isRequestParty(request, principal)) {
    throw new AppError('Not allowed to view contacts for this request', 403);
  }

  const customer = await userRepository.findById(request.customerId);
  const worker =
    request.workerId === undefined ? undefined : await userRepository.findById(request.workerId);
  return {
    ...(customer?.phone !== undefined ? { customerPhone: customer.phone } : {}),
    ...(worker?.phone !== undefined ? { workerPhone: worker.phone } : {}),
  };
}

/**
 * The status/audit history for a request (created → assigned → status changes),
 * oldest first. Visible only to the request's parties.
 */
export async function getRequestHistory(id: string, principal: Principal): Promise<AuditEvent[]> {
  const request = await serviceRequestRepository.findById(id);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }
  if (!isRequestParty(request, principal)) {
    throw new AppError('Not allowed to view this request history', 403);
  }
  return listEventsForResource(id);
}

export async function resetServiceRequests(): Promise<void> {
  await serviceRequestRepository.clear();
}
