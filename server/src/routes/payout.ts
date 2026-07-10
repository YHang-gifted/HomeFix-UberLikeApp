import express from 'express';

import { getMyEarnings, getMyPayouts, postPayoutWebhook } from '../controllers/payoutController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const payoutRouter = express.Router();

payoutRouter.get('/payouts', authenticate, getMyPayouts);
payoutRouter.get('/payouts/summary', authenticate, getMyEarnings);
// Payout-provider webhook (verified by a shared secret, not a session).
payoutRouter.post('/webhooks/payouts', postPayoutWebhook);
