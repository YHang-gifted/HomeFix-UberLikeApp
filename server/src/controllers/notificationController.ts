import type { NextFunction, Request, Response } from 'express';

import { requirePrincipal } from '../middlewares/auth.ts';
import { parseUuidParam } from './parseUuidParam.ts';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationService.ts';

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
  const id = parseUuidParam(req, next, 'id', 'notification id');
  if (id === undefined) {
    return;
  }
  try {
    res.status(200).json(await markNotificationRead(principal, id));
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
