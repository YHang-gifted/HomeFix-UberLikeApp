import express from 'express';

import {
  getReview,
  getReviewsForWorker,
  getWorkerRatings,
  postReview,
  postReviewReply,
} from '../controllers/reviewController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const reviewRouter = express.Router();

reviewRouter.post('/service-requests/:id/review', authenticate, postReview);
reviewRouter.get('/service-requests/:id/review', authenticate, getReview);
reviewRouter.post('/service-requests/:id/review/reply', authenticate, postReviewReply);
reviewRouter.get('/worker-ratings', authenticate, getWorkerRatings);
reviewRouter.get('/workers/:id/reviews', authenticate, getReviewsForWorker);
