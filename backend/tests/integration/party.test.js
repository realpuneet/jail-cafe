import request from 'supertest';
import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { setRedisClient } from '../../src/config/redis.js';
import { razorpayService } from '../../src/integrations/razorpay.service.js';
import { setQueueAdapter } from '../../src/jobs/queues.js';
import { PartyDay, PartyInquiry } from '../../src/models/PartyInquiry.js';
import { PartyPackage } from '../../src/models/PartyPackage.js';
import * as partyService from '../../src/services/partyInquiry.service.js';
import { refundPayment } from '../../src/services/payment.service.js';
import { realtime } from '../../src/sockets/realtime.js';
import { addDays, istDate } from '../../src/utils/datetime.js';
import { captureOtps, loginCustomer, staffAuth } from '../helpers/auth.js';
import { clearDb, startDb, stopDb } from '../helpers/db.js';
import { FakeRedis } from '../helpers/fakeRedis.js';

const api = (p) => `/api/v1${p}`;
const SECRET = process.env.RAZORPAY_KEY_SECRET;
let app;
let admin;
let staff;
let jobs;
let emits;
let rz;
let seq = 0;
const D = (n) => addDays(istDate(), n);
const key = () => `party-key-${seq++}-abcdefgh`;
const sig = (o, p) => createHmac('sha256', SECRET).update(`${o}|${p}`).digest('hex');

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
    id: `order_pt${++rz}`,
    amount,
    currency: 'INR',
  }));
  razorpayService.refund = jest.fn(async (pid, { amount }) => ({ id: `rfnd_pt${++rz}`, amount }));
  admin = await staffAuth(app, 'admin');
  staff = await staffAuth(app, 'staff');
});

async function customer(phone = '9876543210') {
  const { accessToken, user } = await loginCustomer(app, captureOtps(), phone);
  return { auth: { Authorization: `Bearer ${accessToken}` }, user };
}
const mkPackage = (over = {}) =>
  PartyPackage.create({
    name: 'Birthday Bash',
    slug: 'birthday-bash',
    type: 'birthday',
    pricePerGuest: 45000,
    minGuests: 10,
    maxGuests: 60,
    ...over,
  });
const inquire = (auth, body, k = key()) =>
  request(app)
    .post(api('/party-inquiries'))
    .set(auth)
    .set('Idempotency-Key', k)
    .send({ eventType: 'birthday', eventDate: D(14), guests: 25, ...body });
const quote = (id, body = {}, who = admin) =>
  request(app)
    .patch(api(`/party-inquiries/${id}/quote`))
    .set(who)
    .send({ amount: 1200000, ...body });

async function quoted(c, { date = D(14) } = {}) {
  const res = await inquire(c.auth, { eventDate: date }).expect(201);
  await quote(res.body.data._id).expect(200);
  return res.body.data._id;
}

describe('packages', () => {
  it('public list is cached and filterable; admin manages with RBAC and cache invalidation', async () => {
    await mkPackage();
    const list = await request(app).get(api('/party-packages')).expect(200);
    expect(list.headers['cache-control']).toMatch(/public/);
    expect(list.body.data).toHaveLength(1);
    expect(
      (await request(app).get(api('/party-packages?type=kitty')).expect(200)).body.data,
    ).toHaveLength(0);
    await request(app).get(api('/party-packages/birthday-bash')).expect(200);
    await request(app).get(api('/party-packages/nope')).expect(404);

    const body = {
      name: 'Corporate Lunch',
      type: 'corporate',
      pricePerGuest: 60000,
      minGuests: 20,
      maxGuests: 80,
      inclusions: ['Buffet', 'Projector'],
    };
    await request(app).post(api('/party-packages')).set(staff).send(body).expect(403);
    const created = await request(app)
      .post(api('/party-packages'))
      .set(admin)
      .send(body)
      .expect(201);
    expect(created.body.data.slug).toBe('corporate-lunch');
    expect((await request(app).get(api('/party-packages')).expect(200)).body.data).toHaveLength(2); // cache invalidated
    await request(app)
      .post(api('/party-packages'))
      .set(admin)
      .send({ ...body, name: 'Bad', minGuests: 50, maxGuests: 10 })
      .expect(422);
    await request(app)
      .patch(api(`/party-packages/${created.body.data._id}`))
      .set(admin)
      .send({ pricePerGuest: 55000 })
      .expect(200);
    await request(app)
      .delete(api(`/party-packages/${created.body.data._id}`))
      .set(admin)
      .expect(200);
    expect((await request(app).get(api('/party-packages')).expect(200)).body.data).toHaveLength(1);
  });
});

