import express from 'express';

import {
  getReviewsForWorker,
  getWorkerRatings,
  postReview,
} from '../controllers/reviewController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const reviewRouter = express.Router();

reviewRouter.post('/service-requests/:id/review', authenticate, postReview);
reviewRouter.get('/worker-ratings', authenticate, getWorkerRatings);
reviewRouter.get('/workers/:id/reviews', authenticate, getReviewsForWorker);
