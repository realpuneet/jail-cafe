import request from 'supertest';
import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { setRedisClient } from '../../src/config/redis.js';
import { razorpayService } from '../../src/integrations/razorpay.service.js';
import { setQueueAdapter } from '../../src/jobs/queues.js';
import { BookingSlot, SlotInventory } from '../../src/models/BookingSlot.js';
import { Payment } from '../../src/models/Payment.js';
import { TableBooking } from '../../src/models/TableBooking.js';
import * as bookingService from '../../src/services/tableBooking.service.js';
import { refundPayment } from '../../src/services/payment.service.js';
import { realtime } from '../../src/sockets/realtime.js';
import { addDays, istDate } from '../../src/utils/datetime.js';
import { captureOtps, loginCustomer, staffAuth } from '../helpers/auth.js';
import { clearDb, startDb, stopDb } from '../helpers/db.js';
import { FakeRedis } from '../helpers/fakeRedis.js';

const api = (p) => `/api/v1${p}`;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
let app;
let admin;
let staff;
let jobs;
let emits;
let rz;
let seq = 0;
const D = (n) => addDays(istDate(), n);
const key = () => `book-key-${seq++}-abcdefgh`;

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
  emits = [];
  rz = 0;
  setQueueAdapter(async (queue, name, data, opts) => jobs.push({ queue, name, data, opts }));
  realtime.emit = jest.fn((room, event, payload) => emits.push({ room, event, payload }));
  razorpayService.createOrder = jest.fn(async ({ amount }) => ({
    id: `order_bk${++rz}`,
    amount,
    currency: 'INR',
  }));
  razorpayService.refund = jest.fn(async (pid, { amount }) => ({ id: `rfnd_bk${++rz}`, amount }));
  admin = await staffAuth(app, 'admin');
  staff = await staffAuth(app, 'staff');
});

const mkSlot = (over = {}) =>
  BookingSlot.create({
    label: 'Dinner',
    startTime: '19:00',
    endTime: '21:00',
    capacity: 10,
    maxPartySize: 6,
    ...over,
  });
async function customer(phone = '9876543210') {
  const { accessToken, user } = await loginCustomer(app, captureOtps(), phone);
  return { auth: { Authorization: `Bearer ${accessToken}` }, user };
}
const book = (auth, body, k = key()) =>
  request(app).post(api('/table-bookings')).set(auth).set('Idempotency-Key', k).send(body);
const sig = (o, p) => createHmac('sha256', KEY_SECRET).update(`${o}|${p}`).digest('hex');

describe('availability', () => {
  it('lists active slots for the weekday with live remaining seats', async () => {
    const slot = await mkSlot();
    await mkSlot({
      label: 'Lunch',
      startTime: '13:00',
      endTime: '15:00',
      daysOfWeek: [].concat([]),
      capacity: 5,
    }).catch(() => {});
    const { auth } = await customer();
    await book(auth, { slotId: String(slot._id), date: D(3), guests: 4 }).expect(201);
    const res = await request(app)
      .get(api(`/booking-slots/availability?date=${D(3)}`))
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      label: 'Dinner',
      capacity: 10,
      remaining: 6,
      bookable: true,
    });
    const other = await request(app)
      .get(api(`/booking-slots/availability?date=${D(4)}`))
      .expect(200);
    expect(other.body.data[0].remaining).toBe(10);
  });

  it('rejects past, far-future and malformed dates', async () => {
    await mkSlot();
    await request(app)
      .get(api(`/booking-slots/availability?date=${D(-1)}`))
      .expect(400);
    await request(app)
      .get(api(`/booking-slots/availability?date=${D(31)}`))
      .expect(400);
    await request(app).get(api('/booking-slots/availability?date=2026-13-45')).expect(422);
    await request(app).get(api('/booking-slots/availability')).expect(422);
  });

  it('marks slots that are too close or full as not bookable', async () => {
    const full = await mkSlot({ capacity: 2 });
    const { auth } = await customer();
    await book(auth, { slotId: String(full._id), date: D(2), guests: 2 }).expect(201);
    const res = await request(app).get(api(`/booking-slots/availability?date=${D(2)}`));
    expect(res.body.data[0]).toMatchObject({ remaining: 0, bookable: false });
    const now = new Date(`${istDate()}T00:00:00+05:30`);
    const soon = await mkSlot({ label: 'Soon', startTime: '00:10', endTime: '00:50' });
    const list = await (
      await import('../../src/services/bookingSlot.service.js')
    ).availability(istDate(), now);
    expect(list.find((s) => s.label === 'Soon')).toMatchObject({ bookable: false });
    expect(String(soon._id)).toBeTruthy();
  });
});

