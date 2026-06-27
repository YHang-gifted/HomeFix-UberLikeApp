import type { Review } from '../../../shared/schemas.ts';
import { reviewSchema } from '../../../shared/schemas.ts';
import type { RatingAggregate, ReviewRepository } from './reviewRepository.ts';
import type { Queryable } from '../db/queryable.ts';

const UPSERT = `
  INSERT INTO reviews
    (id, request_id, customer_id, worker_id, rating, comment, created_at, reply, replied_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (id) DO UPDATE SET reply = EXCLUDED.reply, replied_at = EXCLUDED.replied_at
`;

interface ReviewRow {
  id: string;
  request_id: string;
  customer_id: string;
  worker_id: string;
  rating: number;
  comment: string | null;
  created_at: string | Date;
  reply: string | null;
  replied_at: string | Date | null;
}

interface RatingRow {
  worker_id: string;
  review_count: number;
  average_rating: number;
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
    ...(r.reply !== null ? { reply: r.reply } : {}),
    ...(r.replied_at !== null ? { repliedAt: new Date(r.replied_at).toISOString() } : {}),
  };
  return reviewSchema.parse(candidate);
}

export class PostgresReviewRepository implements ReviewRepository {
  private readonly db: Queryable;

  public constructor(db: Queryable) {
    this.db = db;
  }

  public async save(review: Review): Promise<void> {
    await this.db.query(UPSERT, [
      review.id,
      review.requestId,
      review.customerId,
      review.workerId,
      review.rating,
      review.comment ?? null,
      review.createdAt,
      review.reply ?? null,
      review.repliedAt ?? null,
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

  public async aggregateRatings(): Promise<Map<string, RatingAggregate>> {
    const result = await this.db.query(
      `SELECT worker_id,
              COUNT(*)::int AS review_count,
              AVG(rating)::float8 AS average_rating
         FROM reviews
        GROUP BY worker_id`,
    );
    const aggregates = new Map<string, RatingAggregate>();
    for (const row of result.rows as RatingRow[]) {
      aggregates.set(row.worker_id, {
        reviewCount: row.review_count,
        averageRating: row.average_rating,
      });
    }
    return aggregates;
  }

  public async clear(): Promise<void> {
    await this.db.query('DELETE FROM reviews');
  }
}
