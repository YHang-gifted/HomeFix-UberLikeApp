import process from 'node:process';

import type { Payout } from '../../../shared/schemas.ts';
import { createPoolQueryable } from '../config/db.ts';
import { PostgresPayoutRepository } from './postgresPayoutRepository.ts';

/**
 * A worker's payouts. One payout is created per paid payment (the worker's net),
 * then settled by the provider. Backed by Postgres when `DATABASE_URL` is set,
 * with an in-memory fallback for tests/dev.
 */
export interface PayoutRepository {
  save(payout: Payout): Promise<void>;
  findById(id: string): Promise<Payout | undefined>;
  findByPayment(paymentId: string): Promise<Payout | undefined>;
  /** A worker's payouts, most-recent-first. */
  findByWorker(workerId: string): Promise<Payout[]>;
  clear(): Promise<void>;
}

export class InMemoryPayoutRepository implements PayoutRepository {
  private readonly payouts = new Map<string, Payout>();

  public save(payout: Payout): Promise<void> {
    this.payouts.set(payout.id, payout);
    return Promise.resolve();
  }

  public findById(id: string): Promise<Payout | undefined> {
    return Promise.resolve(this.payouts.get(id));
  }

  public findByPayment(paymentId: string): Promise<Payout | undefined> {
    return Promise.resolve(
      [...this.payouts.values()].find((payout) => payout.paymentId === paymentId),
    );
  }

  public findByWorker(workerId: string): Promise<Payout[]> {
    return Promise.resolve(
      [...this.payouts.values()]
        .filter((payout) => payout.workerId === workerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  public clear(): Promise<void> {
    this.payouts.clear();
    return Promise.resolve();
  }
}

export function selectPayoutRepository(databaseUrl: string | undefined): PayoutRepository {
  if (databaseUrl !== undefined && databaseUrl !== '') {
    return new PostgresPayoutRepository(createPoolQueryable(databaseUrl));
  }
  return new InMemoryPayoutRepository();
}

export const payoutRepository: PayoutRepository = selectPayoutRepository(
  process.env['DATABASE_URL'],
);
