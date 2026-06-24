import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { AppError } from '../errors/appError.ts';
import { getWorkerById, listWorkers } from '../services/workerService.ts';

const idSchema = z.uuid();

export async function getWorkers(req: Request, res: Response, next: NextFunction): Promise<void> {
  const principal = req.principal;
  if (!principal) {
    next(new AppError('Authentication required', 401));
    return;
  }

  try {
    res.status(200).json(await listWorkers(principal));
  } catch (error) {
    next(error);
  }
}

export async function getWorker(req: Request, res: Response, next: NextFunction): Promise<void> {
  const principal = req.principal;
  if (!principal) {
    next(new AppError('Authentication required', 401));
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
