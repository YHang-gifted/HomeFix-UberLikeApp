import express from 'express';

import {
  getUsers,
  postReinstateUser,
  postSuspendUser,
} from '../controllers/accountAdminController.ts';
import { getStats } from '../controllers/statsController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const adminRouter = express.Router();

adminRouter.get('/admin/stats', authenticate, getStats);
adminRouter.get('/admin/users', authenticate, getUsers);
adminRouter.post('/admin/users/:id/suspend', authenticate, postSuspendUser);
adminRouter.post('/admin/users/:id/reinstate', authenticate, postReinstateUser);
