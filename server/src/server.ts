import process from 'node:process';

import { createApp } from './app.ts';
import { loadEnv } from './config/env.ts';
import { initServiceRequestStore } from './repositories/serviceRequestRepository.ts';
import { logger } from './utils/logger.ts';

async function main(): Promise<void> {
  const env = loadEnv();
  await initServiceRequestStore();
  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info(`HomeFix server listening on port ${String(env.PORT)}`);
  });
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : 'Failed to start the server');
  process.exit(1);
});
