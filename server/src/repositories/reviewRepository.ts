import type { Review } from '../../../shared/schemas.ts';

// In-memory review store. Swap for a persistent store later.
const reviews = new Map<string, Review>();

export function saveReview(review: Review): Promise<void> {
  reviews.set(review.id, review);
  return Promise.resolve();
}

export function findReviewByRequestId(requestId: string): Promise<Review | undefined> {
  return Promise.resolve([...reviews.values()].find((review) => review.requestId === requestId));
}

export function findReviewsByWorkerId(workerId: string): Promise<Review[]> {
  return Promise.resolve([...reviews.values()].filter((review) => review.workerId === workerId));
}

export function clearReviews(): Promise<void> {
  reviews.clear();
  return Promise.resolve();
}
