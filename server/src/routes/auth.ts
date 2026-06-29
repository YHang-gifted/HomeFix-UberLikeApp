import express from 'express';

import {
  postChangePassword,
  postForgotPassword,
  postLogin,
  postLogoutAll,
  postRegister,
  postResetPassword,
} from '../controllers/authController.ts';
import { authenticate } from '../middlewares/auth.ts';
import { createRateLimiter } from '../middlewares/rateLimit.ts';

export const authRouter = express.Router();

// Brute-force / abuse backstop on the unauthenticated auth endpoints (SEC-0003).
// Shared across login + register so a single client cannot hammer either.
const authRateLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

authRouter.post('/auth/register', authRateLimiter, postRegister);
authRouter.post('/auth/login', authRateLimiter, postLogin);
// Forgot-password flow: request a reset email, then reset with the emailed token.
authRouter.post('/auth/forgot-password', authRateLimiter, postForgotPassword);
authRouter.post('/auth/reset-password', authRateLimiter, postResetPassword);
// Authenticated self-service password change (re-verifies the current password).
authRouter.post('/auth/change-password', authenticate, postChangePassword);
// Log out of all devices by invalidating every previously issued token.
authRouter.post('/auth/logout-all', authenticate, postLogoutAll);