describe('inquiry', () => {
  it('is created idempotently, alerts staff, and starts the timeline', async () => {
    const pkg = await mkPackage();
    const c = await customer();
    const k = key();
    const body = { packageId: String(pkg._id), requirements: 'Balloons please' };
    const res = await inquire(c.auth, body, k);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'SUBMITTED',
      eventType: 'birthday',
      guests: 25,
      package: { name: 'Birthday Bash' },
    });
    expect(res.body.data.inquiryNumber).toMatch(/^PI-\d{6}-0001$/);
    expect(res.body.data.statusHistory).toHaveLength(1);
    expect(emits.some((e) => e.event === 'party:new' && e.room === 'staff')).toBe(true);
    expect(jobs.find((j) => j.name === 'notify')?.data.title).toBe('Inquiry received');
    const again = await inquire(c.auth, body, k).expect(201);
    expect(again.headers['idempotent-replay']).toBe('true');
    expect(await PartyInquiry.countDocuments()).toBe(1);
  });

  it('validates notice period, package guest range, open-inquiry cap and roles', async () => {
    const pkg = await mkPackage();
    const c = await customer();
    await inquire(c.auth, { eventDate: D(1) }).expect(400);
    await inquire(c.auth, { eventDate: D(400) }).expect(400);
    await inquire(c.auth, { eventDate: 'soon' }).expect(422);
    await inquire(c.auth, { packageId: String(pkg._id), guests: 5 }).expect(400);
    await inquire(c.auth, { packageId: String(pkg._id), guests: 61 }).expect(400);
    await inquire(c.auth, { packageId: '65f0c0ffee0123456789abcd' }).expect(404);
    await request(app)
      .post(api('/party-inquiries'))
      .set(c.auth)
      .send({ eventType: 'birthday', eventDate: D(14), guests: 20 })
      .expect(400); // no Idempotency-Key
    await request(app).post(api('/party-inquiries')).send({}).expect(401);
    await request(app)
      .post(api('/party-inquiries'))
      .set(admin)
      .set('Idempotency-Key', key())
      .send({ eventDate: D(14), guests: 20, eventType: 'other' })
      .expect(403);
    for (let i = 0; i < 5; i++) await inquire(c.auth, { eventDate: D(14 + i) }).expect(201);
    await inquire(c.auth, { eventDate: D(30) }).expect(400);
  });

  it('is private to its owner and staff', async () => {
    const a = await customer('9876543210');
    const b = await customer('9123456780');
    const res = await inquire(a.auth, {}).expect(201);
    await request(app)
      .get(api(`/party-inquiries/${res.body.data._id}`))
      .set(b.auth)
      .expect(404);
    await request(app)
      .get(api(`/party-inquiries/${res.body.data._id}`))
      .set(staff)
      .expect(200);
    expect((await request(app).get(api('/party-inquiries')).set(b.auth)).body.data).toHaveLength(0);
    await request(app).get(api('/party-inquiries/manage')).set(a.auth).expect(403);
    const inbox = await request(app)
      .get(api('/party-inquiries/manage?status=SUBMITTED'))
      .set(staff)
      .expect(200);
    expect(inbox.body.data).toHaveLength(1);
  });
});

