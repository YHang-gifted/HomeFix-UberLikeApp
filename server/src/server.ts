import { createApp } from './app.ts';
import { loadEnv } from './config/env.ts';
import { logger } from './utils/logger.ts';

function main(): void {
  const env = loadEnv();
  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info(`HomeFix server listening on port ${String(env.PORT)}`);
  });
}

main();
