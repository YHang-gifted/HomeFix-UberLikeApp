import process from 'node:process';

import type { Payment } from '../../../shared/schemas.ts';
import { createPoolQueryable } from '../config/db.ts';
import { PostgresPaymentRepository } from './postgresPaymentRepository.ts';

/** A request's payment record. At most one payment exists per request. */
export interface PaymentRepository {
  save(payment: Payment): Promise<void>;
  findById(id: string): Promise<Payment | undefined>;
  findByRequest(requestId: string): Promise<Payment | undefined>;
  /** Look up a payment by the provider's reference (for webhook resolution). */
  findByProviderRef(providerRef: string): Promise<Payment | undefined>;
  /** A customer's payments, most-recent-first. */
  findByCustomer(customerId: string): Promise<Payment[]>;
  /** A worker's received payments, most-recent-first. */
  findByWorker(workerId: string): Promise<Payment[]>;
  /** Count and summed amount of paid payments (for the admin dashboard). */
  paidTotals(): Promise<{ count: number; amountCents: number }>;
  /** Remove the payment for a request (if any). Used when a job is returned to
   * the pool; only ever called for an unpaid payment (paid jobs cannot be
   * released/reset), so no settled money is dropped. */
  deleteByRequest(requestId: string): Promise<void>;
  clear(): Promise<void>;
}

export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly payments = new Map<string, Payment>();

  public save(payment: Payment): Promise<void> {
    this.payments.set(payment.id, payment);
    return Promise.resolve();
  }

  public findById(id: string): Promise<Payment | undefined> {
    return Promise.resolve(this.payments.get(id));
  }

  public findByRequest(requestId: string): Promise<Payment | undefined> {
    return Promise.resolve(
      [...this.payments.values()].find((payment) => payment.requestId === requestId),
    );
  }

  public findByProviderRef(providerRef: string): Promise<Payment | undefined> {
    return Promise.resolve(
      [...this.payments.values()].find((payment) => payment.providerRef === providerRef),
    );
  }

  public findByCustomer(customerId: string): Promise<Payment[]> {
    return Promise.resolve(
      [...this.payments.values()]
        .filter((payment) => payment.customerId === customerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  public findByWorker(workerId: string): Promise<Payment[]> {
    return Promise.resolve(
      [...this.payments.values()]
        .filter((payment) => payment.workerId === workerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  public paidTotals(): Promise<{ count: number; amountCents: number }> {
    const paid = [...this.payments.values()].filter((payment) => payment.status === 'paid');
    const amountCents = paid.reduce((sum, payment) => sum + payment.amountCents, 0);
    return Promise.resolve({ count: paid.length, amountCents });
  }

  public deleteByRequest(requestId: string): Promise<void> {
    for (const [id, payment] of this.payments) {
      if (payment.requestId === requestId) {
        this.payments.delete(id);
      }
    }
    return Promise.resolve();
  }

  public clear(): Promise<void> {
    this.payments.clear();
    return Promise.resolve();
  }
}

export function selectPaymentRepository(databaseUrl: string | undefined): PaymentRepository {
  if (databaseUrl !== undefined && databaseUrl !== '') {
    return new PostgresPaymentRepository(createPoolQueryable(databaseUrl));
  }
  return new InMemoryPaymentRepository();
}

export const paymentRepository: PaymentRepository = selectPaymentRepository(
  process.env['DATABASE_URL'],
);
