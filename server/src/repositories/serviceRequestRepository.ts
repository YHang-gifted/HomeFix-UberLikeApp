import process from 'node:process';

import type { ServiceRequest } from '../../../shared/schemas.ts';
import { createPoolQueryable } from '../config/db.ts';
import { PostgresServiceRequestRepository } from './postgresServiceRequestRepository.ts';

export interface ServiceRequestRepository {
  save(request: ServiceRequest): Promise<void>;
  findById(id: string): Promise<ServiceRequest | undefined>;
  findAll(): Promise<ServiceRequest[]>;
  /**
   * Atomically assign a worker to a request only if it is still pending and
   * unassigned, returning the updated request — or undefined when it was not
   * claimable (missing, not pending, or already taken). This is a single
   * check-and-set so two concurrent claims can never both succeed (TOCTOU-safe).
   */
  assignWorkerIfPending(id: string, workerId: string): Promise<ServiceRequest | undefined>;
  /**
   * Atomically release a request back to the pool — only if it is currently
   * assigned to this worker and still in an active, non-terminal state. Clears
   * the worker and returns the request to `pending`, returning the updated row,
   * or undefined when it was not releasable (not theirs, completed, or cancelled).
   */
  releaseIfAssignedWorker(id: string, workerId: string): Promise<ServiceRequest | undefined>;
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

  public assignWorkerIfPending(id: string, workerId: string): Promise<ServiceRequest | undefined> {
    // Single synchronous check-and-set (no await between read and write), so two
    // concurrent claims cannot both pass the guard.
    const existing = this.store.get(id);
    if (
      existing === undefined ||
      existing.status !== 'pending' ||
      existing.workerId !== undefined
    ) {
      return Promise.resolve(undefined);
    }
    const updated: ServiceRequest = { ...existing, workerId, status: 'matched' };
    this.store.set(id, updated);
    return Promise.resolve(updated);
  }

  public releaseIfAssignedWorker(
    id: string,
    workerId: string,
  ): Promise<ServiceRequest | undefined> {
    const existing = this.store.get(id);
    if (
      existing === undefined ||
      existing.workerId !== workerId ||
      (existing.status !== 'matched' &&
        existing.status !== 'accepted' &&
        existing.status !== 'in_progress')
    ) {
      return Promise.resolve(undefined);
    }
    const updated: ServiceRequest = { ...existing, status: 'pending' };
    delete updated.workerId;
    this.store.set(id, updated);
    return Promise.resolve(updated);
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
