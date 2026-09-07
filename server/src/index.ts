import { createApp } from './app';
import { env } from './env';
import { logger } from './lib/logger';
import { pool } from './db';
import { startScheduler } from './lib/scheduler';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`QMS API listening on :${env.PORT} (${env.NODE_ENV})`);
  startScheduler();
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    try {
      await pool.end();
    } catch (err) {
      logger.error({ err }, 'Error closing DB pool');
    }
    process.exit(0);
  });
  // Hard-exit if connections don't drain in time.
  setTimeout(() => process.exit(1), 10_000).unref();
}

(['SIGTERM', 'SIGINT'] as const).forEach((sig) => process.on(sig, () => void shutdown(sig)));

process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled rejection'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
