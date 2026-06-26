import express from 'express';
import type { Request, Response, Router } from 'express';

import { getDatabaseQueryable } from '../config/db.ts';
import { checkReadiness } from '../db/health.ts';
import type { Queryable } from '../db/queryable.ts';

/**
 * Liveness + readiness probes.
 *
 * - `GET /health` (liveness): the process is up. Always 200; never touches the DB.
 * - `GET /ready` (readiness): can we serve traffic now? Probes the database with
 *   `SELECT 1`; 200 when `ok`/`skipped`, 503 when the configured database is `down`
 *   so an orchestrator stops routing traffic to this instance.
 *
 * `resolveDatabase` is injectable so the readiness route can be tested without a
 * real Postgres connection.
 */
export function createHealthRouter(
  resolveDatabase: () => Queryable | undefined = getDatabaseQueryable,
): Router {
  const router = express.Router();

  router.get('/health', (_req: Request, res: Response): void => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  router.get('/ready', async (_req: Request, res: Response): Promise<void> => {
    const report = await checkReadiness(resolveDatabase());
    res.status(report.ready ? 200 : 503).json({ ...report, timestamp: new Date().toISOString() });
  });

  return router;
}

export const healthRouter = createHealthRouter();
