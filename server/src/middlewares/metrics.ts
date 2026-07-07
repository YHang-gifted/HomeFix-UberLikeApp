import { performance } from 'node:perf_hooks';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { metrics } from '../metrics/registry.ts';

/**
 * Records HTTP metrics for every request: increments the in-flight gauge on entry
 * and, once the response settles (finish or an aborted close), records the
 * method/status counter and the handling duration. Labels are method + status only
 * (never the path), so cardinality stays bounded.
 */
export function createMetricsMiddleware(): RequestHandler {
  return function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
    metrics.startRequest();
    const start = performance.now();
    let settled = false;
    const settle = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      metrics.endRequest(req.method, res.statusCode, performance.now() - start);
    };
    res.on('finish', settle);
    res.on('close', settle);
    next();
  };
}
