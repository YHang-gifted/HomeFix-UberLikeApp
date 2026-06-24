import express from 'express';

import { getNotifications, patchNotificationRead } from '../controllers/notificationController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const notificationRouter = express.Router();

notificationRouter.get('/notifications', authenticate, getNotifications);
notificationRouter.patch('/notifications/:id/read', authenticate, patchNotificationRead);
