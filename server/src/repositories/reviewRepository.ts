import process from 'node:process';

import type { Review } from '../../../shared/schemas.ts';
import { createPoolQueryable } from '../config/db.ts';
import { PostgresReviewRepository } from './postgresReviewRepository.ts';

export interface ReviewRepository {
  save(review: Review): Promise<void>;
  findByRequestId(requestId: string): Promise<Review | undefined>;
  findByWorkerId(workerId: string): Promise<Review[]>;
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
