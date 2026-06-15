import express from 'express';
import type { Request, Response } from 'express';

export const healthRouter = express.Router();

healthRouter.get('/health', (_req: Request, res: Response): void => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
