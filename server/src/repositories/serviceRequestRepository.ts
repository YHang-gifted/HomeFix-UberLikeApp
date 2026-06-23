import process from 'node:process';

import type { ServiceRequest } from '../../../shared/schemas.ts';
import { createPoolQueryable } from '../config/db.ts';
import { PostgresServiceRequestRepository } from './postgresServiceRequestRepository.ts';

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

export function selectServiceRequestRepository(
  databaseUrl: string | undefined,
): ServiceRequestRepository {
  if (databaseUrl !== undefined && databaseUrl !== '') {
    return new PostgresServiceRequestRepository(createPoolQueryable(databaseUrl));
  }
  return new InMemoryServiceRequestRepository();
}

export const serviceRequestRepository: ServiceRequestRepository = selectServiceRequestRepository(
  process.env['DATABASE_URL'],
);
