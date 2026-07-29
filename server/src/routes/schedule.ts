import express from 'express';

import {
  postServiceRequestLocation,
  postServiceRequestOnMyWay,
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
scheduleRouter.post('/service-requests/:id/on-my-way', authenticate, postServiceRequestOnMyWay);
scheduleRouter.post('/service-requests/:id/location', authenticate, postServiceRequestLocation);
