import type { Payout } from '../../../shared/schemas.ts';
import { payoutSchema } from '../../../shared/schemas.ts';
import type { PayoutRepository, PayoutTotals } from './payoutRepository.ts';
import type { Queryable } from '../db/queryable.ts';

const UPSERT = `
  INSERT INTO payouts
    (id, payment_id, worker_id, amount_cents, currency, status, created_at, paid_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, paid_at = EXCLUDED.paid_at
`;

interface PayoutRow {
  id: string;
  payment_id: string;
  worker_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  created_at: string | Date;
  paid_at: string | Date | null;
}

function mapRow(row: unknown): Payout {
  const r = row as PayoutRow;
  return payoutSchema.parse({
    id: r.id,
    paymentId: r.payment_id,
    workerId: r.worker_id,
    amountCents: r.amount_cents,
    currency: r.currency,
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
    ...(r.paid_at !== null ? { paidAt: new Date(r.paid_at).toISOString() } : {}),
  });
}

export class PostgresPayoutRepository implements PayoutRepository {
  private readonly db: Queryable;

  public constructor(db: Queryable) {
    this.db = db;
  }

  public async save(payout: Payout): Promise<void> {
    await this.db.query(UPSERT, [
      payout.id,
      payout.paymentId,
      payout.workerId,
      payout.amountCents,
      payout.currency,
      payout.status,
      payout.createdAt,
      payout.paidAt ?? null,
    ]);
  }

  public async findById(id: string): Promise<Payout | undefined> {
    const result = await this.db.query('SELECT * FROM payouts WHERE id = $1', [id]);
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async findByPayment(paymentId: string): Promise<Payout | undefined> {
    const result = await this.db.query('SELECT * FROM payouts WHERE payment_id = $1', [paymentId]);
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async findByWorker(workerId: string): Promise<Payout[]> {
    const result = await this.db.query(
      'SELECT * FROM payouts WHERE worker_id = $1 ORDER BY created_at DESC',
      [workerId],
    );
    return result.rows.map(mapRow);
  }

  public async deleteByPayment(paymentId: string): Promise<void> {
    await this.db.query('DELETE FROM payouts WHERE payment_id = $1', [paymentId]);
  }

  public async outstandingTotals(): Promise<PayoutTotals> {
    const result = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
         COALESCE(SUM(amount_cents) FILTER (WHERE status = 'pending'), 0)::bigint AS pending_amount_cents,
         COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_count,
         COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid'), 0)::bigint AS paid_amount_cents
       FROM payouts`,
    );
    const row = result.rows[0] as {
      pending_count: number;
      pending_amount_cents: string | number;
      paid_count: number;
      paid_amount_cents: string | number;
    };
    return {
      pendingCount: Number(row.pending_count),
      pendingAmountCents: Number(row.pending_amount_cents),
      paidCount: Number(row.paid_count),
      paidAmountCents: Number(row.paid_amount_cents),
    };
  }

  public async clear(): Promise<void> {
    await this.db.query('DELETE FROM payouts');
  }
}
