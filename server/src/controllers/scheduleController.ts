import type { NextFunction, Request, Response } from 'express';

import { onMyWayInputSchema, proposeScheduleInputSchema } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { confirmSchedule, markEnRoute, proposeSchedule } from '../services/scheduleService.ts';
import { parseUuidParam } from './parseUuidParam.ts';

function parseId(req: Request, next: NextFunction): string | undefined {
  return parseUuidParam(req, next, 'id', 'service request id');
}

/** Propose (or re-propose) the visit time. Either party; the other one confirms. */
export async function postServiceRequestSchedule(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const id = parseId(req, next);
  if (id === undefined) {
    return;
  }

  const parsed = proposeScheduleInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid schedule payload', 422));
    return;
  }

  try {
    res.status(200).json(await proposeSchedule(id, parsed.data, principal));
  } catch (error) {
    next(error);
  }
}

/** Confirm the visit time the other party proposed. */
export async function postServiceRequestScheduleConfirm(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const id = parseId(req, next);
  if (id === undefined) {
    return;
  }

  try {
    res.status(200).json(await confirmSchedule(id, principal));
  } catch (error) {
    next(error);
  }
}

/** The assigned worker sets out for the confirmed visit ("on my way") — notifies the customer. */
export async function postServiceRequestOnMyWay(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const id = parseId(req, next);
  if (id === undefined) {
    return;
  }

  const parsed = onMyWayInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid on-my-way payload', 422));
    return;
  }

  try {
    res.status(200).json(await markEnRoute(id, parsed.data, principal));
  } catch (error) {
    next(error);
  }
}
