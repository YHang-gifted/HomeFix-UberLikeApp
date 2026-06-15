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

export function getServiceRequestById(id: string): ServiceRequest | undefined {
  return store.get(id);
}

export function resetServiceRequests(): void {
  store.clear();
}
