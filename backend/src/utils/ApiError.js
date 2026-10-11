import { ERROR_CODES, HTTP_STATUS } from './constants.js';

/**
 * Operational error carrying an HTTP status and a stable machine-readable code.
 * Anything that is not an ApiError is treated as a programmer error (500) by the error handler.
 */
export class ApiError extends Error {
  /**
   * @param {number} statusCode HTTP status
   * @param {string} message human readable message (safe to show to clients)
   * @param {{code?: string, details?: unknown}} [options]
   */
  constructor(statusCode, message, { code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code ?? ERROR_CODES.INTERNAL;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details) {
    return new ApiError(HTTP_STATUS.BAD_REQUEST, message, {
      code: ERROR_CODES.BAD_REQUEST,
      details,
    });
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(HTTP_STATUS.UNAUTHORIZED, message, { code: ERROR_CODES.UNAUTHORIZED });
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(HTTP_STATUS.FORBIDDEN, message, { code: ERROR_CODES.FORBIDDEN });
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(HTTP_STATUS.NOT_FOUND, message, { code: ERROR_CODES.NOT_FOUND });
  }
  static conflict(message = 'Conflict', details) {
    return new ApiError(HTTP_STATUS.CONFLICT, message, { code: ERROR_CODES.CONFLICT, details });
  }
  static validation(message = 'Validation failed', details) {
    return new ApiError(HTTP_STATUS.UNPROCESSABLE, message, {
      code: ERROR_CODES.VALIDATION_ERROR,
      details,
    });
  }
  static tooMany(message = 'Too many requests, please try again later') {
    return new ApiError(HTTP_STATUS.TOO_MANY_REQUESTS, message, { code: ERROR_CODES.RATE_LIMITED });
  }
}
