import express from 'express';

import { getServiceRequestEstimate } from '../controllers/estimateController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const estimateRouter = express.Router();

estimateRouter.get('/service-requests/:id/estimate', authenticate, getServiceRequestEstimate);
