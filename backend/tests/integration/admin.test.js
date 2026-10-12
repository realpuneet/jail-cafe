import request from 'supertest';
import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import { createApp } from '../../src/app.js';
import { setRedisClient } from '../../src/config/redis.js';
import { setQueueAdapter } from '../../src/jobs/queues.js';
import { AnalyticsDaily } from '../../src/models/AnalyticsDaily.js';
import { BookingSlot } from '../../src/models/BookingSlot.js';
import { Order } from '../../src/models/Order.js';
import { TableBooking } from '../../src/models/TableBooking.js';
import * as analytics from '../../src/services/analytics.service.js';
import { realtime } from '../../src/sockets/realtime.js';
import { addDays, istDate } from '../../src/utils/datetime.js';
import { captureOtps, loginCustomer, staffAuth } from '../helpers/auth.js';
import { clearDb, startDb, stopDb } from '../helpers/db.js';
import { FakeRedis } from '../helpers/fakeRedis.js';
import { makeAddress, seedCatalog } from '../helpers/fixtures.js';

const api = (p) => `/api/v1${p}`;
let app;
let admin;
let staff;
let jobs;
let seq = 0;
const D = (n) => addDays(istDate(), n);

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
  jobs = [];
  setQueueAdapter(async (queue, name, data, opts) => jobs.push({ queue, name, data, opts }));
  realtime.emit = jest.fn();
  admin = await staffAuth(app, 'admin');
  staff = await staffAuth(app, 'staff');
});

/** Insert an order directly (lets us backdate createdAt, which Mongoose treats as immutable). */
async function mkOrder({
  status = 'DELIVERED',
  total = 10000,
  createdAt = new Date(),
  items,
  discount = 0,
  payment = { method: 'cod', status: 'paid' },
} = {}) {
  const userId = new mongoose.Types.ObjectId();
  await Order.collection.insertOne({
    orderNumber: `T-${Date.now()}-${seq++}`,
    userId,
    type: 'delivery',
    items: items ?? [
      {
        menuItemId: new mongoose.Types.ObjectId(),
        name: 'Masala Chai',
        isVeg: true,
        unitPrice: total,
        quantity: 1,
        lineTotal: total,
      },
    ],
    pricing: { subtotal: total + discount, discount, deliveryCharge: 0, total },
    payment,
    status,
    statusHistory: [],
    createdAt,
    updatedAt: createdAt,
  });
}
const at = (date, hour) => new Date(`${date}T${String(hour).padStart(2, '0')}:15:00+05:30`);

describe('analytics rollup', () => {
  it('aggregates a day: counts, sales, revenue, hours (IST), top items, bookings', async () => {
    const day = D(-1);
    const chai = new mongoose.Types.ObjectId();
    const burger = new mongoose.Types.ObjectId();
    await mkOrder({
      status: 'DELIVERED',
      total: 20000,
      createdAt: at(day, 9),
      items: [
        { menuItemId: chai, name: 'Masala Chai', unitPrice: 2000, quantity: 4, lineTotal: 8000 },
        { menuItemId: burger, name: 'Burger', unitPrice: 12000, quantity: 1, lineTotal: 12000 },
      ],
    });
    await mkOrder({
      status: 'DELIVERED',
      total: 6000,
      createdAt: at(day, 9),
      discount: 500,
      items: [
        { menuItemId: chai, name: 'Masala Chai', unitPrice: 2000, quantity: 3, lineTotal: 6000 },
      ],
    });
    await mkOrder({ status: 'PREPARING', total: 5000, createdAt: at(day, 21) });
    await mkOrder({ status: 'CANCELLED', total: 99900, createdAt: at(day, 22) });
    await mkOrder({ status: 'DELIVERED', total: 7777, createdAt: at(addDays(day, -1), 12) }); // another day
    await TableBooking.collection.insertOne({
      bookingNumber: 'TB-X',
      userId: new mongoose.Types.ObjectId(),
      slotId: new mongoose.Types.ObjectId(),
      date: day,
      startsAt: new Date(),
      guests: 4,
      name: 'G',
      phone: '+919876543210',
      status: 'CONFIRMED',
    });

    const r = await analytics.rollupDay(day);
    expect(r).toMatchObject({
      orders: 4,
      delivered: 2,
      cancelled: 1,
      grossSales: 31000,
      revenue: 26000,
      discounts: 500,
      bookings: 1,
      bookingGuests: 4,
    });
    expect(r.byStatus).toMatchObject({ DELIVERED: 2, PREPARING: 1, CANCELLED: 1 });
    expect(r.byHour[9]).toBe(2);
    expect(r.byHour[21]).toBe(1);
    expect(r.byHour.reduce((a, b) => a + b, 0)).toBe(4);
    expect(r.topItems[0]).toMatchObject({ name: 'Masala Chai', quantity: 7, revenue: 14000 });
    expect(r.topItems.find((i) => i.name === 'Burger').quantity).toBe(1);

    await analytics.rollupDay(day); // idempotent
    expect(await AnalyticsDaily.countDocuments({ _id: day })).toBe(1);
  });

  it('IST midnight boundary: 00:10 IST belongs to the new day, 23:50 IST to the old one', async () => {
    const day = D(-2);
    await mkOrder({ createdAt: new Date(`${day}T23:50:00+05:30`) });
    await mkOrder({ createdAt: new Date(`${addDays(day, 1)}T00:10:00+05:30`) });
    expect((await analytics.rollupDay(day)).orders).toBe(1);
    expect((await analytics.rollupDay(addDays(day, 1))).orders).toBe(1);
  });
});

