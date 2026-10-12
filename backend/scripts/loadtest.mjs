#!/usr/bin/env node
/**
 * Read-path load test (autocannon). Usage: node scripts/loadtest.mjs [baseUrl] [seconds] [connections]
 * Targets the public, cacheable endpoints that dominate real traffic. Run against a seeded stack.
 */
import autocannon from 'autocannon';

const [base = 'http://localhost:5000', seconds = '10', connections = '100'] = process.argv.slice(2);

const targets = [
  { name: 'health', path: '/health' },
  { name: 'menu list', path: '/api/v1/menu-items?limit=20' },
  { name: 'categories', path: '/api/v1/categories' },
  { name: 'banners', path: '/api/v1/banners' },
  { name: 'booking slots', path: `/api/v1/booking-slots/availability?date=${new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10)}&guests=2` },
];

const rows = [];
for (const t of targets) {
  const r = await autocannon({
    url: `${base}${t.path}`,
    duration: Number(seconds),
    connections: Number(connections),
    pipelining: 1,
  });
  rows.push({
    endpoint: t.name,
    'req/s': Math.round(r.requests.average),
    'p50 ms': r.latency.p50,
    'p97.5 ms': r.latency.p97_5,
    'p99 ms': r.latency.p99,
    'max ms': r.latency.max,
    'non-2xx': r.non2xx,
    errors: r.errors,
    timeouts: r.timeouts,
  });
}
console.table(rows);
