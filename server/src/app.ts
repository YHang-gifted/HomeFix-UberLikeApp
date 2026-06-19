import express from 'express';
import type { Express } from 'express';

import { errorHandler, notFoundHandler } from './middlewares/errorHandler.ts';
import { authRouter } from './routes/auth.ts';
import { healthRouter } from './routes/health.ts';
import { serviceRequestRouter } from './routes/serviceRequest.ts';

export function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(healthRouter);
  app.use(authRouter);
  app.use(serviceRequestRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
