import express from 'express';

import {
  getServiceRequestQuote,
  postServiceRequestQuote,
  postServiceRequestQuoteAccept,
  postServiceRequestQuoteDecline,
  postServiceRequestQuoteRevise,
} from '../controllers/quoteController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const quoteRouter = express.Router();

quoteRouter.get('/service-requests/:id/quote', authenticate, getServiceRequestQuote);
quoteRouter.post('/service-requests/:id/quote', authenticate, postServiceRequestQuote);
quoteRouter.post('/service-requests/:id/quote/accept', authenticate, postServiceRequestQuoteAccept);
quoteRouter.post(
  '/service-requests/:id/quote/decline',
  authenticate,
  postServiceRequestQuoteDecline,
);
quoteRouter.post('/service-requests/:id/quote/revise', authenticate, postServiceRequestQuoteRevise);
