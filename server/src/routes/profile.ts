import express from 'express';

import {
  getMe,
  getMyNotificationPreferences,
  patchMe,
  patchMyNotificationPreferences,
} from '../controllers/profileController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const profileRouter = express.Router();

profileRouter.get('/me', authenticate, getMe);
profileRouter.patch('/me', authenticate, patchMe);
profileRouter.get('/me/notification-preferences', authenticate, getMyNotificationPreferences);
profileRouter.patch('/me/notification-preferences', authenticate, patchMyNotificationPreferences);
