import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

/** Shared options. maxRetriesPerRequest:null is required by BullMQ blocking connections. */
const options = { maxRetriesPerRequest: null, enableReadyCheck: true };

/**
 * Create a new Redis connection. BullMQ workers and the Socket.io adapter need their own
 * dedicated connections, so call this instead of sharing the main client.
 * @param {string} [name] label used in logs
 */
export function createRedisConnection(name = 'main') {
  const client = new Redis(env.REDIS_URL, { ...options, connectionName: `jkc-${name}` });
  client.on('error', (err) => logger.error({ err: err.message, conn: name }, 'redis error'));
  client.on('ready', () => logger.info({ conn: name }, 'redis ready'));
  return client;
}

let client;

/** Test seam: inject a fake client (never used in production code paths). */
export function setRedisClient(fake) {
  client = fake;
}

/** Lazily created singleton used for cache, rate limits, OTP and sessions. */
export function getRedis() {
  if (!client) client = createRedisConnection('main');
  return client;
}

/**
 * Build a namespaced key: key('cache', 'menu', 'v1') -> "jkc:cache:menu:v1".
 * We prefix manually (not via ioredis keyPrefix) so the same helper works for BullMQ.
 */
export const key = (...parts) => `${env.REDIS_KEY_PREFIX}${parts.join(':')}`;

export async function disconnectRedis() {
  if (client) {
    await client.quit().catch(() => client.disconnect());
    client = undefined;
  }
}

export async function isRedisReady() {
  if (!client || client.status !== 'ready') return false;
  return (await client.ping()) === 'PONG';
}
