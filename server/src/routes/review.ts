import express from 'express';

import { getReviewsForWorker, postReview } from '../controllers/reviewController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const reviewRouter = express.Router();

reviewRouter.post('/service-requests/:id/review', authenticate, postReview);
reviewRouter.get('/workers/:id/reviews', authenticate, getReviewsForWorker);
