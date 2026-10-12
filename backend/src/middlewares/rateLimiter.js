import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { env } from '../config/env.js';
import { getRedis, key } from '../config/redis.js';
import { ApiError } from '../utils/ApiError.js';

const handler = (_req, _res, next) => next(ApiError.tooMany());

/**
 * Build a limiter. Redis-backed (shared across all instances) except in tests.
 * @param {{name: string, windowMs?: number, max: number}} opts
 */
function build({ name, windowMs = env.RATE_LIMIT_WINDOW_MS, max }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler,
    skip: (req) => req.path === '/health' || req.path === '/ready',
    ...(env.isTest
      ? {}
      : {
          store: new RedisStore({
            sendCommand: (...args) => getRedis().call(...args),
            prefix: key('rl', name, ''),
          }),
        }),
  });
}

/** Applied to every request. */
export const globalLimiter = () => build({ name: 'global', max: env.RATE_LIMIT_MAX });

/** Stricter limiter for login / OTP endpoints. */
export const authLimiter = () => build({ name: 'auth', max: env.AUTH_RATE_LIMIT_MAX });
