import express from 'express';

import { getMe, patchMe } from '../controllers/profileController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const profileRouter = express.Router();

profileRouter.get('/me', authenticate, getMe);
profileRouter.patch('/me', authenticate, patchMe);
