import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import { createRedisConnection } from '../config/redis.js';
import { QUEUES } from '../utils/constants.js';

export const DEFAULT_JOB_OPTIONS = Object.freeze({
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
});

export const bullPrefix = () => `${env.REDIS_KEY_PREFIX}bull`;

let connection;
/** Shared connection for producers (workers get their own blocking connections). */
export const getQueueConnection = () => (connection ??= createRedisConnection('queue'));

const queues = new Map();
export function getQueue(name) {
  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection: getQueueConnection(),
        prefix: bullPrefix(),
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    );
  }
  return queues.get(name);
}

/** Test seam: replace job production (never set in production code). */
let adapter = null;
export const setQueueAdapter = (a) => {
  adapter = a;
};

/**
 * Enqueue a background job. API handlers call this and return immediately.
 * @param {string} queueName one of QUEUES
 * @param {string} jobName
 * @param {object} data
 * @param {import('bullmq').JobsOptions} [opts]
 */
export function enqueue(queueName, jobName, data, opts = {}) {
  if (adapter) return adapter(queueName, jobName, data, opts);
  return getQueue(queueName).add(jobName, data, opts);
}

export async function closeQueues() {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
  if (connection) {
    await connection.quit().catch(() => connection.disconnect());
    connection = undefined;
  }
}

export { QUEUES };