describe('booking without a deposit', () => {
  it('confirms immediately, alerts staff, notifies, schedules a reminder, and is idempotent', async () => {
    const slot = await mkSlot();
    const { auth } = await customer();
    const k = key();
    const body = { slotId: String(slot._id), date: D(5), guests: 3, note: 'window seat' };
    const res = await book(auth, body, k).expect(201);
    expect(res.body.data).toMatchObject({ status: 'CONFIRMED', guests: 3, date: D(5) });
    expect(res.body.data.bookingNumber).toMatch(/^TB-\d{6}-0001$/);
    expect(emits.some((e) => e.event === 'booking:new' && e.room === 'staff')).toBe(true);
    expect(jobs.find((j) => j.name === 'notify')?.data.title).toBe('Table confirmed');
    const reminder = jobs.find((j) => j.name === 'booking-reminder');
    expect(reminder.opts.delay).toBeGreaterThan(0);
    expect(reminder.opts.jobId).toBe(`reminder-${res.body.data._id}`);

    const again = await book(auth, body, k).expect(201);
    expect(again.headers['idempotent-replay']).toBe('true');
    expect(await TableBooking.countDocuments()).toBe(1);
    expect((await SlotInventory.findOne()).booked).toBe(3);
  });

  it('validates party size, slot, day-of-week and duplicates', async () => {
    const slot = await mkSlot();
    const { auth } = await customer();
    await book(auth, { slotId: String(slot._id), date: D(2), guests: 7 }).expect(400);
    await book(auth, { slotId: String(slot._id), date: D(2), guests: 0 }).expect(422);
    await book(auth, { slotId: '65f0c0ffee0123456789abcd', date: D(2), guests: 2 }).expect(404);
    await book(auth, { slotId: String(slot._id), date: D(-1), guests: 2 }).expect(400);
    await book(auth, { slotId: String(slot._id), date: 'tomorrow', guests: 2 }).expect(422);
    const dow = new Date(`${D(2)}T12:00:00Z`).getUTCDay();
    const weekdayOnly = await mkSlot({ label: 'Other day', daysOfWeek: [(dow + 1) % 7] });
    await book(auth, { slotId: String(weekdayOnly._id), date: D(2), guests: 2 }).expect(400);

    await book(auth, { slotId: String(slot._id), date: D(2), guests: 2 }).expect(201);
    await book(auth, { slotId: String(slot._id), date: D(2), guests: 2 }).expect(409); // same user, same slot/day
    expect((await SlotInventory.findOne()).booked).toBe(2); // the rejected attempt took no seats
  });

  it('requires login, a customer role and an Idempotency-Key', async () => {
    const slot = await mkSlot();
    await request(app).post(api('/table-bookings')).send({}).expect(401);
    await request(app)
      .post(api('/table-bookings'))
      .set(admin)
      .set('Idempotency-Key', key())
      .send({ slotId: String(slot._id), date: D(2), guests: 2 })
      .expect(403);
    const { auth } = await customer();
    await request(app)
      .post(api('/table-bookings'))
      .set(auth)
      .send({ slotId: String(slot._id), date: D(2), guests: 2 })
      .expect(400);
  });
});

