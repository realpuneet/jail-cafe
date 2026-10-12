import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { corsOptions } from './config/cors.js';
import { swaggerSpec } from './config/swagger.js';
import { isDbReady } from './config/db.js';
import { isRedisReady } from './config/redis.js';
import { timingSafeEqual } from 'node:crypto';
import { metricsMiddleware, registry } from './utils/metrics.js';
import { requestId } from './middlewares/requestId.js';
import { httpLogger } from './middlewares/httpLogger.js';
import { globalLimiter } from './middlewares/rateLimiter.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { healthRoutes } from './routes/health.routes.js';
import { apiRouter } from './routes/index.js';
import { webhookHandler } from './routes/order.routes.js';

const defaultChecks = { mongo: isDbReady, redis: isRedisReady };

/**
 * Build the Express app (no listen). Dependencies are injectable for tests.
 * @param {{readinessChecks?: Record<string, () => Promise<boolean>|boolean>}} [deps]
 */
export function createApp({ readinessChecks = defaultChecks } = {}) {
  const app = express();
  /** Mutable runtime state shared with probes; server.js flips shuttingDown on SIGTERM. */
  app.locals.state = { shuttingDown: false };

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.set('etag', 'strong');

  app.use(requestId);
  app.use(httpLogger);
  // Probes are mounted before rate limiting / CORS so orchestrators are never throttled.
  app.use(healthRoutes({ readinessChecks, state: app.locals.state }));
  app.use(metricsMiddleware);
  if (env.METRICS_TOKEN) {
    // Prometheus scrape endpoint, only mounted when a token is configured. Not rate limited.
    app.get('/metrics', async (req, res) => {
      const given = Buffer.from(String(req.headers.authorization ?? ''));
      const want = Buffer.from(`Bearer ${env.METRICS_TOKEN}`);
      if (given.length !== want.length || !timingSafeEqual(given, want))
        return res.status(401).end();
      res.set('Content-Type', registry.contentType);
      return res.send(await registry.metrics());
    });
  }

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(compression());
  app.use(globalLimiter());
  // Razorpay webhook needs the exact raw bytes for signature verification, so it is mounted
  // before the JSON parser (express.json skips bodies that are already parsed).
  app.post(
    `${env.API_PREFIX}/payments/razorpay/webhook`,
    express.raw({ type: '*/*', limit: '256kb' }),
    webhookHandler,
  );
  app.use(express.json({ limit: env.BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: env.BODY_LIMIT }));
  app.use(cookieParser());
  app.use(mongoSanitize());
  app.use(hpp());

  app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.use(env.API_PREFIX, apiRouter());

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
