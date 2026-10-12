import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { processNotification } from '../services/notification.service.js';
import { expireUnpaidOrders } from '../services/order.service.js';
import { refundOrder } from '../services/payment.service.js';
import { JOBS, ORDER, QUEUES } from '../utils/constants.js';
import { logger } from '../utils/logger.js';
import { bullPrefix, DEFAULT_JOB_OPTIONS, enqueue, getQueue } from './queues.js';

/** Route a job to its handler by queue name + job name. */
const handlers = {
  [QUEUES.NOTIFICATIONS]: { [JOBS.NOTIFY]: processNotification },
  [QUEUES.PAYMENTS]: { [JOBS.REFUND_ORDER]: (job) => refundOrder(job.data.orderId) },
  [QUEUES.MAINTENANCE]: {
    [JOBS.EXPIRE_UNPAID_ORDERS]: async () => ({
      cancelled: await expireUnpaidOrders(ORDER.UNPAID_EXPIRY_MINUTES),
    }),
  },
};

/** Register extra job handlers from later phases (reminders, invoices, rollups). */
export function registerHandlers(queue, map) {
  handlers[queue] = { ...handlers[queue], ...map };
}

/**
 * Jobs that exhaust their retries are copied to a dead-letter queue for inspection / replay.
 * @param {string} queueName
 * @param {import('bullmq').Job|undefined} job
 * @param {Error} err
 */
export async function deadLetter(queueName, job, err) {
  if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return false;
  await getQueue(QUEUES.NOTIFICATIONS_DLQ).add(
    'dead',
    {
      queue: queueName,
      name: job.name,
      data: job.data,
      error: err.message,
      failedAt: new Date().toISOString(),
    },
    { removeOnComplete: false, attempts: 1 },
  );
  logger.error(
    { queue: queueName, jobId: job.id, err: err.message },
    'job moved to dead-letter queue',
  );
  return true;
}

/**
 * Start all workers (each with its own blocking Redis connection) and the repeatable jobs.
 * @returns {Promise<() => Promise<void>>} closer for graceful shutdown
 */
export async function startWorkers() {
  const workers = [QUEUES.NOTIFICATIONS, QUEUES.PAYMENTS, QUEUES.MAINTENANCE].map((name) => {
    const connection = createRedisConnection(`worker-${name}`);
    const worker = new Worker(
      name,
      (job) => {
        const fn = handlers[name]?.[job.name];
        if (!fn) throw new Error(`No handler for ${name}/${job.name}`);
        return fn(job);
      },
      { connection, prefix: bullPrefix(), concurrency: name === QUEUES.NOTIFICATIONS ? 20 : 5 },
    );
    worker.on('failed', (job, err) => {
      logger.warn(
        { queue: name, jobId: job?.id, attempt: job?.attemptsMade, err: err.message },
        'job failed',
      );
      deadLetter(name, job, err).catch((e) =>
        logger.error({ err: e.message }, 'dead-letter failed'),
      );
    });
    worker.on('error', (err) => logger.error({ queue: name, err: err.message }, 'worker error'));
    return { worker, connection };
  });

  await getQueue(QUEUES.MAINTENANCE).upsertJobScheduler(
    JOBS.EXPIRE_UNPAID_ORDERS,
    { every: 5 * 60 * 1000 },
    { name: JOBS.EXPIRE_UNPAID_ORDERS, opts: { ...DEFAULT_JOB_OPTIONS, attempts: 2 } },
  );

  logger.info({ queues: workers.length }, 'workers started');
  return async () => {
    await Promise.all(workers.map(({ worker }) => worker.close()));
    await Promise.all(
      workers.map(({ connection }) => connection.quit().catch(() => connection.disconnect())),
    );
  };
}

export { enqueue };
