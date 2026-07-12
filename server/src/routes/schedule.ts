import express from 'express';

import {
  postServiceRequestSchedule,
  postServiceRequestScheduleConfirm,
} from '../controllers/scheduleController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const scheduleRouter = express.Router();

scheduleRouter.post('/service-requests/:id/schedule', authenticate, postServiceRequestSchedule);
scheduleRouter.post(
  '/service-requests/:id/schedule/confirm',
  authenticate,
  postServiceRequestScheduleConfirm,
);
