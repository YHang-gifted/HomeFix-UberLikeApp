import express from 'express';

import { postLogin } from '../controllers/authController.ts';

export const authRouter = express.Router();

authRouter.post('/auth/login', postLogin);
