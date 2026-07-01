import process from 'node:process';

import express from 'express';
import type { Express, Request } from 'express';

import { loadEnv } from './config/env.ts';
import { createCorsMiddleware } from './middlewares/cors.ts';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.ts';
import { createRequestLogger } from './middlewares/requestLogger.ts';
import { adminRouter } from './routes/admin.ts';
import { auditRouter } from './routes/audit.ts';
import { authRouter } from './routes/auth.ts';
import { deviceTokenRouter } from './routes/deviceToken.ts';
import { favoriteRouter } from './routes/favorite.ts';
import { healthRouter } from './routes/health.ts';
import { notificationRouter } from './routes/notification.ts';
import { paymentRouter } from './routes/payment.ts';
import { payoutRouter } from './routes/payout.ts';
import { profileRouter } from './routes/profile.ts';
import { quoteRouter } from './routes/quote.ts';
import { reviewRouter } from './routes/review.ts';
import { serviceRequestRouter } from './routes/serviceRequest.ts';
import { uploadRouter } from './routes/upload.ts';
import { userRouter } from './routes/user.ts';
import { workerRouter } from './routes/worker.ts';

export function createApp(): Express {
  const app = express();
  const env = loadEnv();
  // Keep the test suites' output clean: silence the access log under test. jest
  // sets NODE_ENV=test; `node --test` sets NODE_TEST_CONTEXT in its workers.
  const underTest = env.NODE_ENV === 'test' || process.env['NODE_TEST_CONTEXT'] !== undefined;
  app.use(createRequestLogger(underTest ? () => undefined : undefined));
  app.use(createCorsMiddleware(env.CORS_ALLOWED_ORIGINS));
  // Capture the raw JSON body so webhook handlers can verify a provider's HMAC
  // signature over the exact bytes (a real provider signs the raw payload).
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as Request).rawBody = buf;
      },
    }),
  );
  app.use(healthRouter);
  app.use(authRouter);
  app.use(profileRouter);
  app.use(deviceTokenRouter);
  app.use(serviceRequestRouter);
  app.use(userRouter);
  app.use(workerRouter);
  app.use(reviewRouter);
  app.use(notificationRouter);
  app.use(favoriteRouter);
  app.use(paymentRouter);
  app.use(payoutRouter);
  app.use(uploadRouter);
  app.use(quoteRouter);
  app.use(auditRouter);
  app.use(adminRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
