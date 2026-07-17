import type { RefundRequest } from '../../../shared/schemas.ts';
import { refundRequestSchema } from '../../../shared/schemas.ts';
import type { RefundRequestRepository } from './refundRequestRepository.ts';
import type { Queryable } from '../db/queryable.ts';

const UPSERT = `
  INSERT INTO refund_requests
    (id, request_id, payment_id, customer_id, reason, status, created_at, resolved_at, resolved_by, resolution_note)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    resolved_at = EXCLUDED.resolved_at,
    resolved_by = EXCLUDED.resolved_by,
    resolution_note = EXCLUDED.resolution_note
`;

interface RefundRequestRow {
  id: string;
  request_id: string;
  payment_id: string;
  customer_id: string;
  reason: string;
  status: string;
  created_at: string | Date;
  resolved_at: string | Date | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

function mapRow(row: unknown): RefundRequest {
  const r = row as RefundRequestRow;
  return refundRequestSchema.parse({
    id: r.id,
    requestId: r.request_id,
    paymentId: r.payment_id,
    customerId: r.customer_id,
    reason: r.reason,
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
    ...(r.resolved_at !== null ? { resolvedAt: new Date(r.resolved_at).toISOString() } : {}),
    ...(r.resolved_by !== null ? { resolvedBy: r.resolved_by } : {}),
    ...(r.resolution_note !== null ? { resolutionNote: r.resolution_note } : {}),
  });
}

export class PostgresRefundRequestRepository implements RefundRequestRepository {
  private readonly db: Queryable;

  public constructor(db: Queryable) {
    this.db = db;
  }

  public async save(refundRequest: RefundRequest): Promise<void> {
    await this.db.query(UPSERT, [
      refundRequest.id,
      refundRequest.requestId,
      refundRequest.paymentId,
      refundRequest.customerId,
      refundRequest.reason,
      refundRequest.status,
      refundRequest.createdAt,
      refundRequest.resolvedAt ?? null,
      refundRequest.resolvedBy ?? null,
      refundRequest.resolutionNote ?? null,
    ]);
  }

  public async findById(id: string): Promise<RefundRequest | undefined> {
    const result = await this.db.query('SELECT * FROM refund_requests WHERE id = $1', [id]);
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async findByRequest(requestId: string): Promise<RefundRequest | undefined> {
    const result = await this.db.query('SELECT * FROM refund_requests WHERE request_id = $1', [
      requestId,
    ]);
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async list(): Promise<RefundRequest[]> {
    const result = await this.db.query('SELECT * FROM refund_requests ORDER BY created_at DESC');
    return result.rows.map(mapRow);
  }

  public async clear(): Promise<void> {
    await this.db.query('DELETE FROM refund_requests');
  }
}
