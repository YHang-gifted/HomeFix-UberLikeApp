import process from 'node:process';

import type { Payment } from '../../../shared/schemas.ts';
import { createPoolQueryable } from '../config/db.ts';
import { PostgresPaymentRepository } from './postgresPaymentRepository.ts';

/** A request's payment record. At most one payment exists per request. */
export interface PaymentRepository {
  save(payment: Payment): Promise<void>;
  findByRequest(requestId: string): Promise<Payment | undefined>;
  clear(): Promise<void>;
}

export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly payments = new Map<string, Payment>();

  public save(payment: Payment): Promise<void> {
    this.payments.set(payment.id, payment);
    return Promise.resolve();
  }

  public findByRequest(requestId: string): Promise<Payment | undefined> {
    return Promise.resolve(
      [...this.payments.values()].find((payment) => payment.requestId === requestId),
    );
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
