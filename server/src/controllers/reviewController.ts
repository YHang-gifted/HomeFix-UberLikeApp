import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { createReviewInputSchema } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { createReview, getWorkerReviews } from '../services/reviewService.ts';

const idSchema = z.uuid();

export async function postReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  const principal = req.principal;
  if (!principal) {
    next(new AppError('Authentication required', 401));
    return;
  }

  const idResult = idSchema.safeParse(req.params['id']);
  if (!idResult.success) {
    next(new AppError('Invalid service request id', 422));
    return;
  }

  const parsed = createReviewInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid review payload', 422));
    return;
  }

  try {
    const review = await createReview(idResult.data, parsed.data, principal);
    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
}

export async function getReviewsForWorker(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = req.principal;
  if (!principal) {
    next(new AppError('Authentication required', 401));
    return;
  }

  const idResult = idSchema.safeParse(req.params['id']);
  if (!idResult.success) {
    next(new AppError('Invalid worker id', 422));
    return;
  }

  try {
    const reviews = await getWorkerReviews(idResult.data);
    res.status(200).json(reviews);
  } catch (error) {
    next(error);
  }
}
