import type { NextFunction, Request, Response } from 'express';

import { requirePrincipal } from '../middlewares/auth.ts';
import { parseUuidParam } from './parseUuidParam.ts';
import { getWorkerById, listWorkers } from '../services/workerService.ts';

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

  const id = parseUuidParam(req, next, 'id', 'worker id');
  if (id === undefined) {
    return;
  }

  try {
    res.status(200).json(await getWorkerById(id));
  } catch (error) {
    next(error);
  }
}
