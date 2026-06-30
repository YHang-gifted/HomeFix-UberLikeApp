import type { Payout } from '../../../shared/schemas.ts';
import { payoutSchema } from '../../../shared/schemas.ts';
import type { PayoutRepository } from './payoutRepository.ts';
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

  public async clear(): Promise<void> {
    await this.db.query('DELETE FROM payouts');
  }
}
