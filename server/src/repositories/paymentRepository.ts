import type { Payment } from '../../../shared/schemas.ts';

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

// In-memory only for now; slice 62b adds PostgresPaymentRepository + a
// DATABASE_URL-based selector + migration, mirroring the other domains.
export const paymentRepository: PaymentRepository = new InMemoryPaymentRepository();
