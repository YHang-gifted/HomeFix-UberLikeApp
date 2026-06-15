import { randomUUID } from 'node:crypto';

import type {
  CreateServiceRequestInput,
  Principal,
  ServiceRequest,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';

const store = new Map<string, ServiceRequest>();

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
  store.set(request.id, request);
  return request;
}

export function getServiceRequestForPrincipal(id: string, principal: Principal): ServiceRequest {
  const request = store.get(id);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }
  if (principal.role !== 'admin' && principal.id !== request.customerId) {
    throw new AppError('Not allowed to view this service request', 403);
  }
  return request;
}

export function resetServiceRequests(): void {
  store.clear();
}
