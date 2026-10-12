import { env } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { disconnectRedis } from './config/redis.js';
import { closeQueues } from './jobs/queues.js';
import { startWorkers } from './jobs/workers.js';
import { logger } from './utils/logger.js';

/** Standalone worker process: `npm run worker` (use with RUN_WORKERS=false on the API). */
await connectDb();
const closeWorkers = await startWorkers();
logger.info({ env: env.NODE_ENV }, 'worker process running');

let stopping = false;
const stop = async (signal) => {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'worker shutting down');
  await closeWorkers();
  await closeQueues();
  await disconnectDb();
  await disconnectRedis();
  process.exit(0);
};
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
