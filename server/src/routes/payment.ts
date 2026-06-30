import express from 'express';

import {
  getMyPayments,
  getServiceRequestPayment,
  postPaymentWebhook,
  postServiceRequestPayment,
  postServiceRequestPaymentPay,
  postServiceRequestPaymentRefund,
} from '../controllers/paymentController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const paymentRouter = express.Router();

paymentRouter.get('/payments', authenticate, getMyPayments);
paymentRouter.get('/service-requests/:id/payment', authenticate, getServiceRequestPayment);
paymentRouter.post('/service-requests/:id/payment', authenticate, postServiceRequestPayment);
paymentRouter.post('/service-requests/:id/payment/pay', authenticate, postServiceRequestPaymentPay);
paymentRouter.post(
  '/service-requests/:id/payment/refund',
  authenticate,
  postServiceRequestPaymentRefund,
);
// Payment-provider webhook (verified by a shared secret, not a session).
paymentRouter.post('/webhooks/payments', postPaymentWebhook);
