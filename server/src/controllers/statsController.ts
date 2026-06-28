import type { NextFunction, Request, Response } from 'express';

import { requirePrincipal } from '../middlewares/auth.ts';
import { getAdminStats } from '../services/statsService.ts';

export async function getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  try {
    res.status(200).json(await getAdminStats(principal));
  } catch (error) {
    next(error);
  }
}