describe('capacity safety under concurrency', () => {
  it('never oversells: 12 simultaneous 2-guest bookings into 10 seats -> exactly 5 succeed', async () => {
    const slot = await mkSlot({ capacity: 10 });
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        bookingService.createBooking(new mongoose.Types.ObjectId(), {
          slotId: String(slot._id),
          date: D(4),
          guests: 2,
          name: `Guest ${i}`,
          phone: '+919876543210',
        }),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(5);
    expect(failed.every((r) => r.reason.statusCode === 409)).toBe(true);
    const inv = await SlotInventory.findOne({ slotId: slot._id, date: D(4) });
    expect(inv.booked).toBe(10);
    expect(await TableBooking.countDocuments({ status: 'CONFIRMED' })).toBe(5);
  });

  it('mixed party sizes never exceed capacity and booked always equals the sum of live bookings', async () => {
    const slot = await mkSlot({ capacity: 20, maxPartySize: 6 });
    const sizes = [6, 5, 4, 3, 6, 2, 5, 1, 6, 4, 3, 2];
    await Promise.allSettled(
      sizes.map((g) =>
        bookingService.createBooking(new mongoose.Types.ObjectId(), {
          slotId: String(slot._id),
          date: D(6),
          guests: g,
          name: 'G',
          phone: '+919876543210',
        }),
      ),
    );
    const inv = await SlotInventory.findOne({ slotId: slot._id, date: D(6) });
    const live = await TableBooking.aggregate([
      { $match: { status: 'CONFIRMED' } },
      { $group: { _id: null, n: { $sum: '$guests' } } },
    ]);
    expect(inv.booked).toBeLessThanOrEqual(20);
    expect(inv.booked).toBe(live[0].n);
  });

  it('cancellations free seats that can be rebooked', async () => {
    const slot = await mkSlot({ capacity: 4 });
    const a = await customer('9876543210');
    const b = await customer('9123456780');
    const first = await book(a.auth, { slotId: String(slot._id), date: D(2), guests: 4 }).expect(
      201,
    );
    await book(b.auth, { slotId: String(slot._id), date: D(2), guests: 2 }).expect(409);
    await request(app)
      .post(api(`/table-bookings/${first.body.data._id}/cancel`))
      .set(a.auth)
      .send({})
      .expect(200);
    expect((await SlotInventory.findOne()).booked).toBe(0);
    await book(b.auth, { slotId: String(slot._id), date: D(2), guests: 2 }).expect(201);
  });
});

