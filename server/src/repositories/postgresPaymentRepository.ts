import type { Payment } from '../../../shared/schemas.ts';
import { paymentSchema } from '../../../shared/schemas.ts';
import type { PaymentRepository } from './paymentRepository.ts';
import type { Queryable } from '../db/queryable.ts';

const UPSERT = `
  INSERT INTO payments
    (id, request_id, customer_id, worker_id, amount_cents, currency, status, created_at, paid_at, platform_fee_cents)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, paid_at = EXCLUDED.paid_at
`;

interface PaymentRow {
  id: string;
  request_id: string;
  customer_id: string;
  worker_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  created_at: string | Date;
  paid_at: string | Date | null;
  platform_fee_cents: number;
}

function mapRow(row: unknown): Payment {
  const r = row as PaymentRow;
  const platformFeeCents = r.platform_fee_cents;
  return paymentSchema.parse({
    id: r.id,
    requestId: r.request_id,
    customerId: r.customer_id,
    workerId: r.worker_id,
    amountCents: r.amount_cents,
    currency: r.currency,
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
    platformFeeCents,
    workerNetCents: r.amount_cents - platformFeeCents,
    ...(r.paid_at !== null ? { paidAt: new Date(r.paid_at).toISOString() } : {}),
  });
}

export class PostgresPaymentRepository implements PaymentRepository {
  private readonly db: Queryable;

  public constructor(db: Queryable) {
    this.db = db;
  }

  public async save(payment: Payment): Promise<void> {
    await this.db.query(UPSERT, [
      payment.id,
      payment.requestId,
      payment.customerId,
      payment.workerId,
      payment.amountCents,
      payment.currency,
      payment.status,
      payment.createdAt,
      payment.paidAt ?? null,
      payment.platformFeeCents ?? 0,
    ]);
  }

  public async findByRequest(requestId: string): Promise<Payment | undefined> {
    const result = await this.db.query('SELECT * FROM payments WHERE request_id = $1', [requestId]);
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async findByCustomer(customerId: string): Promise<Payment[]> {
    const result = await this.db.query(
      'SELECT * FROM payments WHERE customer_id = $1 ORDER BY created_at DESC',
      [customerId],
    );
    return result.rows.map(mapRow);
  }

  public async findByWorker(workerId: string): Promise<Payment[]> {
    const result = await this.db.query(
      'SELECT * FROM payments WHERE worker_id = $1 ORDER BY created_at DESC',
      [workerId],
    );
    return result.rows.map(mapRow);
  }

  public async paidTotals(): Promise<{ count: number; amountCents: number }> {
    const result = await this.db.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_cents), 0)::bigint AS amount_cents
         FROM payments
        WHERE status = 'paid'`,
    );
    const row = result.rows[0] as { count: number; amount_cents: string | number };
    return { count: Number(row.count), amountCents: Number(row.amount_cents) };
  }

  public async deleteByRequest(requestId: string): Promise<void> {
    await this.db.query('DELETE FROM payments WHERE request_id = $1', [requestId]);
  }

  public async clear(): Promise<void> {
    await this.db.query('DELETE FROM payments');
  }
}
