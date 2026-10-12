import { createHash } from 'node:crypto';
import { getRedis, key } from '../config/redis.js';
import { ApiError } from '../utils/ApiError.js';
import { IDEMPOTENCY_TTL_SECONDS } from '../utils/constants.js';

const KEY_RE = /^[A-Za-z0-9_-]{8,80}$/;
const fingerprint = (req) =>
  createHash('sha256')
    .update(JSON.stringify(req.body ?? {}))
    .digest('hex');

/**
 * Idempotency-Key support for unsafe POSTs. Same key + same body => the stored response is
 * replayed (Idempotent-Replay: true); same key while the first request is still running => 409;
 * same key with a different body => 422. 5xx responses are not stored so the client may retry.
 * Must run after `authenticate` (keys are scoped per user) and body parsing.
 * @param {{required?: boolean}} [opts]
 */
export const idempotency =
  ({ required = false } = {}) =>
  async (req, res, next) => {
    try {
      const header = req.headers['idempotency-key'];
      if (!header) {
        return required ? next(ApiError.badRequest('Idempotency-Key header is required')) : next();
      }
      if (typeof header !== 'string' || !KEY_RE.test(header)) {
        return next(ApiError.badRequest('Idempotency-Key must be 8-80 chars of A-Z a-z 0-9 _ -'));
      }
      req.idempotencyKey = header;

      const redis = getRedis();
      const k = key('idem', req.user?.id ?? req.ip, req.method, req.baseUrl + req.path, header);
      const fp = fingerprint(req);

      const claimed = await redis.set(
        k,
        JSON.stringify({ state: 'processing', fp }),
        'EX',
        IDEMPOTENCY_TTL_SECONDS,
        'NX',
      );
      if (!claimed) {
        const prior = JSON.parse((await redis.get(k)) ?? '{}');
        if (prior.fp && prior.fp !== fp) {
          return next(
            ApiError.validation('Idempotency-Key was already used with a different request body'),
          );
        }
        if (prior.state === 'done') {
          res.set('Idempotent-Replay', 'true');
          return res.status(prior.status).json(prior.body);
        }
        return next(
          ApiError.conflict('A request with this Idempotency-Key is still being processed'),
        );
      }

      const originalJson = res.json.bind(res);
      res.json = (body) => {
        const done =
          res.statusCode < 500
            ? redis.set(
                k,
                JSON.stringify({ state: 'done', fp, status: res.statusCode, body }),
                'EX',
                IDEMPOTENCY_TTL_SECONDS,
              )
            : redis.del(k);
        done.catch(() => {});
        return originalJson(body);
      };
      return next();
    } catch (err) {
      return next(err);
    }
  };
