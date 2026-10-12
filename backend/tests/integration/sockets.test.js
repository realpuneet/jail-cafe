import http from 'node:http';
import { io as connect } from 'socket.io-client';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { setRedisClient } from '../../src/config/redis.js';
import { setQueueAdapter } from '../../src/jobs/queues.js';
import { User } from '../../src/models/User.js';
import { initSockets } from '../../src/sockets/index.js';
import { captureOtps, createStaffUser, loginCustomer } from '../helpers/auth.js';
import { clearDb, startDb, stopDb } from '../helpers/db.js';
import { FakeRedis } from '../helpers/fakeRedis.js';
import { makeAddress, seedCatalog } from '../helpers/fixtures.js';

const api = (p) => `/api/v1${p}`;
let server;
let sockets;
let url;
let app;
let cat;
const clients = [];

const open = (token) =>
  new Promise((resolve, reject) => {
    const c = connect(url, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    clients.push(c);
    c.on('connect', () => resolve(c));
    c.on('connect_error', reject);
  });
const emitAck = (c, event, payload) => new Promise((resolve) => c.emit(event, payload, resolve));
const nextEvent = (c, event, ms = 2000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    c.once(event, (p) => {
      clearTimeout(t);
      resolve(p);
    });
  });

beforeAll(async () => {
  await startDb();
  app = createApp({ readinessChecks: {} });
  server = http.createServer(app);
  sockets = initSockets(server);
  await new Promise((r) => server.listen(0, r));
  url = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  clients.forEach((c) => c.close());
  await sockets.close();
  await new Promise((r) => server.close(r));
  setQueueAdapter(null);
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
  setRedisClient(new FakeRedis());
  setQueueAdapter(async () => {});
  cat = await seedCatalog();
});

async function login(email, role, phone) {
  await createStaffUser({ role, email, phone });
  const r = await request(app).post(api('/auth/login')).send({ email, password: 'Sup3rSecret!!' });
  return { token: r.body.data.accessToken, user: r.body.data.user };
}

async function codOrder(phone = '9876543210') {
  const { accessToken, user } = await loginCustomer(app, captureOtps(), phone);
  const auth = { Authorization: `Bearer ${accessToken}` };
  const address = await makeAddress(user._id);
  await request(app)
    .post(api('/cart/items'))
    .set(auth)
    .send({ menuItemId: String(cat.chai._id), quantity: 6 })
    .expect(200);
  const res = await request(app)
    .post(api('/orders'))
    .set(auth)
    .set('Idempotency-Key', `sock-key-${phone}-abcdef`)
    .send({ addressId: String(address._id), paymentMethod: 'cod' })
    .expect(201);
  return { token: accessToken, user, orderId: res.body.data._id };
}

describe('socket auth', () => {
  it('rejects missing, forged and blocked tokens', async () => {
    await expect(open(undefined)).rejects.toThrow(/unauthorized/);
    await expect(open('garbage')).rejects.toThrow(/unauthorized/);
    const { token, user } = await login('s@test.in', 'staff', '+919000000002');
    await open(token); // ok
    const redis = new FakeRedis();
    setRedisClient(redis);
    await redis.set(`jkc:blocked:${user._id}`, '1');
    await expect(open(token)).rejects.toThrow(/forbidden/);
  });
});

