import express from 'express';

import { getWorker, getWorkers } from '../controllers/workerController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const workerRouter = express.Router();

workerRouter.get('/workers', authenticate, getWorkers);
workerRouter.get('/workers/:id', authenticate, getWorker);
