import express from 'express';

import { postLogin, postRegister } from '../controllers/authController.ts';
import { createRateLimiter } from '../middlewares/rateLimit.ts';

export const authRouter = express.Router();

// Brute-force / abuse backstop on the unauthenticated auth endpoints (SEC-0003).
// Shared across login + register so a single client cannot hammer either.
const authRateLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

authRouter.post('/auth/register', authRateLimiter, postRegister);
authRouter.post('/auth/login', authRateLimiter, postLogin);
