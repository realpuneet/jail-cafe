import request from 'supertest';
import { createApp } from '../../src/app.js';
import { setRedisClient } from '../../src/config/redis.js';
import { countEvent } from '../../src/utils/metrics.js';
import { FakeRedis } from '../helpers/fakeRedis.js';
import { startDb, stopDb } from '../helpers/db.js';

const TOKEN = process.env.METRICS_TOKEN;
let app;
beforeAll(async () => {
  await startDb();
  setRedisClient(new FakeRedis());
  app = createApp({ readinessChecks: {} });
});
afterAll(stopDb);

describe('GET /metrics', () => {
  it('requires the bearer token', async () => {
    await request(app).get('/metrics').expect(401);
    await request(app)
      .get('/metrics')
      .set('Authorization', 'Bearer wrong-token-wrong-token')
      .expect(401);
    await request(app).get('/metrics').set('Authorization', `Basic ${TOKEN}`).expect(401);
  });

  it('exposes Prometheus text with route-pattern labels (low cardinality) and domain counters', async () => {
    await request(app).get('/api/v1/menu-items/some-dish-slug-1');
    await request(app).get('/api/v1/menu-items/some-dish-slug-2');
    await request(app).get('/no/such/path');
    countEvent('order_placed');
    const res = await request(app)
      .get('/metrics')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/# TYPE http_request_duration_seconds histogram/);
    expect(res.text).toMatch(/route="\/api\/v1\/menu-items\/:idOrSlug"/);
    expect(res.text).not.toMatch(/some-dish-slug/); // raw URLs never become label values
    expect(res.text).toMatch(/route="unmatched"/);
    expect(res.text).toMatch(/business_events_total\{event="order_placed"/);
    expect(res.text).toMatch(/process_cpu_user_seconds_total/);
  });
});
