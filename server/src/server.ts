import process from 'node:process';

import { createApp } from './app.ts';
import { loadEnv } from './config/env.ts';
import { initDatabase } from './db/migrate.ts';
import { registerGracefulShutdown } from './lifecycle/gracefulShutdown.ts';
import { attachMessageSocket } from './realtime/messageSocket.ts';
import { logger } from './utils/logger.ts';

async function main(): Promise<void> {
  const env = loadEnv();
  await initDatabase();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`HomeFix server listening on port ${String(env.PORT)}`);
  });
  // Live chat: push new messages to connected parties over WebSocket.
  const wss = attachMessageSocket(server);
  // On a redeploy the platform sends SIGTERM: stop taking new work, let in-flight requests finish,
  // then exit — rather than dropping requests (including payment settlements) mid-flight.
  registerGracefulShutdown(server, wss);
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : 'Failed to start the server');
  process.exit(1);
});
