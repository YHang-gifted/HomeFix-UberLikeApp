import process from 'node:process';

import type { Review } from '../../../shared/schemas.ts';
import { createPoolQueryable } from '../config/db.ts';
import { PostgresReviewRepository } from './postgresReviewRepository.ts';

/** Aggregate rating stats for a single worker (count + average), no items. */
export interface RatingAggregate {
  reviewCount: number;
  averageRating: number;
}

export interface ReviewRepository {
  save(review: Review): Promise<void>;
  findByRequestId(requestId: string): Promise<Review | undefined>;
  findByWorkerId(workerId: string): Promise<Review[]>;
  /** Count + average rating grouped by worker, keyed by workerId. Only workers with reviews appear. */
  aggregateRatings(): Promise<Map<string, RatingAggregate>>;
  clear(): Promise<void>;
}

export class InMemoryReviewRepository implements ReviewRepository {
  private readonly reviews = new Map<string, Review>();

  public save(review: Review): Promise<void> {
    this.reviews.set(review.id, review);
    return Promise.resolve();
  }

  public findByRequestId(requestId: string): Promise<Review | undefined> {
    return Promise.resolve(
      [...this.reviews.values()].find((review) => review.requestId === requestId),
    );
  }

  public findByWorkerId(workerId: string): Promise<Review[]> {
    return Promise.resolve(
      [...this.reviews.values()].filter((review) => review.workerId === workerId),
    );
  }

  public aggregateRatings(): Promise<Map<string, RatingAggregate>> {
    const sums = new Map<string, { total: number; count: number }>();
    for (const review of this.reviews.values()) {
      const current = sums.get(review.workerId) ?? { total: 0, count: 0 };
      sums.set(review.workerId, {
        total: current.total + review.rating,
        count: current.count + 1,
      });
    }
    const result = new Map<string, RatingAggregate>();
    for (const [workerId, { total, count }] of sums) {
      result.set(workerId, { reviewCount: count, averageRating: total / count });
    }
    return Promise.resolve(result);
  }

  public clear(): Promise<void> {
    this.reviews.clear();
    return Promise.resolve();
  }
}

export function selectReviewRepository(databaseUrl: string | undefined): ReviewRepository {
  if (databaseUrl !== undefined && databaseUrl !== '') {
    return new PostgresReviewRepository(createPoolQueryable(databaseUrl));
  }
  return new InMemoryReviewRepository();
}

export const reviewRepository: ReviewRepository = selectReviewRepository(
  process.env['DATABASE_URL'],
);
