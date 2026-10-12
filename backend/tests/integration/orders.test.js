import request from 'supertest';
import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import { createApp } from '../../src/app.js';
import { setRedisClient } from '../../src/config/redis.js';
import { setQueueAdapter } from '../../src/jobs/queues.js';
import { Coupon } from '../../src/models/Coupon.js';
import { Order } from '../../src/models/Order.js';
import { User } from '../../src/models/User.js';
import { expireUnpaidOrders } from '../../src/services/order.service.js';
import { realtime } from '../../src/sockets/realtime.js';
import { captureOtps, createStaffUser, loginCustomer, staffAuth } from '../helpers/auth.js';
import { clearDb, startDb, stopDb } from '../helpers/db.js';
import { FakeRedis } from '../helpers/fakeRedis.js';
import { makeAddress, seedCatalog } from '../helpers/fixtures.js';

let app;
let cat;
let admin;
let staff;
let jobs;
let emits;
const api = (p) => `/api/v1${p}`;
let keySeq = 0;
const idemKey = () => `test-key-${Date.now()}-${keySeq++}`;

beforeAll(async () => {
  await startDb();
  app = createApp({ readinessChecks: {} });
});
afterAll(stopDb);

async function customer(phone = '9876543210') {
  const codes = captureOtps();
  const redis = new FakeRedis();
  setRedisClient(redis);
  const { accessToken, user } = await loginCustomer(app, codes, phone);
  return { auth: { Authorization: `Bearer ${accessToken}` }, user };
}

beforeEach(async () => {
  await clearDb();
  setRedisClient(new FakeRedis());
  jobs = [];
  emits = [];
  setQueueAdapter(async (queue, name, data, opts) => jobs.push({ queue, name, data, opts }));
  realtime.emit = jest.fn((room, event, payload) => emits.push({ room, event, payload }));
  cat = await seedCatalog();
  admin = await staffAuth(app, 'admin');
  staff = await staffAuth(app, 'staff');
});
afterAll(() => setQueueAdapter(null));

const addToCart = (auth, body) => request(app).post(api('/cart/items')).set(auth).send(body);
async function cartWith(auth, items) {
  for (const i of items) await addToCart(auth, i).expect(200);
}
const place = (auth, body, key = idemKey()) =>
  request(app).post(api('/orders')).set(auth).set('Idempotency-Key', key).send(body);

