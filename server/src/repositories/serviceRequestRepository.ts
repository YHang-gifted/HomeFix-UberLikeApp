import type { ServiceRequest } from '../../../shared/schemas.ts';

export interface ServiceRequestRepository {
  save(request: ServiceRequest): void;
  findById(id: string): ServiceRequest | undefined;
  clear(): void;
}

export class InMemoryServiceRequestRepository implements ServiceRequestRepository {
  private readonly store = new Map<string, ServiceRequest>();

  public save(request: ServiceRequest): void {
    this.store.set(request.id, request);
  }

  public findById(id: string): ServiceRequest | undefined {
    return this.store.get(id);
  }

  public clear(): void {
    this.store.clear();
  }
}

export const serviceRequestRepository: ServiceRequestRepository =
  new InMemoryServiceRequestRepository();
