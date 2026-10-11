import request from 'supertest';
import { createApp } from '../../src/app.js';

const build = (checks) => createApp({ readinessChecks: checks });

describe('app bootstrap', () => {
  it('GET /health is always up and sets a request id', async () => {
    const res = await request(build({})).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: 'up' } });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('echoes a well-formed inbound request id', async () => {
    const res = await request(build({})).get('/health').set('X-Request-Id', 'abc-12345678');
    expect(res.headers['x-request-id']).toBe('abc-12345678');
  });

  it('GET /ready is 200 when all checks pass and 503 when one fails', async () => {
    const ok = await request(build({ mongo: () => true, redis: async () => true })).get('/ready');
    expect(ok.status).toBe(200);
    const bad = await request(
      build({
        mongo: () => true,
        redis: async () => {
          throw new Error('down');
        },
      }),
    ).get('/ready');
    expect(bad.status).toBe(503);
    expect(bad.body.data.checks).toEqual({ mongo: true, redis: false });
  });

  it('GET /ready is 503 while shutting down', async () => {
    const app = build({ mongo: () => true });
    app.locals.state.shuttingDown = true;
    expect((await request(app).get('/ready')).status).toBe(503);
  });

  it('unknown routes return the standard 404 envelope', async () => {
    const res = await request(build({})).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(res.body.requestId).toBeTruthy();
  });

  it('malformed JSON returns 400 and oversized bodies 413', async () => {
    const app = build({});
    const bad = await request(app)
      .post('/api/v1/x')
      .set('Content-Type', 'application/json')
      .send('{oops');
    expect(bad.status).toBe(400);
    const big = await request(app)
      .post('/api/v1/x')
      .send({ a: 'x'.repeat(200_000) });
    expect(big.status).toBe(413);
  });

  it('applies security headers and a CORS allowlist', async () => {
    const app = build({});
    const ok = await request(app).get('/api/docs.json').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
    expect(ok.headers['x-powered-by']).toBeUndefined();
    const evil = await request(app).get('/api/docs.json').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('serves the OpenAPI document', async () => {
    const res = await request(build({})).get('/api/docs.json');
    expect(res.body.openapi).toBe('3.0.3');
  });
});