describe('cart', () => {
  it('prices from the server, merges identical lines and ignores client prices', async () => {
    const { auth } = await customer();
    await addToCart(auth, { menuItemId: String(cat.chai._id), quantity: 2, price: 1 }).expect(200);
    const res = await addToCart(auth, {
      menuItemId: String(cat.chai._id),
      quantity: 1,
      unitPrice: 1,
    }).expect(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toMatchObject({ quantity: 3, unitPrice: 2000, lineTotal: 6000 });
    expect(res.body.data.summary).toMatchObject({ subtotal: 6000, total: 6000, itemCount: 3 });
  });

  it('requires a valid variant, prices add-ons, rejects unavailable add-ons', async () => {
    const { auth } = await customer();
    const burger = String(cat.burger._id);
    await addToCart(auth, { menuItemId: burger }).expect(409);
    const large = cat.burger.variants[1];
    const cheese = cat.burger.addOns[0];
    const res = await addToCart(auth, {
      menuItemId: burger,
      variantId: String(large._id),
      addOnIds: [String(cheese._id)],
      quantity: 2,
    }).expect(200);
    expect(res.body.data.items[0]).toMatchObject({
      variantName: 'Large',
      unitPrice: 17500,
      lineTotal: 35000,
    });
    await addToCart(auth, {
      menuItemId: burger,
      variantId: String(large._id),
      addOnIds: [String(cat.burger.addOns[1]._id)],
    }).expect(409);
  });

  it('rejects out-of-stock items and flags items that go out of stock later', async () => {
    const { auth } = await customer();
    await addToCart(auth, { menuItemId: String(cat.chai._id) }).expect(200);
    await cat.chai.updateOne({ isAvailable: false });
    const cart = await request(app).get(api('/cart')).set(auth).expect(200);
    expect(cart.body.data.hasIssues).toBe(true);
    expect(cart.body.data.items[0].issue).toBe('out_of_stock');
    expect(cart.body.data.summary.subtotal).toBe(0);
    await addToCart(auth, { menuItemId: String(cat.chai._id) }).expect(409);
  });

  it('updates quantity, removes lines and clears; staff cannot use a cart', async () => {
    const { auth } = await customer();
    const c1 = await addToCart(auth, { menuItemId: String(cat.chai._id) }).expect(200);
    const lineId = c1.body.data.items[0].lineId;
    const c2 = await request(app)
      .patch(api(`/cart/items/${lineId}`))
      .set(auth)
      .send({ quantity: 5 })
      .expect(200);
    expect(c2.body.data.items[0].quantity).toBe(5);
    await request(app)
      .patch(api(`/cart/items/${lineId}`))
      .set(auth)
      .send({ quantity: 21 })
      .expect(422);
    const c3 = await request(app)
      .delete(api(`/cart/items/${lineId}`))
      .set(auth)
      .expect(200);
    expect(c3.body.data.items).toHaveLength(0);
    await request(app).get(api('/cart')).set(admin).expect(403);
  });

  it('concurrent adds do not lose updates', async () => {
    const { auth } = await customer();
    await addToCart(auth, { menuItemId: String(cat.chai._id) }).expect(200);
    await Promise.all(
      Array.from({ length: 5 }, () => addToCart(auth, { menuItemId: String(cat.chai._id) })),
    );
    const cart = await request(app).get(api('/cart')).set(auth);
    expect(cart.body.data.items.reduce((n, i) => n + i.quantity, 0)).toBe(6);
  });
});

describe('placing orders', () => {
  async function ready({ qty = 6 } = {}) {
    const c = await customer();
    const address = await makeAddress(c.user._id);
    await cartWith(c.auth, [{ menuItemId: String(cat.chai._id), quantity: qty }]);
    return { ...c, address };
  }

  it('creates a COD order with server-side totals, snapshots, history and clears the cart', async () => {
    const { auth, address, user } = await ready(); // 6 x 20 = 120 Rs
    const res = await place(auth, {
      addressId: String(address._id),
      paymentMethod: 'cod',
      note: 'less sugar',
      total: 1,
    }).expect(201);
    const o = res.body.data;
    expect(o.orderNumber).toMatch(/^JKC-\d{6}-0001$/);
    expect(o.pricing).toMatchObject({
      subtotal: 12000,
      deliveryCharge: 3000,
      discount: 0,
      total: 15000,
    });
    expect(o.items[0]).toMatchObject({
      name: 'Masala Chai',
      unitPrice: 2000,
      quantity: 6,
      lineTotal: 12000,
    });
    expect(o.payment).toMatchObject({ method: 'cod', status: 'cod_pending' });
    expect(o.statusHistory).toHaveLength(1);
    expect(o.address.pincode).toBe('452001');
    expect(String(o.userId)).toBe(String(user._id));
    expect((await request(app).get(api('/cart')).set(auth)).body.data.items).toHaveLength(0);

    // staff alert + customer notification
    expect(emits.some((e) => e.event === 'order:new' && e.room === 'staff')).toBe(true);
    expect(jobs.find((j) => j.name === 'notify')?.data).toMatchObject({
      type: 'order_status',
      title: 'Order placed',
    });
  });

  it('snapshots survive later menu changes', async () => {
    const { auth, address } = await ready();
    const res = await place(auth, { addressId: String(address._id), paymentMethod: 'cod' }).expect(
      201,
    );
    await cat.chai.updateOne({ price: 99999, name: 'Renamed' });
    const got = await request(app)
      .get(api(`/orders/${res.body.data._id}`))
      .set(auth)
      .expect(200);
    expect(got.body.data.items[0]).toMatchObject({ name: 'Masala Chai', unitPrice: 2000 });
  });

  it('enforces free delivery, minimum order, serviceability and address ownership', async () => {
    const c = await customer();
    const address = await makeAddress(c.user._id);
    await cartWith(c.auth, [{ menuItemId: String(cat.chai._id), quantity: 2 }]); // Rs 40 < Rs 100 minimum
    await place(c.auth, { addressId: String(address._id), paymentMethod: 'cod' }).expect(400);

    const far = await makeAddress(c.user._id, { pincode: '110001', isDefault: false });
    await cartWith(c.auth, [{ menuItemId: String(cat.chai._id), quantity: 10 }]);
    await place(c.auth, { addressId: String(far._id), paymentMethod: 'cod' }).expect(422);

    const other = await customer('9123456780');
    const theirs = await makeAddress(other.user._id);
    await place(c.auth, { addressId: String(theirs._id), paymentMethod: 'cod' }).expect(404);
    await place(c.auth, { paymentMethod: 'cod' }).expect(422); // delivery needs an address
  });

  it('supports pickup without an address or delivery charge', async () => {
    const { auth } = await ready();
    const res = await place(auth, { type: 'pickup', paymentMethod: 'cod' }).expect(201);
    expect(res.body.data.pricing.deliveryCharge).toBe(0);
    expect(res.body.data.address).toBeUndefined();
  });

  it('preview matches placed totals', async () => {
    const { auth, address } = await ready();
    const prev = await request(app)
      .post(api('/orders/preview'))
      .set(auth)
      .send({ addressId: String(address._id) })
      .expect(200);
    const res = await place(auth, { addressId: String(address._id), paymentMethod: 'cod' }).expect(
      201,
    );
    expect(prev.body.data.pricing).toEqual(res.body.data.pricing);
  });

  it('applies a coupon, counts the redemption, and releases it when the order is cancelled', async () => {
    const { auth, address } = await ready();
    await Coupon.create({
      code: 'SAVE20',
      type: 'percent',
      value: 20,
      maxDiscount: 5000,
      usageLimit: 10,
    });
    await request(app).put(api('/cart/coupon')).set(auth).send({ code: 'save20' }).expect(200);
    const res = await place(auth, { addressId: String(address._id), paymentMethod: 'cod' }).expect(
      201,
    );
    expect(res.body.data.pricing).toMatchObject({ subtotal: 12000, discount: 2400, total: 12600 });
    expect((await Coupon.findOne({ code: 'SAVE20' })).usedCount).toBe(1);

    await request(app)
      .post(api(`/orders/${res.body.data._id}/cancel`))
      .set(auth)
      .send({ reason: 'changed mind' })
      .expect(200);
    expect((await Coupon.findOne({ code: 'SAVE20' })).usedCount).toBe(0);
  });

  it('is idempotent: same key => one order; different body => 422; missing key => 400', async () => {
    const { auth, address } = await ready();
    const body = { addressId: String(address._id), paymentMethod: 'cod' };
    const key = idemKey();
    const a = await place(auth, body, key).expect(201);
    const b = await place(auth, body, key).expect(201);
    expect(b.headers['idempotent-replay']).toBe('true');
    expect(b.body.data._id).toBe(a.body.data._id);
    expect(await Order.countDocuments()).toBe(1);
    await place(auth, { ...body, note: 'different' }, key).expect(422);
    await request(app).post(api('/orders')).set(auth).send(body).expect(400);
    await place(auth, body, 'short').expect(400);
  });

  it('concurrent submissions with one key create exactly one order', async () => {
    const { auth, address } = await ready();
    const body = { addressId: String(address._id), paymentMethod: 'cod' };
    const key = idemKey();
    const rs = await Promise.all([
      place(auth, body, key),
      place(auth, body, key),
      place(auth, body, key),
    ]);
    expect(rs.filter((r) => r.status === 201)).not.toHaveLength(0);
    expect(rs.every((r) => [201, 409].includes(r.status))).toBe(true);
    expect(await Order.countDocuments()).toBe(1);
  });

  it('rejects an empty cart and unavailable items at checkout', async () => {
    const c = await customer();
    const address = await makeAddress(c.user._id);
    await place(c.auth, { addressId: String(address._id), paymentMethod: 'cod' }).expect(400);
    await cartWith(c.auth, [{ menuItemId: String(cat.chai._id), quantity: 6 }]);
    await cat.chai.updateOne({ isAvailable: false });
    const r = await place(c.auth, { addressId: String(address._id), paymentMethod: 'cod' }).expect(
      409,
    );
    expect(r.body.details[0]).toMatchObject({ issue: 'out_of_stock' });
  });
});

describe('order lifecycle', () => {
  async function codOrder(phone) {
    const c = await customer(phone);
    const address = await makeAddress(c.user._id);
    await cartWith(c.auth, [{ menuItemId: String(cat.chai._id), quantity: 6 }]);
    const res = await place(c.auth, {
      addressId: String(address._id),
      paymentMethod: 'cod',
    }).expect(201);
    return { ...c, id: res.body.data._id };
  }
  const setStatus = (auth, id, status, note) =>
    request(app)
      .patch(api(`/orders/${id}/status`))
      .set(auth)
      .send({ status, note });

  it('walks the full delivery flow with history, rider assignment and COD settlement', async () => {
    const { id, auth } = await codOrder();
    const rider = await createStaffUser({
      role: 'rider',
      phone: '+919000000003',
      email: 'rider@test.in',
    });
    const riderLogin = await request(app)
      .post(api('/auth/login'))
      .send({ email: 'rider@test.in', password: 'Sup3rSecret!!' });
    const riderAuth = { Authorization: `Bearer ${riderLogin.body.data.accessToken}` };

    for (const s of ['ACCEPTED', 'PREPARING', 'READY']) await setStatus(staff, id, s).expect(200);
    await request(app)
      .patch(api(`/orders/${id}/assign`))
      .set(staff)
      .send({ riderId: String(rider._id) })
      .expect(200);
    await setStatus(riderAuth, id, 'DELIVERED').expect(409); // must be OUT_FOR_DELIVERY first
    await setStatus(staff, id, 'OUT_FOR_DELIVERY').expect(200);
    const done = await setStatus(riderAuth, id, 'DELIVERED').expect(200);
    expect(done.body.data.statusHistory.map((h) => h.status)).toEqual([
      'PLACED',
      'ACCEPTED',
      'PREPARING',
      'READY',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ]);
    expect(done.body.data.payment.status).toBe('paid');
    expect(done.body.data.deliveredAt).toBeTruthy();

    expect(emits.filter((e) => e.event === 'order:status').length).toBeGreaterThanOrEqual(6);
    const mine = await request(app).get(api('/orders')).set(auth).expect(200);
    expect(mine.body.data[0].statusHistory).toBeUndefined();
    await setStatus(staff, id, 'CANCELLED').expect(409); // terminal
    expect(
      jobs.filter((j) => j.name === 'notify' && j.data.data?.status === 'DELIVERED'),
    ).toHaveLength(1);
  });

  it('blocks illegal moves, wrong actors and enforces ownership', async () => {
    const { id, auth } = await codOrder();
    const other = await customer('9000000099');
    await setStatus(staff, id, 'READY').expect(409);
    await setStatus(auth, id, 'ACCEPTED').expect(403);
    await request(app)
      .get(api(`/orders/${id}`))
      .set(other.auth)
      .expect(404);
    await request(app)
      .post(api(`/orders/${id}/cancel`))
      .set(other.auth)
      .send({})
      .expect(404);
    await request(app).get(api('/orders/manage')).set(auth).expect(403);

    await setStatus(staff, id, 'ACCEPTED').expect(200);
    await request(app)
      .post(api(`/orders/${id}/cancel`))
      .set(auth)
      .send({})
      .expect(409); // too late for the customer
    const rejected = await setStatus(admin, id, 'CANCELLED', 'Out of gas').expect(200);
    expect(rejected.body.data.cancelReason).toBe('Out of gas');
  });

  it('concurrent status updates: exactly one wins', async () => {
    const { id } = await codOrder();
    const rs = await Promise.all([
      setStatus(staff, id, 'ACCEPTED'),
      setStatus(admin, id, 'REJECTED', 'busy'),
      setStatus(staff, id, 'ACCEPTED'),
    ]);
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    const final = await Order.findById(id);
    expect(final.statusHistory).toHaveLength(2);
  });

  it('staff board lists active orders newest first and hides unpaid online orders', async () => {
    const { id, user, auth } = await codOrder();
    const address = await makeAddress(user._id, { isDefault: false });
    await cartWith(auth, [{ menuItemId: String(cat.chai._id), quantity: 6 }]);
    await place(auth, { addressId: String(address._id), paymentMethod: 'online' }).expect(201);

    const board = await request(app).get(api('/orders/manage?active=true')).set(staff).expect(200);
    expect(board.body.data).toHaveLength(1);
    expect(board.body.data[0]._id).toBe(id);
    const all = await request(app)
      .get(api('/orders/manage?includeUnpaid=true&status=PLACED'))
      .set(staff)
      .expect(200);
    expect(all.body.data).toHaveLength(2);
    await request(app).get(api('/orders/manage?status=BOGUS')).set(staff).expect(422);
  });

  it('assigning requires an active rider and a delivery order in progress', async () => {
    const { id } = await codOrder();
    const rider = await createStaffUser({
      role: 'rider',
      phone: '+919000000003',
      email: 'rider@test.in',
    });
    await request(app)
      .patch(api(`/orders/${id}/assign`))
      .set(staff)
      .send({ riderId: String(rider._id) })
      .expect(409); // still PLACED
    await setStatus(staff, id, 'ACCEPTED').expect(200);
    await request(app)
      .patch(api(`/orders/${id}/assign`))
      .set(staff)
      .send({ riderId: String(new mongoose.Types.ObjectId()) })
      .expect(400);
    await User.updateOne({ _id: rider._id }, { isActive: false });
    await request(app)
      .patch(api(`/orders/${id}/assign`))
      .set(staff)
      .send({ riderId: String(rider._id) })
      .expect(400);
  });

  it('expires stale unpaid online orders', async () => {
    const c = await customer();
    const address = await makeAddress(c.user._id);
    await cartWith(c.auth, [{ menuItemId: String(cat.chai._id), quantity: 6 }]);
    const res = await place(c.auth, {
      addressId: String(address._id),
      paymentMethod: 'online',
    }).expect(201);
    expect(await expireUnpaidOrders(15)).toBe(0);
    await Order.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(res.body.data._id) },
      { $set: { createdAt: new Date(Date.now() - 20 * 60_000) } }, // bypass immutable createdAt
    );
    expect(await expireUnpaidOrders(15)).toBe(1);
    const o = await Order.findById(res.body.data._id);
    expect(o.status).toBe('CANCELLED');
    expect(o.cancelReason).toMatch(/not completed/);
    expect(jobs.some((j) => j.name === 'refund-payment')).toBe(false); // nothing was paid
  });
});
