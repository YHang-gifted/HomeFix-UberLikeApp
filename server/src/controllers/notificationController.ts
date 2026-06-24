import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationService.ts';

const idSchema = z.uuid();

export async function getNotifications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }
  try {
    res.status(200).json(await listNotifications(principal));
  } catch (error) {
    next(error);
  }
}

export async function patchNotificationRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }
  const idResult = idSchema.safeParse(req.params['id']);
  if (!idResult.success) {
    next(new AppError('Invalid notification id', 422));
    return;
  }
  try {
    res.status(200).json(await markNotificationRead(principal, idResult.data));
  } catch (error) {
    next(error);
  }
}

export async function patchNotificationsReadAll(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }
  try {
    res.status(200).json(await markAllNotificationsRead(principal));
  } catch (error) {
    next(error);
  }
}
