import express from 'express';

import { getUser, getUsers } from '../controllers/userController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const userRouter = express.Router();

userRouter.get('/users', authenticate, getUsers);
userRouter.get('/users/:id', authenticate, getUser);
