import { getRedis, key } from '../config/redis.js';
import { logger } from './logger.js';

/**
 * Namespaced + versioned read-through cache.
 * Key: jkc:cache:<ns>:v<version>:<parts...>. Invalidation = bump the namespace version
 * (O(1), no SCAN/KEYS); old entries simply expire by TTL. Fails open if Redis is down.
 */
const verKey = (ns) => key('cache', 'ver', ns);
const inflight = new Map(); // per-process single-flight to stop stampedes on a cold key

/** @param {string} ns */
async function version(ns) {
  return (await getRedis().get(verKey(ns))) ?? '0';
}

/**
 * @template T
 * @param {string} ns namespace, e.g. "menu"
 * @param {Array<string|number>} parts key parts (must fully describe the query)
 * @param {number} ttlSeconds
 * @param {() => Promise<T>} loader runs on miss
 * @returns {Promise<T>}
 */
export async function cached(ns, parts, ttlSeconds, loader) {
  let fullKey;
  try {
    fullKey = key('cache', ns, `v${await version(ns)}`, ...parts);
    const hit = await getRedis().get(fullKey);
    if (hit !== null) return JSON.parse(hit);
  } catch (err) {
    logger.warn({ err: err.message, ns }, 'cache read failed, falling back to source');
    return loader();
  }

  if (inflight.has(fullKey)) return inflight.get(fullKey);
  const p = (async () => {
    const value = await loader();
    try {
      await getRedis().set(fullKey, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      logger.warn({ err: err.message, ns }, 'cache write failed');
    }
    return value;
  })().finally(() => inflight.delete(fullKey));
  inflight.set(fullKey, p);
  return p;
}

/**
 * Invalidate one or more namespaces (call after every admin write).
 * @param {...string} namespaces
 */
export async function invalidate(...namespaces) {
  try {
    await Promise.all(namespaces.map((ns) => getRedis().incr(verKey(ns))));
  } catch (err) {
    logger.error({ err: err.message, namespaces }, 'cache invalidation failed');
  }
}
