import express from 'express';

import { getUser } from '../controllers/userController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const userRouter = express.Router();

userRouter.get('/users/:id', authenticate, getUser);
