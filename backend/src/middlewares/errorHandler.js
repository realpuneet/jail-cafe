import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants.js';
import { formatZodIssues } from './validate.js';

/**
 * Normalize any thrown value into an ApiError. Handles Zod, Mongoose, JWT, Razorpay and
 * body-parser errors; everything else becomes an opaque 500.
 * @param {unknown} err
 * @returns {ApiError}
 */
export function normalizeError(err) {
  if (err instanceof ApiError) return err;

  if (err instanceof ZodError) {
    return ApiError.validation('Validation failed', formatZodIssues(err.issues, 'body'));
  }

  switch (err?.name) {
    case 'ValidationError': // mongoose
      return ApiError.validation(
        'Validation failed',
        Object.values(err.errors ?? {}).map((e) => ({ path: e.path, message: e.message })),
      );
    case 'CastError':
      return ApiError.badRequest(`Invalid value for "${err.path}"`);
    case 'TokenExpiredError':
      return new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Token expired', {
        code: ERROR_CODES.TOKEN_EXPIRED,
      });
    case 'JsonWebTokenError':
    case 'NotBeforeError':
      return new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid token', {
        code: ERROR_CODES.TOKEN_INVALID,
      });
    default:
  }

  // Mongo duplicate key
  if (err?.code === 11000) {
    const fields = Object.keys(err.keyPattern ?? err.keyValue ?? {});
    return new ApiError(HTTP_STATUS.CONFLICT, 'Duplicate value', {
      code: ERROR_CODES.DUPLICATE_KEY,
      details: fields.map((f) => ({ path: f, message: `${f} already exists` })),
    });
  }

  // Razorpay SDK errors: { statusCode, error: { code, description } }
  if (err?.error?.description && typeof err.statusCode === 'number') {
    const status = err.statusCode >= 500 ? 502 : err.statusCode;
    return new ApiError(status, err.error.description, { code: ERROR_CODES.PAYMENT_ERROR });
  }

  // body-parser / http-errors
  if (err?.type === 'entity.too.large') {
    return new ApiError(HTTP_STATUS.PAYLOAD_TOO_LARGE, 'Request body too large', {
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
    });
  }
  if (err?.type === 'entity.parse.failed') return ApiError.badRequest('Malformed JSON body');

  return new ApiError(HTTP_STATUS.INTERNAL, 'Internal server error', {
    code: ERROR_CODES.INTERNAL,
  });
}

/** The single global error handler. Must be registered last. */
export const errorHandler = (err, req, res, _next) => {
  const apiError = normalizeError(err);
  const isServerError = apiError.statusCode >= 500;

  if (isServerError) {
    logger.error({ err, reqId: req.id }, 'unhandled error');
    // Sentry-ready hook: wire Sentry.captureException(err) here when SENTRY_DSN is set.
  }

  if (res.headersSent) return;
  res.status(apiError.statusCode).json({
    success: false,
    message: apiError.message,
    code: apiError.code,
    details: apiError.details,
    requestId: req.id,
    ...(!env.isProd && isServerError ? { stack: err?.stack } : {}),
  });
};
