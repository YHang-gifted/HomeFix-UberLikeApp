import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../errors/appError.ts';
import { listWorkers } from '../services/workerService.ts';

export function getWorkers(req: Request, res: Response, next: NextFunction): void {
  const principal = req.principal;
  if (!principal) {
    next(new AppError('Authentication required', 401));
    return;
  }

  try {
    res.status(200).json(listWorkers(principal));
  } catch (error) {
    next(error);
  }
}
