import { randomUUID } from 'node:crypto';

import type {
  CreateServiceRequestInput,
  Principal,
  ServiceRequest,
  ServiceRequestStatus,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { serviceRequestRepository } from '../repositories/serviceRequestRepository.ts';

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

export function createServiceRequest(
  input: CreateServiceRequestInput,
  principal: Principal,
): ServiceRequest {
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
  };
  serviceRequestRepository.save(request);
  return request;
}

export function getServiceRequestForPrincipal(id: string, principal: Principal): ServiceRequest {
  const request = serviceRequestRepository.findById(id);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }
  if (principal.role !== 'admin' && principal.id !== request.customerId) {
    throw new AppError('Not allowed to view this service request', 403);
  }
  return request;
}

export function listServiceRequests(
  principal: Principal,
  limit: number,
  offset: number,
): ServiceRequestPage {
  let scoped: ServiceRequest[];
  if (principal.role === 'admin') {
    scoped = serviceRequestRepository.findAll();
  } else if (principal.role === 'customer') {
    scoped = serviceRequestRepository
      .findAll()
      .filter((request) => request.customerId === principal.id);
  } else {
    throw new AppError('Not allowed to list service requests', 403);
  }

  const sorted = [...scoped].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const items = sorted.slice(offset, offset + limit);
  return { items, total: sorted.length, limit, offset };
}

export function assignWorker(id: string, workerId: string, principal: Principal): ServiceRequest {
  if (principal.role !== 'admin') {
    throw new AppError('Only an admin may assign a worker', 403);
  }

  const request = serviceRequestRepository.findById(id);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }
  if (request.status !== 'pending') {
    throw new AppError('Only a pending request can be assigned', 422);
  }

  const updated: ServiceRequest = { ...request, workerId, status: 'matched' };
  serviceRequestRepository.save(updated);
  return updated;
}

export function updateServiceRequestStatus(
  id: string,
  nextStatus: ServiceRequestStatus,
  principal: Principal,
): ServiceRequest {
  const request = serviceRequestRepository.findById(id);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }

  const isAdmin = principal.role === 'admin';
  const isOwnerCustomer = principal.role === 'customer' && principal.id === request.customerId;
  const isAssignedWorker =
    principal.role === 'worker' &&
    request.workerId !== undefined &&
    principal.id === request.workerId;
  if (!isAdmin && !isOwnerCustomer && !isAssignedWorker) {
    throw new AppError('Not allowed to update this service request', 403);
  }

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
  serviceRequestRepository.save(updated);
  return updated;
}

export function resetServiceRequests(): void {
  serviceRequestRepository.clear();
}