describe('dashboard endpoint', () => {
  it('returns a zero-filled series, totals vs previous period, AOV and live counts; admin only', async () => {
    await mkOrder({ total: 10000, createdAt: at(D(-1), 10) });
    await mkOrder({ total: 30000, createdAt: at(D(-1), 11) });
    await mkOrder({ total: 5000, createdAt: at(D(-8), 11) }); // previous period (days=7)
    await mkOrder({ status: 'PLACED', total: 4000, createdAt: new Date() });

    await request(app).get(api('/admin/analytics/dashboard')).set(staff).expect(403);
    await request(app).get(api('/admin/analytics/dashboard')).expect(401);
    const res = await request(app)
      .get(api('/admin/analytics/dashboard?days=7'))
      .set(admin)
      .expect(200);
    const d = res.body.data;
    expect(d.series).toHaveLength(7);
    expect(d.series.at(-1).date).toBe(istDate());
    expect(d.series.find((x) => x.date === D(-1))).toMatchObject({ orders: 2, revenue: 40000 });
    expect(d.series.find((x) => x.date === D(-3))).toMatchObject({ orders: 0, revenue: 0 });
    expect(d.totals).toMatchObject({ orders: 3, delivered: 2, revenue: 40000 });
    expect(d.previous).toMatchObject({ orders: 1, revenue: 5000 });
    expect(d.averageOrderValue).toBe(20000);
    expect(d.topItems[0].name).toBe('Masala Chai');
    expect(d.live.activeOrders).toBe(1); // the PLACED COD order is visible to the kitchen
    await request(app).get(api('/admin/analytics/dashboard?days=0')).set(admin).expect(422);
    await request(app).get(api('/admin/analytics/dashboard?days=500')).set(admin).expect(422);
  });

  it('backfills history once and serves later requests from the rollup collection', async () => {
    await mkOrder({ total: 10000, createdAt: at(D(-3), 10) });
    await request(app).get(api('/admin/analytics/dashboard?days=7')).set(admin).expect(200);
    expect(await AnalyticsDaily.countDocuments({ _id: { $lt: istDate() } })).toBeGreaterThanOrEqual(
      6,
    );
    // a late insert for a closed day is NOT seen until the job recomputes it (proves reads use rollups)
    await mkOrder({ total: 10000, createdAt: at(D(-3), 12) });
    const again = await request(app).get(api('/admin/analytics/dashboard?days=7')).set(admin);
    expect(again.body.data.series.find((x) => x.date === D(-3)).orders).toBe(1);
    await analytics.rollupDay(D(-3));
    const fresh = await request(app).get(api('/admin/analytics/dashboard?days=7')).set(admin);
    expect(fresh.body.data.series.find((x) => x.date === D(-3)).orders).toBe(2);
  });
});

describe('settings', () => {
  it('public read with defaults; admin/staff read; only admin writes; cache invalidates', async () => {
    const first = await request(app).get(api('/settings')).expect(200);
    expect(first.body.data).toMatchObject({
      acceptingOrders: true,
      acceptingBookings: true,
      announcement: '',
    });
    await request(app)
      .put(api('/admin/settings'))
      .set(staff)
      .send({ announcement: 'x' })
      .expect(403);
    await request(app).put(api('/admin/settings')).set(admin).send({}).expect(422);
    await request(app)
      .put(api('/admin/settings'))
      .set(admin)
      .send({ acceptingOrders: 'no' })
      .expect(422);
    await request(app)
      .put(api('/admin/settings'))
      .set(admin)
      .send({ announcement: 'Diwali special: free kulhad!', bogus: 1 })
      .expect(200);
    expect((await request(app).get(api('/settings'))).body.data.announcement).toBe(
      'Diwali special: free kulhad!',
    );
    expect(
      (await request(app).get(api('/admin/settings')).set(staff).expect(200)).body.data.bogus,
    ).toBeUndefined();
  });

  it('closing the cafe blocks new orders and table bookings immediately', async () => {
    const cat = await seedCatalog();
    const { accessToken, user } = await loginCustomer(app, captureOtps());
    const auth = { Authorization: `Bearer ${accessToken}` };
    const address = await makeAddress(user._id);
    await request(app)
      .post(api('/cart/items'))
      .set(auth)
      .send({ menuItemId: String(cat.chai._id), quantity: 6 })
      .expect(200);
    const slot = await BookingSlot.create({
      label: 'Dinner',
      startTime: '19:00',
      endTime: '21:00',
      capacity: 10,
    });

    await request(app)
      .put(api('/admin/settings'))
      .set(admin)
      .send({ acceptingOrders: false, acceptingBookings: false })
      .expect(200);
    const order = await request(app)
      .post(api('/orders'))
      .set(auth)
      .set('Idempotency-Key', 'closed-key-12345')
      .send({ addressId: String(address._id), paymentMethod: 'cod' });
    expect(order.status).toBe(409);
    expect(order.body.message).toMatch(/not taking orders/);
    await request(app)
      .post(api('/table-bookings'))
      .set(auth)
      .set('Idempotency-Key', 'closed-key-67890')
      .send({ slotId: String(slot._id), date: D(2), guests: 2 })
      .expect(409);

    await request(app)
      .put(api('/admin/settings'))
      .set(admin)
      .send({ acceptingOrders: true })
      .expect(200);
    await request(app)
      .post(api('/orders'))
      .set(auth)
      .set('Idempotency-Key', 'open-key-123456')
      .send({ addressId: String(address._id), paymentMethod: 'cod' })
      .expect(201);
  });
});

