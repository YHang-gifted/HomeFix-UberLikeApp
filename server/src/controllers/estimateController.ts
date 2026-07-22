import type { NextFunction, Request, Response } from 'express';

import { requirePrincipal } from '../middlewares/auth.ts';
import { parseUuidParam } from './parseUuidParam.ts';
import { getEstimate } from '../services/estimateService.ts';

/** A non-binding rough price range for a quote-track request (any party). */
export async function getServiceRequestEstimate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }
  const id = parseUuidParam(req, next, 'id', 'service request id');
  if (id === undefined) {
    return;
  }

  try {
    res.status(200).json(await getEstimate(id, principal));
  } catch (error) {
    next(error);
  }
}