describe('order realtime', () => {
  it('staff get order:new instantly; the customer gets status updates in the order room', async () => {
    const staff = await login('s@test.in', 'staff', '+919000000002');
    const staffSock = await open(staff.token);
    const newOrder = nextEvent(staffSock, 'order:new');

    const { token, orderId } = await codOrder();
    expect(await newOrder).toMatchObject({ _id: orderId, status: 'PLACED', total: 15000 });

    const cust = await open(token);
    const sub = await emitAck(cust, 'order:subscribe', { orderId });
    expect(sub).toMatchObject({ ok: true, status: 'PLACED', location: null });

    const update = nextEvent(cust, 'order:status');
    const authStaff = { Authorization: `Bearer ${staff.token}` };
    await request(app)
      .patch(api(`/orders/${orderId}/status`))
      .set(authStaff)
      .send({ status: 'ACCEPTED' })
      .expect(200);
    expect(await update).toMatchObject({ _id: orderId, status: 'ACCEPTED' });
  });

  it("customers cannot subscribe to someone else's order; bad ids are rejected", async () => {
    const a = await codOrder('9876543210');
    const b = await codOrder('9123456789');
    const sockB = await open(b.token);
    expect(await emitAck(sockB, 'order:subscribe', { orderId: a.orderId })).toMatchObject({
      ok: false,
      error: 'not_found',
    });
    expect(await emitAck(sockB, 'order:subscribe', { orderId: 'nope' })).toMatchObject({
      ok: false,
      error: 'invalid_order',
    });
    expect(await emitAck(sockB, 'order:subscribe', { orderId: b.orderId })).toMatchObject({
      ok: true,
    });
  });

  it('rider location flows only from the assigned rider while out for delivery, and late joiners get the last fix', async () => {
    const staff = await login('s@test.in', 'staff', '+919000000002');
    const rider = await login('r@test.in', 'rider', '+919000000003');
    const { token, orderId } = await codOrder();
    const authStaff = { Authorization: `Bearer ${staff.token}` };
    for (const status of ['ACCEPTED', 'PREPARING', 'READY']) {
      await request(app)
        .patch(api(`/orders/${orderId}/status`))
        .set(authStaff)
        .send({ status })
        .expect(200);
    }
    await request(app)
      .patch(api(`/orders/${orderId}/assign`))
      .set(authStaff)
      .send({ riderId: rider.user._id })
      .expect(200);

    const riderSock = await open(rider.token);
    const cust = await open(token);
    await emitAck(cust, 'order:subscribe', { orderId });

    // not out for delivery yet
    expect(
      await emitAck(riderSock, 'rider:location', { orderId, lat: 22.7, lng: 75.8 }),
    ).toMatchObject({ ok: false, error: 'not_assigned' });
    await request(app)
      .patch(api(`/orders/${orderId}/status`))
      .set(authStaff)
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);

    // the denial above was cached for 30s, so use a fresh rider connection
    const riderSock2 = await open(rider.token);
    const got = nextEvent(cust, 'order:location');
    expect(await emitAck(riderSock2, 'rider:location', { orderId, lat: 22.7, lng: 75.8 })).toEqual({
      ok: true,
    });
    expect(await got).toMatchObject({ orderId, lat: 22.7, lng: 75.8 });
    expect(
      await emitAck(riderSock2, 'rider:location', { orderId, lat: 22.8, lng: 75.9 }),
    ).toMatchObject({ ok: false, error: 'too_fast' });
    expect(
      await emitAck(riderSock2, 'rider:location', { orderId, lat: 999, lng: 0 }),
    ).toMatchObject({ ok: false, error: 'invalid_payload' });

    // customers can't publish locations; late joiner sees the last fix
    expect(await emitAck(cust, 'rider:location', { orderId, lat: 1, lng: 1 })).toMatchObject({
      ok: false,
      error: 'forbidden',
    });
    const late = await open(token);
    expect(await emitAck(late, 'order:subscribe', { orderId })).toMatchObject({
      ok: true,
      location: { lat: 22.7, lng: 75.8 },
    });

    // a different rider is not assigned
    const rider2 = await login('r2@test.in', 'rider', '+919000000004');
    const sock2 = await open(rider2.token);
    expect(await emitAck(sock2, 'rider:location', { orderId, lat: 22.7, lng: 75.8 })).toMatchObject(
      { ok: false, error: 'not_assigned' },
    );
    expect(await User.countDocuments({ role: 'rider' })).toBe(2);
  });
});