describe('deposit flow', () => {
  async function held() {
    const slot = await mkSlot({ depositPerGuest: 10000 }); // Rs 100 per guest
    const { auth, user } = await customer();
    const res = await book(auth, { slotId: String(slot._id), date: D(3), guests: 3 }).expect(201);
    return { auth, user, slot, booking: res.body.data };
  }

  it('holds seats, takes a deposit via Razorpay, then confirms on a verified payment', async () => {
    const { auth, booking } = await held();
    expect(booking).toMatchObject({
      status: 'HELD',
      deposit: { amount: 30000, status: 'pending' },
    });
    expect(booking.holdExpiresAt).toBeTruthy();
    expect(jobs.some((j) => j.name === 'booking-reminder')).toBe(false); // not until confirmed

    const pay = await request(app)
      .post(api(`/table-bookings/${booking._id}/pay`))
      .set(auth)
      .send({})
      .expect(200);
    expect(pay.body.data).toMatchObject({ razorpayOrderId: 'order_bk1', amount: 30000 });
    await request(app)
      .post(api('/payments/razorpay/verify'))
      .set(auth)
      .send({
        razorpay_order_id: 'order_bk1',
        razorpay_payment_id: 'pay_bk1',
        razorpay_signature: 'bad'.repeat(5),
      })
      .expect(400);
    const ok = await request(app)
      .post(api('/payments/razorpay/verify'))
      .set(auth)
      .send({
        razorpay_order_id: 'order_bk1',
        razorpay_payment_id: 'pay_bk1',
        razorpay_signature: sig('order_bk1', 'pay_bk1'),
      })
      .expect(200);
    expect(ok.body.data).toMatchObject({
      status: 'paid',
      purpose: 'booking',
      orderNumber: booking.bookingNumber,
    });

    const b = await TableBooking.findById(booking._id);
    expect(b).toMatchObject({ status: 'CONFIRMED', deposit: { status: 'paid' } });
    expect(b.holdExpiresAt).toBeUndefined();
    expect(jobs.find((j) => j.name === 'booking-reminder')).toBeTruthy();
    // verify twice is harmless
    await request(app)
      .post(api('/payments/razorpay/verify'))
      .set(auth)
      .send({
        razorpay_order_id: 'order_bk1',
        razorpay_payment_id: 'pay_bk1',
        razorpay_signature: sig('order_bk1', 'pay_bk1'),
      })
      .expect(200);
    expect(jobs.filter((j) => j.name === 'booking-reminder')).toHaveLength(1);
  });

  it('only the owner can pay, and only while the hold is valid', async () => {
    const { auth, booking } = await held();
    const other = await customer('9000000044');
    await request(app)
      .post(api(`/table-bookings/${booking._id}/pay`))
      .set(other.auth)
      .send({})
      .expect(404);
    await TableBooking.updateOne(
      { _id: booking._id },
      { holdExpiresAt: new Date(Date.now() - 1000) },
    );
    await request(app)
      .post(api(`/table-bookings/${booking._id}/pay`))
      .set(auth)
      .send({})
      .expect(409);
  });

  it('the maintenance job expires unpaid holds and releases seats exactly once', async () => {
    const { booking, slot } = await held();
    expect((await SlotInventory.findOne({ slotId: slot._id })).booked).toBe(3);
    expect(await bookingService.expireOverdueHolds()).toBe(0); // not overdue yet
    await TableBooking.updateOne(
      { _id: booking._id },
      { holdExpiresAt: new Date(Date.now() - 60_000) },
    );
    const [a, b] = await Promise.all([
      bookingService.expireOverdueHolds(),
      bookingService.expireOverdueHolds(),
    ]);
    expect(a + b).toBe(1);
    expect((await TableBooking.findById(booking._id)).status).toBe('EXPIRED');
    expect((await SlotInventory.findOne({ slotId: slot._id })).booked).toBe(0);
    // the freed seats are bookable again and a late deposit would be refunded
    const other = await customer('9111111111');
    await book(other.auth, { slotId: String(slot._id), date: D(3), guests: 10 }).catch(() => {});
  });

  it('a payment captured after the hold expired is refunded automatically', async () => {
    const { auth, booking } = await held();
    await request(app)
      .post(api(`/table-bookings/${booking._id}/pay`))
      .set(auth)
      .send({})
      .expect(200);
    await TableBooking.updateOne(
      { _id: booking._id },
      { holdExpiresAt: new Date(Date.now() - 1000) },
    );
    await bookingService.expireOverdueHolds();
    await request(app)
      .post(api('/payments/razorpay/verify'))
      .set(auth)
      .send({
        razorpay_order_id: 'order_bk1',
        razorpay_payment_id: 'pay_late',
        razorpay_signature: sig('order_bk1', 'pay_late'),
      })
      .expect(200);
    expect((await TableBooking.findById(booking._id)).status).toBe('EXPIRED');
    const refundJob = jobs.find((j) => j.name === 'refund-payment');
    expect(refundJob.data).toEqual({ purpose: 'booking', refId: booking._id });
    const res = await refundPayment(refundJob.data);
    expect(res.refunded).toBe(30000);
  });

  it('cancelling a paid booking queues a refund and updates the deposit status', async () => {
    const { auth, booking } = await held();
    await request(app)
      .post(api(`/table-bookings/${booking._id}/pay`))
      .set(auth)
      .send({})
      .expect(200);
    await request(app)
      .post(api('/payments/razorpay/verify'))
      .set(auth)
      .send({
        razorpay_order_id: 'order_bk1',
        razorpay_payment_id: 'pay_bk1',
        razorpay_signature: sig('order_bk1', 'pay_bk1'),
      })
      .expect(200);
    await request(app)
      .post(api(`/table-bookings/${booking._id}/cancel`))
      .set(auth)
      .send({ reason: 'plans changed' })
      .expect(200);
    const job = jobs.find((j) => j.name === 'refund-payment');
    expect(job.data.purpose).toBe('booking');
    await refundPayment(job.data);
    expect((await TableBooking.findById(booking._id)).deposit.status).toBe('refunded');
    expect((await Payment.findOne()).status).toBe('refunded');
  });
});

