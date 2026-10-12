import request from 'supertest';
import { createApp } from '../../src/app.js';
import { setRedisClient } from '../../src/config/redis.js';
import { RefreshToken } from '../../src/models/RefreshToken.js';
import { User } from '../../src/models/User.js';
import { captureOtps, cookieOf, createStaffUser, loginCustomer } from '../helpers/auth.js';
import { clearDb, startDb, stopDb } from '../helpers/db.js';
import { FakeRedis } from '../helpers/fakeRedis.js';

let app;
let redis;
let codes;
const api = (p) => `/api/v1${p}`;

beforeAll(async () => {
  await startDb();
  app = createApp({ readinessChecks: {} });
});
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  redis = new FakeRedis();
  setRedisClient(redis);
  codes = captureOtps();
});

describe('OTP login', () => {
  it('creates a customer on first login, sets an httpOnly refresh cookie and returns an access token', async () => {
    await request(app).post(api('/auth/otp/request')).send({ phone: '98765 43210' }).expect(200);
    const res = await request(app)
      .post(api('/auth/otp/verify'))
      .send({ phone: '9876543210', otp: codes.get('+919876543210'), name: 'Puneet' })
      .expect(200);
    expect(res.body.data.user).toMatchObject({
      phone: '+919876543210',
      role: 'customer',
      name: 'Puneet',
    });
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(res.headers['set-cookie'][0]).toMatch(/Path=\/api\/v1\/auth/);
    expect(await User.countDocuments()).toBe(1);
  });

  it('rejects a wrong OTP and an invalid phone', async () => {
    await request(app).post(api('/auth/otp/request')).send({ phone: '9876543210' }).expect(200);
    await request(app)
      .post(api('/auth/otp/verify'))
      .send({ phone: '9876543210', otp: '000000' })
      .expect((r) => {
        if (![400, 401].includes(r.status)) throw new Error(`status ${r.status}`);
      });
    await request(app).post(api('/auth/otp/request')).send({ phone: '123' }).expect(422);
  });

  it('refuses login for a disabled account', async () => {
    const { user } = await loginCustomer(app, codes, '9876543210', redis);
    await User.updateOne({ _id: user._id }, { isActive: false });
    await request(app).post(api('/auth/otp/request')).send({ phone: '9876543210' }).expect(429); // cooldown
    await redis.del('jkc:otp:cool:+919876543210');
    await request(app).post(api('/auth/otp/request')).send({ phone: '9876543210' }).expect(200);
    await request(app)
      .post(api('/auth/otp/verify'))
      .send({ phone: '9876543210', otp: codes.get('+919876543210') })
      .expect(403);
  });
});

