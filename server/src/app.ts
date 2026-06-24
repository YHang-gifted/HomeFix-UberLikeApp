import express from 'express';
import type { Express } from 'express';

import { corsMiddleware } from './middlewares/cors.ts';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.ts';
import { auditRouter } from './routes/audit.ts';
import { authRouter } from './routes/auth.ts';
import { healthRouter } from './routes/health.ts';
import { notificationRouter } from './routes/notification.ts';
import { profileRouter } from './routes/profile.ts';
import { reviewRouter } from './routes/review.ts';
import { serviceRequestRouter } from './routes/serviceRequest.ts';
import { workerRouter } from './routes/worker.ts';

export function createApp(): Express {
  const app = express();
  app.use(corsMiddleware);
  app.use(express.json());
  app.use(healthRouter);
  app.use(authRouter);
  app.use(profileRouter);
  app.use(serviceRequestRouter);
  app.use(workerRouter);
  app.use(reviewRouter);
  app.use(notificationRouter);
  app.use(auditRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
