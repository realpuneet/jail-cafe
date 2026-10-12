import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

/** Prometheus metrics. One registry per process; scrape each instance (cluster workers expose their own). */
export const registry = new Registry();
registry.setDefaultLabels({ service: 'jkc-api' });
collectDefaultMetrics({ register: registry });

export const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency by route pattern',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const businessEvents = new Counter({
  name: 'business_events_total',
  help: 'Domain events (orders placed, payments captured, bookings created, ...)',
  labelNames: ['event'],
  registers: [registry],
});

export const jobsProcessed = new Counter({
  name: 'jobs_processed_total',
  help: 'Background jobs finished, by queue and outcome',
  labelNames: ['queue', 'outcome'],
  registers: [registry],
});

/** Record a domain event. Safe to call anywhere. @param {string} event */
export const countEvent = (event) => businessEvents.inc({ event });

/** Express middleware: observe latency using the matched route pattern (low cardinality). */
export function metricsMiddleware(req, res, next) {
  const end = httpDuration.startTimer();
  let route = 'unmatched';
  // Express resets req.baseUrl and req.route once routers unwind (and error handlers run with
  // an empty baseUrl), so record the full pattern at the instant a route matches.
  let current;
  Object.defineProperty(req, 'route', {
    configurable: true,
    get: () => current,
    set(value) {
      current = value;
      if (value) route = `${req.baseUrl}${value.path}`;
    },
  });
  res.on('finish', () => end({ method: req.method, route, status: String(res.statusCode) }));
  next();
}
