import type { Quote } from '../../../shared/schemas.ts';
import { quoteSchema } from '../../../shared/schemas.ts';
import type { QuoteRepository } from './quoteRepository.ts';
import type { Queryable } from '../db/queryable.ts';

const UPSERT = `
  INSERT INTO quotes
    (id, request_id, customer_id, worker_id, amount_cents, currency, note, status, created_at, responded_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, responded_at = EXCLUDED.responded_at
`;

interface QuoteRow {
  id: string;
  request_id: string;
  customer_id: string;
  worker_id: string;
  amount_cents: number;
  currency: string;
  note: string | null;
  status: string;
  created_at: string | Date;
  responded_at: string | Date | null;
}

function mapRow(row: unknown): Quote {
  const r = row as QuoteRow;
  return quoteSchema.parse({
    id: r.id,
    requestId: r.request_id,
    customerId: r.customer_id,
    workerId: r.worker_id,
    amountCents: r.amount_cents,
    currency: r.currency,
    ...(r.note !== null ? { note: r.note } : {}),
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
    ...(r.responded_at !== null ? { respondedAt: new Date(r.responded_at).toISOString() } : {}),
  });
}

export class PostgresQuoteRepository implements QuoteRepository {
  private readonly db: Queryable;

  public constructor(db: Queryable) {
    this.db = db;
  }

  public async save(quote: Quote): Promise<void> {
    await this.db.query(UPSERT, [
      quote.id,
      quote.requestId,
      quote.customerId,
      quote.workerId,
      quote.amountCents,
      quote.currency,
      quote.note ?? null,
      quote.status,
      quote.createdAt,
      quote.respondedAt ?? null,
    ]);
  }

  public async findByRequest(requestId: string): Promise<Quote | undefined> {
    const result = await this.db.query('SELECT * FROM quotes WHERE request_id = $1', [requestId]);
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async clear(): Promise<void> {
    await this.db.query('DELETE FROM quotes');
  }
}
