import pino from 'pino';
import { env } from '../config/env.js';

/** Paths scrubbed from every log line. Never log secrets, tokens, OTPs or card/payment data. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.otp',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.razorpay_signature',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'jkc-api', env: env.NODE_ENV },
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } }
    : {}),
});
