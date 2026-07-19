import type { NextFunction, Request, Response } from 'express';

import { createQuoteInputSchema, reviseQuoteInputSchema } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { parseUuidParam } from './parseUuidParam.ts';
import {
  acceptQuote,
  createQuote,
  declineQuote,
  getQuote,
  reviseQuote,
} from '../services/quoteService.ts';

function parseId(req: Request, next: NextFunction): string | undefined {
  return parseUuidParam(req, next, 'id', 'service request id');
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

/** On-site scope change: the assigned worker proposes a revised total, awaiting the customer. */
export async function postServiceRequestQuoteRevise(
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

  const parsed = reviseQuoteInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid revised quote payload', 422));
    return;
  }

  try {
    res.status(200).json(await reviseQuote(id, parsed.data, principal));
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