describe('quote -> accept -> pay -> confirmed', () => {
  it('walks the full flow with a timeline, reserving the date and confirming on a verified token', async () => {
    const c = await customer();
    const created = await inquire(c.auth, {}).expect(201);
    const id = created.body.data._id;

    await request(app)
      .post(api(`/party-inquiries/${id}/accept`))
      .set(c.auth)
      .expect(409); // nothing to accept yet
    const q = await quote(id, { notes: 'Includes decor' }, staff).expect(200);
    expect(q.body.data).toMatchObject({
      status: 'QUOTED',
      quote: { amount: 1200000, tokenAmount: 300000, version: 1 },
    }); // default 25% token
    expect(jobs.some((j) => j.data.title === 'Your party quote is ready')).toBe(true);

    const accepted = await request(app)
      .post(api(`/party-inquiries/${id}/accept`))
      .set(c.auth)
      .expect(200);
    expect(accepted.body.data).toMatchObject({
      status: 'ACCEPTED',
      dateReserved: true,
      token: { amount: 300000, status: 'pending' },
    });
    expect((await PartyDay.findOne({ date: D(14) })).booked).toBe(1);

    const pay = await request(app)
      .post(api(`/party-inquiries/${id}/pay`))
      .set(c.auth)
      .send({})
      .expect(200);
    expect(pay.body.data).toMatchObject({
      razorpayOrderId: 'order_pt1',
      amount: 300000,
      orderNumber: created.body.data.inquiryNumber,
    });
    await request(app)
      .post(api('/payments/razorpay/verify'))
      .set(c.auth)
      .send({
        razorpay_order_id: 'order_pt1',
        razorpay_payment_id: 'pay_pt1',
        razorpay_signature: 'nope'.repeat(4),
      })
      .expect(400);
    const ok = await request(app)
      .post(api('/payments/razorpay/verify'))
      .set(c.auth)
      .send({
        razorpay_order_id: 'order_pt1',
        razorpay_payment_id: 'pay_pt1',
        razorpay_signature: sig('order_pt1', 'pay_pt1'),
      })
      .expect(200);
    expect(ok.body.data).toMatchObject({
      status: 'paid',
      purpose: 'party',
      orderNumber: created.body.data.inquiryNumber,
    });

    const done = await request(app)
      .get(api(`/party-inquiries/${id}`))
      .set(c.auth)
      .expect(200);
    expect(done.body.data.status).toBe('CONFIRMED');
    expect(done.body.data.token.status).toBe('paid');
    expect(done.body.data.statusHistory.map((h) => h.status)).toEqual([
      'SUBMITTED',
      'QUOTED',
      'ACCEPTED',
      'CONFIRMED',
    ]);
    expect(jobs.some((j) => j.data.title === 'Party confirmed!')).toBe(true);
    await request(app)
      .post(api(`/party-inquiries/${id}/complete`))
      .set(staff)
      .expect(200);
    await request(app)
      .post(api(`/party-inquiries/${id}/complete`))
      .set(staff)
      .expect(409);
  });

  it('re-quoting bumps the version; invalid quotes and wrong roles are rejected', async () => {
    const c = await customer();
    const id = (await inquire(c.auth, {}).expect(201)).body.data._id;
    await quote(id, {}, c.auth).expect(403);
    await quote(id, { amount: 50 }).expect(422);
    await quote(id, { amount: 100000, tokenAmount: 200000 }).expect(422);
    await quote(id, { amount: 1000000 }).expect(200);
    const second = await quote(id, { amount: 900000, validDays: 7 }).expect(200);
    expect(second.body.data.quote).toMatchObject({ amount: 900000, version: 2 });
    await quote('65f0c0ffee0123456789abcd').expect(404);
  });

  it('declining a quote ends the inquiry; accepting an expired quote is refused', async () => {
    const c = await customer();
    const id = await quoted(c);
    await PartyInquiry.updateOne({ _id: id }, { 'quote.validUntil': new Date(Date.now() - 1000) });
    await request(app)
      .post(api(`/party-inquiries/${id}/accept`))
      .set(c.auth)
      .expect(409);
    await partyService.expireOverdue();
    expect((await PartyInquiry.findById(id)).status).toBe('EXPIRED');

    const id2 = await quoted(c, { date: D(20) });
    await request(app)
      .post(api(`/party-inquiries/${id2}/decline`))
      .set(c.auth)
      .expect(200);
    await request(app)
      .post(api(`/party-inquiries/${id2}/decline`))
      .set(c.auth)
      .expect(409);
    expect(await PartyDay.countDocuments()).toBe(0);
  });
});

