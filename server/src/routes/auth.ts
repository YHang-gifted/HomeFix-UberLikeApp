import express from 'express';

import { postLogin, postRegister } from '../controllers/authController.ts';

export const authRouter = express.Router();

authRouter.post('/auth/register', postRegister);
authRouter.post('/auth/login', postLogin);
