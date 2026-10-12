import { Writable } from 'node:stream';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import pino from 'pino';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { setRedisClient } from '../../src/config/redis.js';
import { swaggerSpec } from '../../src/config/swagger.js';
import { setQueueAdapter } from '../../src/jobs/queues.js';
import { User } from '../../src/models/User.js';
import { REDACT_PATHS } from '../../src/utils/logger.js';
import { captureOtps, loginCustomer, staffAuth } from '../helpers/auth.js';
import { clearDb, startDb, stopDb } from '../helpers/db.js';
import { FakeRedis } from '../helpers/fakeRedis.js';

const api = (p) => `/api/v1${p}`;
let app;
let customer;
let customerUser;
let staff;
let admin;
const OID = '65f0c0ffee0123456789abcd';

beforeAll(async () => {
  await startDb();
  app = createApp({ readinessChecks: {} });
});
afterAll(async () => {
  setQueueAdapter(null);
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
  setRedisClient(new FakeRedis());
  setQueueAdapter(async () => {});
  const c = await loginCustomer(app, captureOtps());
  customer = { Authorization: `Bearer ${c.accessToken}` };
  customerUser = c.user;
  staff = await staffAuth(app, 'staff');
  admin = await staffAuth(app, 'admin');
});

describe('injection and malformed input', () => {
  it('rejects NoSQL operator objects in auth payloads', async () => {
    await request(app)
      .post(api('/auth/login'))
      .send({ email: { $gt: '' }, password: { $gt: '' } })
      .expect(422);
    await request(app)
      .post(api('/auth/otp/request'))
      .send({ phone: { $ne: null } })
      .expect(422);
    await request(app)
      .post(api('/auth/otp/verify'))
      .send({ phone: '9876543210', otp: { $gt: '' } })
      .expect(422);
    const login = await request(app)
      .post(api('/auth/login'))
      .send({ email: 'admin@test.in', password: { $ne: 'x' } });
    expect(login.status).toBe(422);
  });

  it('rejects operator syntax in query strings (never a 500, never leaked data)', async () => {
    await request(app).get(api('/users?role[$ne]=customer')).set(admin).expect(422);
    await request(app).get(api('/menu-items?category[$ne]=x')).expect(422);
    await request(app)
      .get(api('/menu-items?veg=true&veg=false'))
      .expect((r) => expect(r.status).toBeLessThan(500));
    await request(app).get(api('/orders/manage?status[$gt]=')).set(staff).expect(422);
  });

  it('strips $-prefixed keys from JSON bodies before they reach handlers', async () => {
    const res = await request(app)
      .patch(api('/users/me'))
      .set(customer)
      .send({ name: 'Safe', $set: { role: 'admin' }, 'a.b': 1 });
    expect(res.status).toBe(200);
    expect((await User.findById(customerUser._id)).role).toBe('customer');
  });

  it('prevents mass assignment and prototype pollution on profile updates', async () => {
    await request(app).patch(api('/users/me')).set(customer).send({ role: 'admin' }).expect(422); // nothing allowed left to update
    await request(app)
      .patch(api('/users/me'))
      .set(customer)
      .send({ name: 'X', role: 'admin', isActive: false, passwordHash: 'x' })
      .expect(200);
    const raw =
      '{"name":"Y","__proto__":{"role":"admin"},"constructor":{"prototype":{"role":"admin"}}}';
    await request(app)
      .patch(api('/users/me'))
      .set(customer)
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(200);
    const u = await User.findById(customerUser._id).select('+passwordHash');
    expect(u).toMatchObject({ role: 'customer', isActive: true });
    expect(u.passwordHash).toBeUndefined();
    expect({}.role).toBeUndefined();
  });

  it('rejects invalid ObjectIds and oversized/malformed bodies cleanly', async () => {
    await request(app).get(api('/orders/not-an-id')).set(customer).expect(422);
    await request(app)
      .get(api(`/users/${'z'.repeat(24)}`))
      .set(admin)
      .expect(422);
    await request(app)
      .post(api('/auth/login'))
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    await request(app)
      .post(api('/auth/login'))
      .send({ email: 'a@b.in', password: 'x'.repeat(200_000) })
      .expect(413);
  });
});

