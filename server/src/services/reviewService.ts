import { randomUUID } from 'node:crypto';

import type {
  CreateReviewInput,
  Principal,
  Review,
  WorkerReviews,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { serviceRequestRepository } from '../repositories/serviceRequestRepository.ts';
import {
  clearReviews,
  findReviewByRequestId,
  findReviewsByWorkerId,
  saveReview,
} from '../repositories/reviewRepository.ts';

/** A customer reviews the worker on their own completed request (one review per request). */
export async function createReview(
  requestId: string,
  input: CreateReviewInput,
  principal: Principal,
): Promise<Review> {
  const request = await serviceRequestRepository.findById(requestId);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }
  if (principal.role !== 'customer' || principal.id !== request.customerId) {
    throw new AppError('Only the owning customer may review this request', 403);
  }
  if (request.status !== 'completed') {
    throw new AppError('Only a completed request can be reviewed', 422);
  }
  if (request.workerId === undefined) {
    throw new AppError('This request has no assigned worker to review', 422);
  }

  const existing = await findReviewByRequestId(requestId);
  if (existing) {
    throw new AppError('This request has already been reviewed', 409);
  }

  const review: Review = {
    id: randomUUID(),
    requestId,
    customerId: request.customerId,
    workerId: request.workerId,
    rating: input.rating,
    createdAt: new Date().toISOString(),
    ...(input.comment !== undefined ? { comment: input.comment } : {}),
  };
  await saveReview(review);
  return review;
}

/** Available to any authenticated user: a worker's reviews and average rating. */
export async function getWorkerReviews(workerId: string): Promise<WorkerReviews> {
  const found = await findReviewsByWorkerId(workerId);
  const items = [...found].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const reviewCount = items.length;
  const averageRating =
    reviewCount === 0 ? 0 : items.reduce((sum, review) => sum + review.rating, 0) / reviewCount;
  return { workerId, reviewCount, averageRating, items };
}

export async function resetReviews(): Promise<void> {
  await clearReviews();
}
