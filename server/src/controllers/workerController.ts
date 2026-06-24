import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { getWorkerById, listWorkers } from '../services/workerService.ts';

const idSchema = z.uuid();

export async function getWorkers(req: Request, res: Response, next: NextFunction): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  try {
    res.status(200).json(await listWorkers(principal));
  } catch (error) {
    next(error);
  }
}

export async function getWorker(req: Request, res: Response, next: NextFunction): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }

  const idResult = idSchema.safeParse(req.params['id']);
  if (!idResult.success) {
    next(new AppError('Invalid worker id', 422));
    return;
  }

  try {
    res.status(200).json(await getWorkerById(idResult.data));
  } catch (error) {
    next(error);
  }
}
