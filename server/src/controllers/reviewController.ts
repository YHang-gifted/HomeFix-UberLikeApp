import type { NextFunction, Request, Response } from 'express';

import { createReviewInputSchema, replyReviewInputSchema } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { parseUuidParam } from './parseUuidParam.ts';
import {
  createReview,
  getReviewForRequest,
  getWorkerReviews,
  listWorkerRatings,
  replyToReview,
} from '../services/reviewService.ts';

export async function postReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const id = parseUuidParam(req, next, 'id', 'service request id');
  if (id === undefined) {
    return;
  }

  const parsed = createReviewInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid review payload', 422));
    return;
  }

  try {
    const review = await createReview(id, parsed.data, principal);
    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
}

export async function getReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const id = parseUuidParam(req, next, 'id', 'service request id');
  if (id === undefined) {
    return;
  }

  try {
    res.status(200).json(await getReviewForRequest(id, principal));
  } catch (error) {
    next(error);
  }
}

export async function postReviewReply(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const id = parseUuidParam(req, next, 'id', 'service request id');
  if (id === undefined) {
    return;
  }

  const parsed = replyReviewInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid reply payload', 422));
    return;
  }

  try {
    res.status(200).json(await replyToReview(id, parsed.data, principal));
  } catch (error) {
    next(error);
  }
}

export async function getReviewsForWorker(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const id = parseUuidParam(req, next, 'id', 'worker id');
  if (id === undefined) {
    return;
  }

  try {
    const reviews = await getWorkerReviews(id);
    res.status(200).json(reviews);
  } catch (error) {
    next(error);
  }
}

export async function getWorkerRatings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  try {
    res.status(200).json(await listWorkerRatings());
  } catch (error) {
    next(error);
  }
}
