import type { Review } from '../../../shared/schemas.ts';
import { reviewSchema } from '../../../shared/schemas.ts';
import type { ReviewRepository } from './reviewRepository.ts';
import type { Queryable } from './postgresServiceRequestRepository.ts';

const INSERT = `
  INSERT INTO reviews
    (id, request_id, customer_id, worker_id, rating, comment, created_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
`;

interface ReviewRow {
  id: string;
  request_id: string;
  customer_id: string;
  worker_id: string;
  rating: number;
  comment: string | null;
  created_at: string | Date;
}

function mapRow(row: unknown): Review {
  const r = row as ReviewRow;
  const candidate = {
    id: r.id,
    requestId: r.request_id,
    customerId: r.customer_id,
    workerId: r.worker_id,
    rating: r.rating,
    createdAt: new Date(r.created_at).toISOString(),
    ...(r.comment !== null ? { comment: r.comment } : {}),
  };
  return reviewSchema.parse(candidate);
}

export class PostgresReviewRepository implements ReviewRepository {
  private readonly db: Queryable;

  public constructor(db: Queryable) {
    this.db = db;
  }

  public async save(review: Review): Promise<void> {
    await this.db.query(INSERT, [
      review.id,
      review.requestId,
      review.customerId,
      review.workerId,
      review.rating,
      review.comment ?? null,
      review.createdAt,
    ]);
  }

  public async findByRequestId(requestId: string): Promise<Review | undefined> {
    const result = await this.db.query('SELECT * FROM reviews WHERE request_id = $1', [requestId]);
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async findByWorkerId(workerId: string): Promise<Review[]> {
    const result = await this.db.query('SELECT * FROM reviews WHERE worker_id = $1', [workerId]);
    return result.rows.map(mapRow);
  }

  public async clear(): Promise<void> {
    await this.db.query('DELETE FROM reviews');
  }
}
