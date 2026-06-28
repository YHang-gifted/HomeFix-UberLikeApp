import express from 'express';

import { getStats } from '../controllers/statsController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const adminRouter = express.Router();

adminRouter.get('/admin/stats', authenticate, getStats);