describe('date capacity (PARTY_MAX_PER_DAY = 2)', () => {
  it('never reserves more parties than the day allows, even under concurrency', async () => {
    const people = [];
    for (const p of ['9876543210', '9123456780', '9000000011', '9000000012', '9000000013'])
      people.push(await customer(p)); // sequential: each login swaps the SMS capture stub
    const ids = [];
    for (const c of people) ids.push(await quoted(c));
    const results = await Promise.allSettled(
      ids.map((id, i) => partyService.accept(id, people[i].user._id)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(
      results.filter((r) => r.status === 'rejected').every((r) => r.reason.statusCode === 409),
    ).toBe(true);
    expect((await PartyDay.findOne({ date: D(14) })).booked).toBe(2);
    expect(await PartyInquiry.countDocuments({ status: 'ACCEPTED' })).toBe(2);
    // losers were rolled back to QUOTED (not half-accepted) and can retry another day later
    expect(await PartyInquiry.countDocuments({ status: 'QUOTED', dateReserved: false })).toBe(3);
  });

  it('a freed date can be taken by someone else (close, cancel and expiry all release)', async () => {
    const [a, b, c, d] = [
      await customer('9876543210'),
      await customer('9123456780'),
      await customer('9000000011'),
      await customer('9000000012'),
    ];
    const [ia, ib, ic, id] = [await quoted(a), await quoted(b), await quoted(c), await quoted(d)];
    await request(app)
      .post(api(`/party-inquiries/${ia}/accept`))
      .set(a.auth)
      .expect(200);
    await request(app)
      .post(api(`/party-inquiries/${ib}/accept`))
      .set(b.auth)
      .expect(200);
    await request(app)
      .post(api(`/party-inquiries/${ic}/accept`))
      .set(c.auth)
      .expect(409);

    await request(app)
      .post(api(`/party-inquiries/${ia}/close`))
      .set(staff)
      .send({ reason: 'Venue maintenance' })
      .expect(200);
    await request(app)
      .post(api(`/party-inquiries/${ic}/accept`))
      .set(c.auth)
      .expect(200);

    await request(app)
      .post(api(`/party-inquiries/${ib}/cancel`))
      .set(b.auth)
      .send({})
      .expect(200);
    await request(app)
      .post(api(`/party-inquiries/${id}/accept`))
      .set(d.auth)
      .expect(200);
    expect((await PartyDay.findOne({ date: D(14) })).booked).toBe(2);

    await PartyInquiry.updateOne({ _id: ic }, { 'token.dueAt': new Date(Date.now() - 1000) });
    expect(await partyService.expireOverdue()).toBe(1);
    expect((await PartyInquiry.findById(ic)).status).toBe('EXPIRED');
    expect((await PartyDay.findOne({ date: D(14) })).booked).toBe(1);
  });
});

describe('token payment edge cases and refunds', () => {
  async function accepted() {
    const c = await customer();
    const id = await quoted(c);
    await request(app)
      .post(api(`/party-inquiries/${id}/accept`))
      .set(c.auth)
      .expect(200);
    return { c, id };
  }
  const pay = (c, id) =>
    request(app)
      .post(api(`/party-inquiries/${id}/pay`))
      .set(c.auth)
      .send({});
  const verify = (c, id2 = 'pay_pt1') =>
    request(app)
      .post(api('/payments/razorpay/verify'))
      .set(c.auth)
      .send({
        razorpay_order_id: 'order_pt1',
        razorpay_payment_id: id2,
        razorpay_signature: sig('order_pt1', id2),
      });

  it('only the owner can pay, and only inside the token window', async () => {
    const { c, id } = await accepted();
    const other = await customer('9000000044');
    await pay(other, id).expect(404);
    await PartyInquiry.updateOne({ _id: id }, { 'token.dueAt': new Date(Date.now() - 1000) });
    await pay(c, id).expect(409);
  });

  it('a token captured after the window lapsed is refunded automatically', async () => {
    const { c, id } = await accepted();
    await pay(c, id).expect(200);
    await PartyInquiry.updateOne({ _id: id }, { 'token.dueAt': new Date(Date.now() - 1000) });
    await partyService.expireOverdue();
    await verify(c).expect(200);
    expect((await PartyInquiry.findById(id)).status).toBe('EXPIRED');
    const job = jobs.find((j) => j.name === 'refund-payment');
    expect(job.data).toEqual({ purpose: 'party', refId: id });
    expect((await refundPayment(job.data)).refunded).toBe(300000);
  });

  it('cancel rules: customers get a refund >7 days out and are blocked inside it; staff choose', async () => {
    const { c, id } = await accepted();
    await pay(c, id).expect(200);
    await verify(c).expect(200);
    await PartyInquiry.updateOne({ _id: id }, { eventDate: D(3) });
    await request(app)
      .post(api(`/party-inquiries/${id}/cancel`))
      .set(c.auth)
      .send({})
      .expect(409);
    await PartyInquiry.updateOne({ _id: id }, { eventDate: D(30) });
    await request(app)
      .post(api(`/party-inquiries/${id}/cancel`))
      .set(c.auth)
      .send({ reason: 'change of plans' })
      .expect(200);
    const job = jobs.find((j) => j.name === 'refund-payment');
    expect(job.data.purpose).toBe('party');
    await refundPayment(job.data);
    expect((await PartyInquiry.findById(id)).token.status).toBe('refunded');
  });

  it('staff can cancel a confirmed party without refunding the token', async () => {
    const { c, id } = await accepted();
    await pay(c, id).expect(200);
    await verify(c).expect(200);
    jobs.length = 0;
    await request(app)
      .post(api(`/party-inquiries/${id}/cancel`))
      .set(staff)
      .send({ refund: false, reason: 'no-show' })
      .expect(200);
    expect(jobs.some((j) => j.name === 'refund-payment')).toBe(false);
    expect((await PartyInquiry.findById(id)).token.status).toBe('paid');
    await request(app)
      .post(api(`/party-inquiries/${id}/cancel`))
      .set(staff)
      .send({})
      .expect(409);
  });
});

describe('maintenance and housekeeping', () => {
  it('expireOverdue is safe to run concurrently (each lapse is processed once)', async () => {
    const c = await customer();
    const id = await quoted(c);
    await request(app)
      .post(api(`/party-inquiries/${id}/accept`))
      .set(c.auth)
      .expect(200);
    await PartyInquiry.updateOne({ _id: id }, { 'token.dueAt': new Date(Date.now() - 1000) });
    const [x, y] = await Promise.all([partyService.expireOverdue(), partyService.expireOverdue()]);
    expect(x + y).toBe(1);
    expect((await PartyDay.findOne({ date: D(14) })).booked).toBe(0);
    expect(new mongoose.Types.ObjectId(id)).toBeTruthy();
  });
});
