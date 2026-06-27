import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { createQuoteInputSchema } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { acceptQuote, createQuote, declineQuote, getQuote } from '../services/quoteService.ts';

const idParamSchema = z.uuid();

function parseId(req: Request, next: NextFunction): string | undefined {
  const result = idParamSchema.safeParse(req.params['id']);
  if (!result.success) {
    next(new AppError('Invalid service request id', 422));
    return undefined;
  }
  return result.data;
}

export async function getServiceRequestQuote(
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
    res.status(200).json(await getQuote(id, principal));
  } catch (error) {
    next(error);
  }
}

export async function postServiceRequestQuote(
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

  const parsed = createQuoteInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid quote payload', 422));
    return;
  }

  try {
    res.status(201).json(await createQuote(id, parsed.data, principal));
  } catch (error) {
    next(error);
  }
}

export async function postServiceRequestQuoteAccept(
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
    res.status(200).json(await acceptQuote(id, principal));
  } catch (error) {
    next(error);
  }
}

export async function postServiceRequestQuoteDecline(
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
    res.status(200).json(await declineQuote(id, principal));
  } catch (error) {
    next(error);
  }
}
