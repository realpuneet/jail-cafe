/**
 * Wraps an async route handler so rejected promises reach the global error handler.
 * @param {(req, res, next) => Promise<unknown>} fn
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
