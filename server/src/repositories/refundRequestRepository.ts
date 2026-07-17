import process from 'node:process';

import type { RefundRequest } from '../../../shared/schemas.ts';
import { createPoolQueryable } from '../config/db.ts';
import { PostgresRefundRequestRepository } from './postgresRefundRequestRepository.ts';

/** A customer's refund request on a paid payment. At most one exists per request. */
export interface RefundRequestRepository {
  save(refundRequest: RefundRequest): Promise<void>;
  findById(id: string): Promise<RefundRequest | undefined>;
  findByRequest(requestId: string): Promise<RefundRequest | undefined>;
  /** All refund requests, most-recent-first (for the admin queue). */
  list(): Promise<RefundRequest[]>;
  clear(): Promise<void>;
}

export class InMemoryRefundRequestRepository implements RefundRequestRepository {
  private readonly refundRequests = new Map<string, RefundRequest>();

  public save(refundRequest: RefundRequest): Promise<void> {
    this.refundRequests.set(refundRequest.id, refundRequest);
    return Promise.resolve();
  }

  public findById(id: string): Promise<RefundRequest | undefined> {
    return Promise.resolve(this.refundRequests.get(id));
  }

  public findByRequest(requestId: string): Promise<RefundRequest | undefined> {
    return Promise.resolve(
      [...this.refundRequests.values()].find((r) => r.requestId === requestId),
    );
  }

  public list(): Promise<RefundRequest[]> {
    const all = [...this.refundRequests.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    return Promise.resolve(all);
  }

  public clear(): Promise<void> {
    this.refundRequests.clear();
    return Promise.resolve();
  }
}

export function selectRefundRequestRepository(
  databaseUrl: string | undefined,
): RefundRequestRepository {
  if (databaseUrl !== undefined && databaseUrl !== '') {
    return new PostgresRefundRequestRepository(createPoolQueryable(databaseUrl));
  }
  return new InMemoryRefundRequestRepository();
}

export const refundRequestRepository: RefundRequestRepository = selectRefundRequestRepository(
  process.env['DATABASE_URL'],
);
