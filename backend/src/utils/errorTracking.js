import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Error-tracking hook. Sentry-ready without forcing the dependency: when SENTRY_DSN is set we load
 * `@sentry/node` lazily (npm i @sentry/node). Any other tracker can be plugged in with setErrorReporter.
 */
let reporter = null;

export const setErrorReporter = (fn) => {
  reporter = fn;
};

/** Initialise the configured tracker (call once at boot). */
export async function initErrorTracking() {
  if (!env.SENTRY_DSN) return false;
  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0.05 });
    setErrorReporter((err, ctx) => Sentry.captureException(err, { extra: ctx }));
    logger.info('error tracking enabled (Sentry)');
    return true;
  } catch {
    logger.warn(
      'SENTRY_DSN is set but @sentry/node is not installed; run `npm i @sentry/node` to enable it',
    );
    return false;
  }
}

/**
 * Report an unexpected error. Never throws.
 * @param {unknown} err
 * @param {Record<string, unknown>} [context] request id etc. (no secrets)
 */
export function captureException(err, context = {}) {
  try {
    reporter?.(err, context);
  } catch (e) {
    logger.error({ err: e.message }, 'error reporter failed');
  }
}
