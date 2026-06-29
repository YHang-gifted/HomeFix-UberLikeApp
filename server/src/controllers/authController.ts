import type { NextFunction, Request, Response } from 'express';

import {
  changePasswordInputSchema,
  loginInputSchema,
  registerInputSchema,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { changePassword, login, registerUser } from '../services/authService.ts';

export async function postLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const body: unknown = req.body;
  const parsed = loginInputSchema.safeParse(body);
  if (!parsed.success) {
    next(new AppError('Invalid login payload', 422));
    return;
  }

  try {
    const result = await login(parsed.data);
    res.status(200).json({ token: result.token });
  } catch (error) {
    next(error);
  }
}

export async function postRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
  const body: unknown = req.body;
  const parsed = registerInputSchema.safeParse(body);
  if (!parsed.success) {
    next(new AppError('Invalid registration payload', 422));
    return;
  }

  try {
    const result = await registerUser(parsed.data);
    res.status(201).json({ token: result.token });
  } catch (error) {
    next(error);
  }
}

export async function postChangePassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }
  const parsed = changePasswordInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid password payload', 422));
    return;
  }

  try {
    await changePassword(principal, parsed.data);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