describe('refresh token rotation', () => {
  it('rotates on refresh and revokes the family when an old token is replayed', async () => {
    const { cookie: first } = await loginCustomer(app, codes);
    const r1 = await request(app).post(api('/auth/refresh')).set('Cookie', first).expect(200);
    const second = cookieOf(r1);
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    // the client restores its session from this response after a page reload
    expect(r1.body.data.user).toMatchObject({
      phone: '+919876543210',
      name: 'Test User',
      role: 'customer',
    });
    expect(r1.body.data.user.passwordHash).toBeUndefined();
    expect(r1.body.data.accessToken).toBeTruthy();

    // Replay after the grace window => theft suspected => whole family revoked.
    await RefreshToken.updateMany(
      { revokedAt: { $exists: true } },
      { revokedAt: new Date(Date.now() - 60_000) },
    );
    await request(app).post(api('/auth/refresh')).set('Cookie', first).expect(401);
    await request(app).post(api('/auth/refresh')).set('Cookie', second).expect(401);
    expect(await RefreshToken.countDocuments({ revokedAt: { $exists: false } })).toBe(0);
  });

  it('only one of two concurrent refreshes with the same token succeeds', async () => {
    const { cookie } = await loginCustomer(app, codes);
    const results = await Promise.all([
      request(app).post(api('/auth/refresh')).set('Cookie', cookie),
      request(app).post(api('/auth/refresh')).set('Cookie', cookie),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('rejects a missing or forged refresh token', async () => {
    await request(app).post(api('/auth/refresh')).expect(401);
    await request(app).post(api('/auth/refresh')).set('Cookie', 'jkc_rt=garbage').expect(401);
  });

  it('logout revokes the session', async () => {
    const { cookie } = await loginCustomer(app, codes);
    await request(app).post(api('/auth/logout')).set('Cookie', cookie).expect(200);
    await request(app).post(api('/auth/refresh')).set('Cookie', cookie).expect(401);
  });
});

describe('password login (staff)', () => {
  it('logs in admin, rejects bad password, and locks after repeated failures', async () => {
    await createStaffUser();
    const ok = await request(app)
      .post(api('/auth/login'))
      .send({ email: 'ADMIN@test.in', password: 'Sup3rSecret!!' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.role).toBe('admin');
    expect(ok.body.data.user.passwordHash).toBeUndefined();

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post(api('/auth/login'))
        .send({ email: 'admin@test.in', password: 'wrong' })
        .expect(401);
    }
    await request(app)
      .post(api('/auth/login'))
      .send({ email: 'admin@test.in', password: 'Sup3rSecret!!' })
      .expect(429);
  });

  it('does not let customers use password login', async () => {
    await request(app)
      .post(api('/auth/login'))
      .send({ email: 'nobody@test.in', password: 'x' })
      .expect(401);
  });
});

describe('RBAC and user management', () => {
  it('requires a token and blocks customers from admin endpoints', async () => {
    await request(app).get(api('/users/me')).expect(401);
    const { accessToken } = await loginCustomer(app, codes);
    await request(app)
      .get(api('/users/me'))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app).get(api('/users')).set('Authorization', `Bearer ${accessToken}`).expect(403);
  });

  it('admin lists users with cursor pagination and can create staff', async () => {
    await createStaffUser();
    const login = await request(app)
      .post(api('/auth/login'))
      .send({ email: 'admin@test.in', password: 'Sup3rSecret!!' });
    const auth = { Authorization: `Bearer ${login.body.data.accessToken}` };
    for (let i = 0; i < 3; i++) {
      await User.create({ phone: `+91900000010${i}`, name: `C${i}` });
    }
    const page1 = await request(app).get(api('/users?limit=2')).set(auth).expect(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta.hasMore).toBe(true);
    const page2 = await request(app)
      .get(api(`/users?limit=2&cursor=${page1.body.meta.nextCursor}`))
      .set(auth)
      .expect(200);
    expect(page2.body.data).toHaveLength(2);
    const ids = [...page1.body.data, ...page2.body.data].map((u) => u._id);
    expect(new Set(ids).size).toBe(4);

    const created = await request(app)
      .post(api('/users'))
      .set(auth)
      .send({
        name: 'Rider R',
        phone: '9111111111',
        email: 'rider@test.in',
        password: 'AnotherSecret1!',
        role: 'rider',
      })
      .expect(201);
    expect(created.body.data.role).toBe('rider');
    await request(app)
      .post(api('/users'))
      .set(auth)
      .send({
        name: 'Dup',
        phone: '9111111111',
        email: 'dup@test.in',
        password: 'AnotherSecret1!',
        role: 'staff',
      })
      .expect(409);
  });

  it('deactivating a user blocks their live access token and revokes refresh tokens', async () => {
    const admin = await createStaffUser();
    const login = await request(app)
      .post(api('/auth/login'))
      .send({ email: 'admin@test.in', password: 'Sup3rSecret!!' });
    const auth = { Authorization: `Bearer ${login.body.data.accessToken}` };
    const { accessToken, cookie, user } = await loginCustomer(app, codes);

    await request(app)
      .patch(api(`/users/${user._id}/status`))
      .set(auth)
      .send({ isActive: false })
      .expect(200);
    await request(app)
      .get(api('/users/me'))
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    await request(app).post(api('/auth/refresh')).set('Cookie', cookie).expect(401);
    await request(app)
      .patch(api(`/users/${admin._id}/status`))
      .set(auth)
      .send({ isActive: false })
      .expect(400);
  });
});
