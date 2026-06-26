import express from 'express';

import {
  getServiceRequestPayment,
  postServiceRequestPayment,
  postServiceRequestPaymentPay,
} from '../controllers/paymentController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const paymentRouter = express.Router();

paymentRouter.get('/service-requests/:id/payment', authenticate, getServiceRequestPayment);
paymentRouter.post('/service-requests/:id/payment', authenticate, postServiceRequestPayment);
paymentRouter.post('/service-requests/:id/payment/pay', authenticate, postServiceRequestPaymentPay);