describe('reviews', () => {
  async function deliveredOrder() {
    const cat = await seedCatalog();
    const { accessToken, user } = await loginCustomer(app, captureOtps());
    const auth = { Authorization: `Bearer ${accessToken}` };
    const address = await makeAddress(user._id);
    await request(app)
      .post(api('/cart/items'))
      .set(auth)
      .send({ menuItemId: String(cat.chai._id), quantity: 6 })
      .expect(200);
    const placed = await request(app)
      .post(api('/orders'))
      .set(auth)
      .set('Idempotency-Key', 'review-key-12345')
      .send({ addressId: String(address._id), paymentMethod: 'cod' })
      .expect(201);
    return { auth, user, id: placed.body.data._id };
  }
  const setStatus = (id, status) =>
    request(app)
      .patch(api(`/orders/${id}/status`))
      .set(staff)
      .send({ status });

  it('only delivered orders can be reviewed, once, by their owner', async () => {
    const { auth, id } = await deliveredOrder();
    await request(app).post(api('/reviews')).set(auth).send({ orderId: id, rating: 5 }).expect(409); // not delivered yet
    for (const s of ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'])
      await setStatus(id, s).expect(200);
    await request(app).post(api('/reviews')).set(auth).send({ orderId: id, rating: 6 }).expect(422);
    await request(app).post(api('/reviews')).set(auth).send({ orderId: id, rating: 0 }).expect(422);
    const ok = await request(app)
      .post(api('/reviews'))
      .set(auth)
      .send({ orderId: id, rating: 4, comment: 'Great chai' })
      .expect(201);
    expect(ok.body.data).toMatchObject({ rating: 4, reviewer: 'Test', items: ['Masala Chai'] });
    await request(app).post(api('/reviews')).set(auth).send({ orderId: id, rating: 5 }).expect(409);
    expect(
      (
        await request(app)
          .get(api(`/reviews/order/${id}`))
          .set(auth)
          .expect(200)
      ).body.data.rating,
    ).toBe(4);

    const other = await loginCustomer(app, captureOtps(), '9123456780');
    await request(app)
      .post(api('/reviews'))
      .set({ Authorization: `Bearer ${other.accessToken}` })
      .send({ orderId: id, rating: 1 })
      .expect(404);
  });

  it('public list + summary are cached and exclude hidden reviews; admin moderates', async () => {
    const { auth, id } = await deliveredOrder();
    for (const s of ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'])
      await setStatus(id, s);
    const review = await request(app)
      .post(api('/reviews'))
      .set(auth)
      .send({ orderId: id, rating: 5, comment: 'Superb' })
      .expect(201);

    const pub = await request(app).get(api('/reviews')).expect(200);
    expect(pub.body.data).toHaveLength(1);
    expect(pub.body.data[0].userId).toBeUndefined(); // no user ids leak
    expect((await request(app).get(api('/reviews/summary')).expect(200)).body.data).toEqual({
      count: 1,
      average: 5,
    });

    await request(app)
      .patch(api(`/reviews/${review.body.data._id}/status`))
      .set(staff)
      .send({ status: 'hidden' })
      .expect(403);
    await request(app)
      .patch(api(`/reviews/${review.body.data._id}/status`))
      .set(admin)
      .send({ status: 'hidden' })
      .expect(200);
    expect((await request(app).get(api('/reviews')).expect(200)).body.data).toHaveLength(0);
    expect((await request(app).get(api('/reviews/summary'))).body.data).toEqual({
      count: 0,
      average: 0,
    });
    expect(
      (await request(app).get(api('/reviews/manage?status=hidden')).set(admin).expect(200)).body
        .data,
    ).toHaveLength(1);
  });
});
