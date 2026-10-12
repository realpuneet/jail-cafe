import http from 'node:http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { connectDb, disconnectDb } from './config/db.js';
import { getRedis, disconnectRedis } from './config/redis.js';
import { createApp } from './app.js';
import { closeQueues } from './jobs/queues.js';
import { startWorkers } from './jobs/workers.js';
import { initSockets } from './sockets/index.js';

const SHUTDOWN_TIMEOUT_MS = 15_000;

/** Ordered teardown callbacks, populated as subsystems (sockets, queues) start in later phases. */
export const closers = [];

async function bootstrap() {
  await connectDb();
  const redis = getRedis();
  await new Promise((resolve, reject) => {
    if (redis.status === 'ready') return resolve();
    redis.once('ready', resolve);
    redis.once('end', () => reject(new Error('redis connection closed during startup')));
  });

  const app = createApp();
  const server = http.createServer(app);
  server.keepAliveTimeout = 65_000; // above typical LB idle timeout (60s)
  server.headersTimeout = 66_000;

  const sockets = initSockets(server);
  closers.push(() => sockets.close());
  if (env.RUN_WORKERS) closers.push(await startWorkers());
  closers.push(() => closeQueues());

  await new Promise((resolve) => server.listen(env.PORT, resolve));
  logger.info({ port: env.PORT, env: env.NODE_ENV, pid: process.pid }, 'API listening');

  let shuttingDown = false;
  const shutdown = async (signal, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.locals.state.shuttingDown = true; // /ready now returns 503 so the LB drains us
    logger.info({ signal }, 'shutting down');
    const force = setTimeout(() => {
      logger.error('shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();

    try {
      await new Promise((resolve) => {
        server.close(resolve); // stop accepting, wait for in-flight requests
        server.closeIdleConnections?.();
      });
      for (const close of closers) await close();
      await disconnectDb();
      await disconnectRedis();
      logger.info('shutdown complete');
      process.exit(exitCode);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    logger.fatal({ err }, 'unhandledRejection');
    shutdown('unhandledRejection', 1);
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaughtException');
    shutdown('uncaughtException', 1);
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
