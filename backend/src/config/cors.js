import { env } from './env.js';

/**
 * Strict allowlist CORS. Requests with no Origin header (curl, server-to-server, webhooks)
 * are allowed through; browsers always send Origin so they are checked.
 */
export const corsOptions = {
  origin(origin, cb) {
    if (!origin || env.CLIENT_URLS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
  exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
  maxAge: 600,
};