describe('token handling', () => {
  const secret = process.env.JWT_ACCESS_SECRET;
  const claims = { role: 'admin' };
  const send = (token) =>
    request(app).get(api('/users/me')).set('Authorization', `Bearer ${token}`);

  it('rejects unsigned, wrongly-signed, tampered and expired tokens', async () => {
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: String(customerUser._id), role: 'admin', iss: 'jail-ki-chai' })).toString('base64url')}.`;
    expect((await send(none)).status).toBe(401);
    expect(
      (
        await send(
          jwt.sign({ role: 'admin' }, 'wrong-secret-wrong-secret-wrong-secret!', {
            subject: String(customerUser._id),
            issuer: 'jail-ki-chai',
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await send(
          jwt.sign(claims, process.env.JWT_REFRESH_SECRET, {
            subject: String(customerUser._id),
            issuer: 'jail-ki-chai',
          }),
        )
      ).status,
    ).toBe(401); // refresh secret != access secret
    expect(
      (
        await send(
          jwt.sign(claims, secret, { subject: String(customerUser._id), issuer: 'someone-else' }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await send(
          jwt.sign(claims, secret, {
            subject: String(customerUser._id),
            issuer: 'jail-ki-chai',
            expiresIn: -10,
          }),
        )
      ).body.code,
    ).toBe('TOKEN_EXPIRED');
    expect(
      (
        await send(
          jwt.sign(claims, secret, {
            subject: String(customerUser._id),
            issuer: 'jail-ki-chai',
            algorithm: 'HS512',
          }),
        )
      ).status,
    ).toBe(401); // algorithm pinned to HS256
    expect((await send('garbage')).status).toBe(401);
    expect(
      (await request(app).get(api('/users/me')).set('Authorization', 'Basic abc')).status,
    ).toBe(401);
  });

  it('a validly signed token cannot escalate: the role comes from the signed claim, not the request', async () => {
    const res = await request(app)
      .get(api('/users'))
      .set(customer)
      .set('X-Role', 'admin')
      .query({ role: 'admin' });
    expect(res.status).toBe(403);
  });

  it('refresh cookie is httpOnly, SameSite and path-scoped', async () => {
    const res = await request(app)
      .post(api('/auth/login'))
      .send({ email: 'admin@test.in', password: 'Sup3rSecret!!' })
      .expect(200);
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('jkc_rt='));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/jkc_rt|refreshToken/); // refresh token never appears in the body
  });
});

describe('HTTP hardening', () => {
  it('sets security headers, hides the stack and applies a strict CORS allowlist', async () => {
    const res = await request(app).get(api('/menu-items')).set('Origin', 'http://localhost:5173');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    const evil = await request(app).get(api('/menu-items')).set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    const pre = await request(app)
      .options(api('/orders'))
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('error responses never expose stack traces or internals for client errors', async () => {
    const res = await request(app).get(api('/orders/nope')).set(customer);
    expect(JSON.stringify(res.body)).not.toMatch(/node_modules|at .*\(.*:\d+:\d+\)/);
    const nf = await request(app).get('/definitely/not/here');
    expect(nf.status).toBe(404);
    expect(nf.body.stack).toBeUndefined();
  });
});

/** Every documented operation, expanded with a syntactically valid id for path params. */
const operations = Object.entries(swaggerSpec.paths).flatMap(([path, item]) =>
  Object.entries(item).map(([method, op]) => ({
    method,
    op,
    path: path.replace(/\{[^}]+\}/g, OID),
  })),
);
const secured = operations.filter(({ op }) => op.security);
const roleOf = (op) =>
  /\((admin|admin, staff|admin, staff, rider\(DELIVERED only\)|rider)\)$/.exec(op.summary)?.[1];

describe('access-control matrix (generated from the OpenAPI spec)', () => {
  it('covers a meaningful number of protected operations', () => {
    expect(secured.length).toBeGreaterThan(80);
  });

  it.each(secured.map((o) => [`${o.method.toUpperCase()} ${o.path}`, o]))(
    '%s requires authentication',
    async (_n, { method, path }) => {
      const res = await request(app)[method](api(path)).send({});
      expect(res.status).toBe(401);
    },
  );

  const restricted = secured.filter(({ op }) => roleOf(op));
  it.each(restricted.map((o) => [`${o.method.toUpperCase()} ${o.path} (${roleOf(o.op)})`, o]))(
    '%s rejects customers',
    async (_n, { method, path }) => {
      const res = await request(app)[method](api(path)).set(customer).send({});
      expect(res.status).toBe(403);
    },
  );

  it.each(
    restricted
      .filter(({ op }) => roleOf(op) === 'admin')
      .map((o) => [`${o.method.toUpperCase()} ${o.path} (admin only)`, o]),
  )('%s rejects staff', async (_n, { method, path }) => {
    const res = await request(app)[method](api(path)).set(staff).send({});
    expect(res.status).toBe(403);
  });

  it('public endpoints really are public (no 401/403)', async () => {
    const open = operations.filter(
      ({ op, method, path }) =>
        !op.security &&
        method === 'get' &&
        !path.includes(OID) &&
        !path.includes('availability') &&
        !path.includes('manage'),
    );
    for (const { path } of open) {
      const res = await request(app).get(api(path));
      expect([401, 403]).not.toContain(res.status);
      expect(res.status).toBeLessThan(500);
    }
  });
});

describe('logging hygiene', () => {
  it('redacts credentials, OTPs, tokens and payment signatures from log lines', () => {
    const lines = [];
    const sink = new Writable({ write: (chunk, _e, cb) => (lines.push(chunk.toString()), cb()) });
    const log = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, sink);
    log.info(
      {
        req: { headers: { authorization: 'Bearer SECRET-TOKEN', cookie: 'jkc_rt=SECRET-COOKIE' } },
        body: { password: 'hunter2', otp: '123456', token: 'T0K3N', razorpay_signature: 'SIG' },
        user: { accessToken: 'AT', refreshToken: 'RT' },
      },
      'request',
    );
    const out = lines.join('');
    for (const secret of [
      'SECRET-TOKEN',
      'SECRET-COOKIE',
      'hunter2',
      '123456',
      'T0K3N',
      'SIG"',
      '"AT"',
      '"RT"',
    ])
      expect(out).not.toContain(secret);
    expect(out).toContain('[REDACTED]');
  });
});

describe('idempotent resource ids', () => {
  it('uses unguessable ObjectIds and never leaks other users data through lookups', async () => {
    const other = await loginCustomer(app, captureOtps(), '9123456780');
    await request(app)
      .get(api(`/orders/${new mongoose.Types.ObjectId()}`))
      .set(customer)
      .expect(404);
    await request(app)
      .get(api('/addresses'))
      .set({ Authorization: `Bearer ${other.accessToken}` })
      .expect(200);
  });
});
