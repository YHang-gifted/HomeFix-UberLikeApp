import type { NextFunction, Request, Response } from 'express';

import { loginInputSchema, registerInputSchema } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { login, registerUser } from '../services/authService.ts';

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
