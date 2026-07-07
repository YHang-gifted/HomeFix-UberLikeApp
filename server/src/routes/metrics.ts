import express from 'express';
import type { NextFunction, Request, Response } from 'express';

import { loadEnv } from '../config/env.ts';
import { AppError } from '../errors/appError.ts';
import { metrics } from '../metrics/registry.ts';

export const metricsRouter = express.Router();

/**
 * Prometheus scrape endpoint. When `METRICS_TOKEN` is set the request must carry
 * `Authorization: Bearer <token>` (so a public deployment doesn't expose metrics);
 * when it is unset the endpoint is open (dev / trusted network). The body is
 * low-cardinality aggregate counters only — no user data, no request paths.
 */
metricsRouter.get('/metrics', (req: Request, res: Response, next: NextFunction): void => {
  const token = loadEnv().METRICS_TOKEN;
  if (token !== undefined && req.header('authorization') !== `Bearer ${token}`) {
    next(new AppError('Authentication required', 401));
    return;
  }
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.status(200).send(metrics.render());
});
