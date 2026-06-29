import type { NextFunction, Request, Response } from 'express';

import {
  changePasswordInputSchema,
  deleteAccountInputSchema,
  forgotPasswordInputSchema,
  loginInputSchema,
  registerInputSchema,
  resetPasswordInputSchema,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import {
  changePassword,
  deleteAccount,
  login,
  logoutAllDevices,
  registerUser,
} from '../services/authService.ts';
import { requestPasswordReset, resetPassword } from '../services/passwordResetService.ts';

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
    const result = await changePassword(principal, parsed.data);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function postLogoutAll(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }
  try {
    const result = await logoutAllDevices(principal);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function postDeleteAccount(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }
  const parsed = deleteAccountInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid payload', 422));
    return;
  }

  try {
    await deleteAccount(principal, parsed.data);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function postForgotPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = forgotPasswordInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid payload', 422));
    return;
  }
  try {
    // Always 204 — never reveal whether the email belongs to an account.
    await requestPasswordReset(parsed.data.email);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function postResetPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = resetPasswordInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid payload', 422));
    return;
  }
  try {
    await resetPassword(parsed.data.token, parsed.data.newPassword);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
