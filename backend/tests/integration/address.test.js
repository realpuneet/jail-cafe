import request from 'supertest';
import { createApp } from '../../src/app.js';
import { setRedisClient } from '../../src/config/redis.js';
import { captureOtps, loginCustomer } from '../helpers/auth.js';
import { clearDb, startDb, stopDb } from '../helpers/db.js';
import { FakeRedis } from '../helpers/fakeRedis.js';

let app;
let redis;
let codes;
const api = (p) => `/api/v1${p}`;
const addr = (over = {}) => ({
  name: 'Puneet',
  phone: '9876543210',
  line1: '12 MG Road',
  city: 'Indore',
  state: 'MP',
  pincode: '452001',
  ...over,
});

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

describe('addresses', () => {
  it('first address becomes default; switching default keeps exactly one', async () => {
    const { accessToken } = await loginCustomer(app, codes);
    const auth = { Authorization: `Bearer ${accessToken}` };
    const a = await request(app).post(api('/addresses')).set(auth).send(addr()).expect(201);
    expect(a.body.data.isDefault).toBe(true);
    const b = await request(app)
      .post(api('/addresses'))
      .set(auth)
      .send(addr({ label: 'work', line1: '99 AB Road' }))
      .expect(201);
    expect(b.body.data.isDefault).toBe(false);

    await request(app)
      .put(api(`/addresses/${b.body.data._id}/default`))
      .set(auth)
      .expect(200);
    const list = await request(app).get(api('/addresses')).set(auth).expect(200);
    expect(list.body.data.filter((x) => x.isDefault)).toHaveLength(1);
    expect(list.body.data[0]._id).toBe(b.body.data._id); // default first
  });

  it('validates pincode and lat/lng pairing', async () => {
    const { accessToken } = await loginCustomer(app, codes);
    const auth = { Authorization: `Bearer ${accessToken}` };
    await request(app)
      .post(api('/addresses'))
      .set(auth)
      .send(addr({ pincode: '12' }))
      .expect(422);
    await request(app)
      .post(api('/addresses'))
      .set(auth)
      .send(addr({ lat: 22.7 }))
      .expect(422);
    const ok = await request(app)
      .post(api('/addresses'))
      .set(auth)
      .send(addr({ lat: 22.7, lng: 75.8 }))
      .expect(201);
    expect(ok.body.data.location.coordinates).toEqual([75.8, 22.7]);
  });

  it('isolates addresses between users', async () => {
    const u1 = await loginCustomer(app, codes, '9876543210', redis);
    const u2 = await loginCustomer(app, codes, '9123456789', redis);
    const a = await request(app)
      .post(api('/addresses'))
      .set('Authorization', `Bearer ${u1.accessToken}`)
      .send(addr())
      .expect(201);
    const other = { Authorization: `Bearer ${u2.accessToken}` };
    await request(app)
      .patch(api(`/addresses/${a.body.data._id}`))
      .set(other)
      .send({ city: 'Hack' })
      .expect(404);
    await request(app)
      .delete(api(`/addresses/${a.body.data._id}`))
      .set(other)
      .expect(404);
    expect((await request(app).get(api('/addresses')).set(other)).body.data).toHaveLength(0);
  });

  it('enforces the per-user limit and promotes a new default on delete', async () => {
    const { accessToken } = await loginCustomer(app, codes);
    const auth = { Authorization: `Bearer ${accessToken}` };
    const ids = [];
    for (let i = 0; i < 10; i++) {
      const r = await request(app)
        .post(api('/addresses'))
        .set(auth)
        .send(addr({ line1: `Line ${i + 100}` }))
        .expect(201);
      ids.push(r.body.data._id);
    }
    await request(app).post(api('/addresses')).set(auth).send(addr()).expect(400);
    await request(app)
      .delete(api(`/addresses/${ids[0]}`))
      .set(auth)
      .expect(200); // ids[0] was default
    const list = await request(app).get(api('/addresses')).set(auth);
    expect(list.body.data.filter((x) => x.isDefault)).toHaveLength(1);
  });
});
