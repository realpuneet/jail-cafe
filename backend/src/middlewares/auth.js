import { getRedis, key } from '../config/redis.js';
import { verifyAccessToken } from '../services/token.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** Redis flag set when an admin deactivates a user, so live access tokens stop working at once. */
export const blockedKey = (userId) => key('blocked', userId);

/** Require a valid Bearer access token; sets req.user = { id, role }. */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw ApiError.unauthorized();
  const payload = verifyAccessToken(header.slice(7)); // JWT errors -> 401 via error handler
  if (await getRedis().exists(blockedKey(payload.sub))) {
    throw ApiError.forbidden('Your account has been disabled');
  }
  req.user = { id: payload.sub, role: payload.role };
  next();
});

/**
 * RBAC guard. Use after `authenticate`.
 * @param {...string} roles allowed roles
 */
export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    return next();
  };