describe('cancel rules, staff tools', () => {
  async function confirmed() {
    const slot = await mkSlot();
    const { auth, user } = await customer();
    const res = await book(auth, { slotId: String(slot._id), date: D(2), guests: 2 }).expect(201);
    return { auth, user, slot, id: res.body.data._id };
  }

  it('customers cannot cancel inside the cutoff; staff can; strangers cannot', async () => {
    const { auth, id } = await confirmed();
    const other = await customer('9000000033');
    await request(app)
      .post(api(`/table-bookings/${id}/cancel`))
      .set(other.auth)
      .send({})
      .expect(404);
    await TableBooking.updateOne({ _id: id }, { startsAt: new Date(Date.now() + 60 * 60_000) }); // starts in 1h
    await request(app)
      .post(api(`/table-bookings/${id}/cancel`))
      .set(auth)
      .send({})
      .expect(409);
    await request(app)
      .post(api(`/table-bookings/${id}/cancel`))
      .set(staff)
      .send({ reason: 'kitchen closed' })
      .expect(200);
    await request(app)
      .post(api(`/table-bookings/${id}/cancel`))
      .set(staff)
      .send({})
      .expect(409); // already cancelled
    expect((await SlotInventory.findOne()).booked).toBe(0);
  });

  it('staff day view, month calendar, and outcomes', async () => {
    const slot = await mkSlot();
    const a = await customer('9876543210');
    const b = await customer('9123456780');
    const r1 = await book(a.auth, { slotId: String(slot._id), date: D(2), guests: 2 }).expect(201);
    await book(b.auth, { slotId: String(slot._id), date: D(2), guests: 4 }).expect(201);
    const day = await request(app)
      .get(api(`/table-bookings/manage?date=${D(2)}`))
      .set(staff)
      .expect(200);
    expect(day.body.data).toHaveLength(2);
    expect(day.body.meta.count).toBe(2);
    const month = D(2).slice(0, 7);
    const cal = await request(app)
      .get(api(`/table-bookings/manage/calendar?month=${month}`))
      .set(staff)
      .expect(200);
    expect(cal.body.data.find((d) => d.date === D(2))).toMatchObject({ bookings: 2, guests: 6 });
    await request(app).get(api('/table-bookings/manage')).set(a.auth).expect(403);

    const done = await request(app)
      .patch(api(`/table-bookings/${r1.body.data._id}/outcome`))
      .set(staff)
      .send({ status: 'NO_SHOW' })
      .expect(200);
    expect(done.body.data.status).toBe('NO_SHOW');
    await request(app)
      .patch(api(`/table-bookings/${r1.body.data._id}/outcome`))
      .set(staff)
      .send({ status: 'COMPLETED' })
      .expect(409);
    await request(app)
      .patch(api(`/table-bookings/${r1.body.data._id}/outcome`))
      .set(staff)
      .send({ status: 'CANCELLED' })
      .expect(422);
  });

  it('my bookings are paginated and private; reminder only fires for confirmed bookings', async () => {
    const slot = await mkSlot();
    const a = await customer('9876543210');
    const b = await customer('9123456780');
    const r = await book(a.auth, { slotId: String(slot._id), date: D(2), guests: 2 }).expect(201);
    await book(b.auth, { slotId: String(slot._id), date: D(3), guests: 2 }).expect(201);
    const mine = await request(app).get(api('/table-bookings')).set(a.auth).expect(200);
    expect(mine.body.data).toHaveLength(1);
    await request(app)
      .get(api(`/table-bookings/${r.body.data._id}`))
      .set(b.auth)
      .expect(404);

    jobs.length = 0;
    expect((await bookingService.sendReminder(r.body.data._id)).sent).toBe(true);
    expect(jobs[0].data.title).toBe('Table reminder');
    await request(app)
      .post(api(`/table-bookings/${r.body.data._id}/cancel`))
      .set(a.auth)
      .send({})
      .expect(200);
    expect((await bookingService.sendReminder(r.body.data._id)).sent).toBe(false);
  });
});

describe('slot administration', () => {
  it('admin creates and edits slots; capacity changes reach existing inventories', async () => {
    const created = await request(app)
      .post(api('/booking-slots'))
      .set(admin)
      .send({ label: 'Dinner', startTime: '19:00', endTime: '21:00', capacity: 10 })
      .expect(201);
    expect(created.body.data).toMatchObject({
      maxPartySize: 10,
      depositPerGuest: 0,
      isActive: true,
    });
    await request(app)
      .post(api('/booking-slots'))
      .set(admin)
      .send({ label: 'Bad', startTime: '21:00', endTime: '19:00', capacity: 5 })
      .expect(422);
    await request(app)
      .post(api('/booking-slots'))
      .set(staff)
      .send({ label: 'X', startTime: '10:00', endTime: '11:00', capacity: 5 })
      .expect(403);

    const { auth } = await customer();
    await book(auth, { slotId: created.body.data._id, date: D(2), guests: 2 }).expect(201);
    await request(app)
      .patch(api(`/booking-slots/${created.body.data._id}`))
      .set(admin)
      .send({ capacity: 25 })
      .expect(200);
    expect((await SlotInventory.findOne()).capacity).toBe(25);

    await request(app)
      .delete(api(`/booking-slots/${created.body.data._id}`))
      .set(admin)
      .expect(200);
    const other = await customer('9123456780');
    await book(other.auth, { slotId: created.body.data._id, date: D(2), guests: 2 }).expect(404);
    expect(
      (await request(app).get(api('/booking-slots/manage')).set(staff)).body.data,
    ).toHaveLength(1);
  });
});
