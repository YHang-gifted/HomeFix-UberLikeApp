import type { ServiceRequest } from '../../../shared/schemas.ts';

export interface ServiceRequestRepository {
  save(request: ServiceRequest): Promise<void>;
  findById(id: string): Promise<ServiceRequest | undefined>;
  findAll(): Promise<ServiceRequest[]>;
  clear(): Promise<void>;
}

export class InMemoryServiceRequestRepository implements ServiceRequestRepository {
  private readonly store = new Map<string, ServiceRequest>();

  public save(request: ServiceRequest): Promise<void> {
    this.store.set(request.id, request);
    return Promise.resolve();
  }

  public findById(id: string): Promise<ServiceRequest | undefined> {
    return Promise.resolve(this.store.get(id));
  }

  public findAll(): Promise<ServiceRequest[]> {
    return Promise.resolve([...this.store.values()]);
  }

  public clear(): Promise<void> {
    this.store.clear();
    return Promise.resolve();
  }
}

export const serviceRequestRepository: ServiceRequestRepository =
  new InMemoryServiceRequestRepository();
