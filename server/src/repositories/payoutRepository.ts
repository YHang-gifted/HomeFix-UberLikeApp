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
  /** Remove the payout for a payment (used to reverse a pending payout on refund). */
  deleteByPayment(paymentId: string): Promise<void>;
  /** Count + summed amount of payouts still owed (pending) and already paid. */
  outstandingTotals(): Promise<PayoutTotals>;
  /** The same totals, but for a single worker (their own earnings summary). */
  workerTotals(workerId: string): Promise<PayoutTotals>;
  clear(): Promise<void>;
}

/** Aggregate payout figures for the admin dashboard. */
export interface PayoutTotals {
  pendingCount: number;
  pendingAmountCents: number;
  paidCount: number;
  paidAmountCents: number;
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

  public deleteByPayment(paymentId: string): Promise<void> {
    for (const [id, payout] of this.payouts) {
      if (payout.paymentId === paymentId) {
        this.payouts.delete(id);
      }
    }
    return Promise.resolve();
  }

  public outstandingTotals(): Promise<PayoutTotals> {
    const totals: PayoutTotals = {
      pendingCount: 0,
      pendingAmountCents: 0,
      paidCount: 0,
      paidAmountCents: 0,
    };
    for (const payout of this.payouts.values()) {
      if (payout.status === 'paid') {
        totals.paidCount += 1;
        totals.paidAmountCents += payout.amountCents;
      } else {
        totals.pendingCount += 1;
        totals.pendingAmountCents += payout.amountCents;
      }
    }
    return Promise.resolve(totals);
  }

  public workerTotals(workerId: string): Promise<PayoutTotals> {
    const totals: PayoutTotals = {
      pendingCount: 0,
      pendingAmountCents: 0,
      paidCount: 0,
      paidAmountCents: 0,
    };
    for (const payout of this.payouts.values()) {
      if (payout.workerId !== workerId) {
        continue;
      }
      if (payout.status === 'paid') {
        totals.paidCount += 1;
        totals.paidAmountCents += payout.amountCents;
      } else {
        totals.pendingCount += 1;
        totals.pendingAmountCents += payout.amountCents;
      }
    }
    return Promise.resolve(totals);
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
