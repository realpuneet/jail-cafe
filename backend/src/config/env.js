import 'dotenv/config';
import { z } from 'zod';

const csv = z
  .string()
  .min(1)
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  );

const optional = z.string().default('');

export const envSchema = z
  .object({
    // App
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    API_PREFIX: z
      .string()
      .regex(/^\/[a-z0-9/_-]*$/i, 'must start with "/"')
      .default('/api/v1'),
    CLIENT_URLS: csv,
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),
    LOG_LEVEL: z
      .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
      .default('info'),
    BODY_LIMIT: z.string().default('100kb'),
    SENTRY_DSN: optional,
    // Bearer token that unlocks GET /metrics (Prometheus). Empty = endpoint disabled (404).
    METRICS_TOKEN: z
      .string()
      .refine((v) => v === '' || v.length >= 16, 'must be empty or at least 16 characters')
      .default(''),
    // Run BullMQ workers inside the API process (set false to run them via `npm run worker`)
    RUN_WORKERS: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    // MongoDB
    MONGO_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://'),
    MONGO_DB_NAME: z.string().min(1).default('jailkichai'),
    MONGO_MAX_POOL_SIZE: z.coerce.number().int().min(1).default(50),
    MONGO_READ_PREFERENCE: z
      .enum(['primary', 'primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'])
      .default('primary'),

    // Redis
    REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must start with redis:// or rediss://'),
    REDIS_KEY_PREFIX: z.string().min(1).default('jkc:'),

    // Auth
    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_ACCESS_EXPIRES: z.string().default('15m'),
    JWT_REFRESH_EXPIRES: z.string().default('30d'),
    COOKIE_DOMAIN: optional,
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    OTP_EXPIRES_SECONDS: z.coerce.number().int().min(30).default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),

    // ImageKit (required once uploads are used - enforced in production below)
    IMAGEKIT_PUBLIC_KEY: optional,
    IMAGEKIT_PRIVATE_KEY: optional,
    IMAGEKIT_URL_ENDPOINT: optional,
    IMAGEKIT_FOLDER: z.string().default('/jailkichai'),

    // Razorpay
    RAZORPAY_KEY_ID: optional,
    RAZORPAY_KEY_SECRET: optional,
    RAZORPAY_WEBHOOK_SECRET: optional,

    // Notifications
    WHATSAPP_API_URL: optional,
    WHATSAPP_API_TOKEN: optional,
    SMS_API_KEY: optional,
    SMS_TEMPLATE_ID: optional,
    SMTP_HOST: optional,
    SMTP_PORT: optional,
    SMTP_USER: optional,
    SMTP_PASS: optional,
    MAIL_FROM: optional,

    // Rate limit
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),

    // Seed (used only by `npm run seed`)
    SEED_ADMIN_EMAIL: z.string().default('admin@jailkichai.local'),
    SEED_ADMIN_PASSWORD: optional,

    // Cafe
    CAFE_NAME: z.string().default('Jail Ki Chai'),
    DEFAULT_DELIVERY_RADIUS_KM: z.coerce.number().positive().default(7),
    CAFE_LAT: z.coerce.number().min(-90).max(90).optional(),
    CAFE_LNG: z.coerce.number().min(-180).max(180).optional(),
    PARTY_MAX_PER_DAY: z.coerce.number().int().min(1).default(2),
    MIN_ORDER_AMOUNT: z.coerce.number().min(0).default(100),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.JWT_ACCESS_SECRET === cfg.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'must differ from JWT_ACCESS_SECRET',
      });
    }
    if (cfg.NODE_ENV === 'production') {
      for (const url of cfg.CLIENT_URLS) {
        if (!url.startsWith('https://')) {
          ctx.addIssue({
            code: 'custom',
            path: ['CLIENT_URLS'],
            message: `production origins must use https (got ${url})`,
          });
        }
      }
    }
  });

/**
 * Parse and validate an environment object. Throws a readable Error listing every problem.
 * @param {Record<string, string | undefined>} source
 */
export function parseEnv(source) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return Object.freeze({
    ...result.data,
    isProd: result.data.NODE_ENV === 'production',
    isTest: result.data.NODE_ENV === 'test',
  });
}

let parsed;
try {
  parsed = parseEnv(process.env);
} catch (err) {
  // Fail fast with a clear message; intentionally not using the logger (it depends on env).
  process.stderr.write(`\n${err.message}\n\nSee backend/.env.example and docs/environment.md\n\n`);
  process.exit(1);
}

export const env = parsed;
