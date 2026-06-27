import express from 'express';

import { postDeviceToken } from '../controllers/deviceTokenController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const deviceTokenRouter = express.Router();

deviceTokenRouter.post('/me/device-tokens', authenticate, postDeviceToken);
