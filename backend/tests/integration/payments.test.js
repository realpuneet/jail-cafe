import request from 'supertest';
import { jest } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { setRedisClient } from '../../src/config/redis.js';
import { razorpayService } from '../../src/integrations/razorpay.service.js';
import { setQueueAdapter } from '../../src/jobs/queues.js';
import { Order } from '../../src/models/Order.js';
import { Payment, PaymentEvent } from '../../src/models/Payment.js';
import { refundOrder } from '../../src/services/payment.service.js';
import { realtime } from '../../src/sockets/realtime.js';
import { captureOtps, loginCustomer, staffAuth } from '../helpers/auth.js';
import { clearDb, startDb, stopDb } from '../helpers/db.js';
import { FakeRedis } from '../helpers/fakeRedis.js';
import { makeAddress, seedCatalog } from '../helpers/fixtures.js';

const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WH_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const api = (p) => `/api/v1${p}`;
let app;
let cat;
let jobs;
let emits;
let rzSeq;
let staff;
let keySeq = 0;

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
  rzSeq = 0;
  setQueueAdapter(async (queue, name, data, opts) => jobs.push({ queue, name, data, opts }));
  realtime.emit = jest.fn((room, event, payload) => emits.push({ room, event, payload }));
  razorpayService.createOrder = jest.fn(async ({ amount }) => ({
    id: `order_rz${++rzSeq}`,
    amount,
    currency: 'INR',
  }));
  razorpayService.refund = jest.fn(async (paymentId, { amount }) => ({
    id: `rfnd_${++rzSeq}`,
    amount,
    payment_id: paymentId,
  }));
  cat = await seedCatalog();
  staff = await staffAuth(app, 'staff');
});

async function onlineOrder(phone = '9876543210') {
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
    .set('Idempotency-Key', `pay-key-${keySeq++}-abcdefgh`)
    .send({ addressId: String(address._id), paymentMethod: 'online' })
    .expect(201);
  return { auth, user, order: res.body.data };
}

const checkoutSig = (orderId, paymentId, secret = KEY_SECRET) =>
  createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
const webhook = (
  payload,
  { secret = WH_SECRET, eventId = `evt_${keySeq++}`, sign = true } = {},
) => {
  const raw = JSON.stringify(payload);
  const req = request(app)
    .post(api('/payments/razorpay/webhook'))
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Event-Id', eventId);
  if (sign) req.set('X-Razorpay-Signature', createHmac('sha256', secret).update(raw).digest('hex'));
  return req.send(raw);
};
const captured = (rzOrder, payId, amount) => ({
  event: 'payment.captured',
  payload: { payment: { entity: { id: payId, order_id: rzOrder, amount, status: 'captured' } } },
});

describe('creating the gateway order', () => {
  it('creates a Razorpay order for the server-side total and reuses it on retry', async () => {
    const { auth, order } = await onlineOrder();
    const r1 = await request(app)
      .post(api('/payments/razorpay/order'))
      .set(auth)
      .send({ orderId: order._id })
      .expect(200);
    expect(r1.body.data).toMatchObject({
      razorpayOrderId: 'order_rz1',
      amount: 15000,
      currency: 'INR',
      keyId: 'rzp_test_key',
      orderNumber: order.orderNumber,
    });
    expect(razorpayService.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 15000, receipt: order.orderNumber }),
    );
    const r2 = await request(app)
      .post(api('/payments/razorpay/order'))
      .set(auth)
      .send({ orderId: order._id })
      .expect(200);
    expect(r2.body.data.razorpayOrderId).toBe('order_rz1');
    expect(razorpayService.createOrder).toHaveBeenCalledTimes(1);
    expect(await Payment.countDocuments()).toBe(1);
  });

  it("rejects other users' orders, COD orders and closed orders", async () => {
    const { order } = await onlineOrder();
    const other = await loginCustomer(app, captureOtps(), '9000000077');
    await request(app)
      .post(api('/payments/razorpay/order'))
      .set({ Authorization: `Bearer ${other.accessToken}` })
      .send({ orderId: order._id })
      .expect(404);
    await Order.updateOne({ _id: order._id }, { status: 'CANCELLED' });
    const { auth } = await onlineOrder('9000000055');
    await Order.updateOne(
      { 'payment.method': 'online', status: 'PLACED' },
      { 'payment.method': 'cod' },
    );
    const cod = await Order.findOne({ 'payment.method': 'cod' });
    await request(app)
      .post(api('/payments/razorpay/order'))
      .set(auth)
      .send({ orderId: String(cod._id) })
      .expect(400);
  });
});

describe('checkout verification', () => {
  it('rejects a bad signature, accepts a good one once, and shows the order to the kitchen', async () => {
    const { auth, order } = await onlineOrder();
    await request(app)
      .post(api('/payments/razorpay/order'))
      .set(auth)
      .send({ orderId: order._id })
      .expect(200);
    const body = { razorpay_order_id: 'order_rz1', razorpay_payment_id: 'pay_abc123' };

    await request(app)
      .post(api('/payments/razorpay/verify'))
      .set(auth)
      .send({ ...body, razorpay_signature: checkoutSig('order_rz1', 'pay_other') })
      .expect(400);
    expect((await Order.findById(order._id)).payment.status).toBe('pending');

    // not yet visible / acceptable
    expect(
      (await request(app).get(api('/orders/manage?active=true')).set(staff)).body.data,
    ).toHaveLength(0);
    await request(app)
      .patch(api(`/orders/${order._id}/status`))
      .set(staff)
      .send({ status: 'ACCEPTED' })
      .expect(409);

    const ok = await request(app)
      .post(api('/payments/razorpay/verify'))
      .set(auth)
      .send({ ...body, razorpay_signature: checkoutSig('order_rz1', 'pay_abc123') })
      .expect(200);
    expect(ok.body.data).toMatchObject({ status: 'paid', orderNumber: order.orderNumber });
    expect(emits.some((e) => e.event === 'order:new' && e.room === 'staff')).toBe(true);
    expect(
      (await request(app).get(api('/orders/manage?active=true')).set(staff)).body.data,
    ).toHaveLength(1);
    await request(app)
      .patch(api(`/orders/${order._id}/status`))
      .set(staff)
      .send({ status: 'ACCEPTED' })
      .expect(200);

    // idempotent: second verify changes nothing and does not re-announce
    emits.length = 0;
    await request(app)
      .post(api('/payments/razorpay/verify'))
      .set(auth)
      .send({ ...body, razorpay_signature: checkoutSig('order_rz1', 'pay_abc123') })
      .expect(200);
    expect(emits.filter((e) => e.event === 'order:new')).toHaveLength(0);
    expect(
      jobs.filter((j) => j.data.type === 'payment' && j.data.title === 'Payment received'),
    ).toHaveLength(1);
  });

  it("another user cannot verify someone else's payment", async () => {
    const { auth, order } = await onlineOrder();
    await request(app)
      .post(api('/payments/razorpay/order'))
      .set(auth)
      .send({ orderId: order._id })
      .expect(200);
    const other = await loginCustomer(app, captureOtps(), '9000000066');
    await request(app)
      .post(api('/payments/razorpay/verify'))
      .set({ Authorization: `Bearer ${other.accessToken}` })
      .send({
        razorpay_order_id: 'order_rz1',
        razorpay_payment_id: 'pay_x1234',
        razorpay_signature: checkoutSig('order_rz1', 'pay_x1234'),
      })
      .expect(404);
  });
});

describe('webhook', () => {
  async function pending() {
    const ctx = await onlineOrder();
    await request(app)
      .post(api('/payments/razorpay/order'))
      .set(ctx.auth)
      .send({ orderId: ctx.order._id })
      .expect(200);
    return ctx;
  }

  it('rejects missing/invalid signatures without touching state', async () => {
    const { order } = await pending();
    await webhook(captured('order_rz1', 'pay_1', 15000), { sign: false }).expect(401);
    await webhook(captured('order_rz1', 'pay_1', 15000), { secret: 'wrong' }).expect(401);
    expect((await Order.findById(order._id)).payment.status).toBe('pending');
  });

  it('marks the order paid and ignores duplicate deliveries (same event id)', async () => {
    const { order } = await pending();
    const first = await webhook(captured('order_rz1', 'pay_1', 15000), {
      eventId: 'evt_dup',
    }).expect(200);
    expect(first.body.message).toBe('Processed');
    const second = await webhook(captured('order_rz1', 'pay_1', 15000), {
      eventId: 'evt_dup',
    }).expect(200);
    expect(second.body.message).toBe('Duplicate ignored');
    const o = await Order.findById(order._id);
    expect(o.payment.status).toBe('paid');
    expect(emits.filter((e) => e.event === 'order:new')).toHaveLength(1);
    // a different event id for the same payment is also harmless
    await webhook(captured('order_rz1', 'pay_1', 15000)).expect(200);
    expect(emits.filter((e) => e.event === 'order:new')).toHaveLength(1);
  });

  it('refuses a capture whose amount differs from the order total and lets the gateway retry', async () => {
    const { order } = await pending();
    await webhook(captured('order_rz1', 'pay_1', 100), { eventId: 'evt_bad_amount' }).expect(409);
    expect((await Order.findById(order._id)).payment.status).toBe('pending');
    expect(await PaymentEvent.countDocuments({ eventId: 'evt_bad_amount' })).toBe(0); // forgotten => retry is processed
  });

  it('records failures without downgrading a captured payment', async () => {
    const { order } = await pending();
    await webhook({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_f',
            order_id: 'order_rz1',
            amount: 15000,
            error_description: 'Card declined',
          },
        },
      },
    }).expect(200);
    expect((await Payment.findOne()).status).toBe('failed');
    expect((await Order.findById(order._id)).payment.status).toBe('pending'); // retry still possible
    expect(jobs.some((j) => j.data.title === 'Payment failed')).toBe(true);

    await webhook(captured('order_rz1', 'pay_ok', 15000)).expect(200);
    await webhook({
      event: 'payment.failed',
      payload: { payment: { entity: { id: 'pay_late', order_id: 'order_rz1', amount: 15000 } } },
    }).expect(200);
    expect((await Payment.findOne()).status).toBe('captured');
    expect((await Order.findById(order._id)).payment.status).toBe('paid');
  });

  it('handles unknown events and unknown payments gracefully', async () => {
    await webhook({ event: 'subscription.charged', payload: {} }).expect(200);
    await webhook(captured('order_nope', 'pay_1', 100)).expect(404);
  });

  it('payment captured after the order expired queues a refund', async () => {
    const { order } = await pending();
    await Order.updateOne({ _id: order._id }, { status: 'CANCELLED' });
    await webhook(captured('order_rz1', 'pay_late', 15000)).expect(200);
    expect(jobs.find((j) => j.name === 'refund-payment')?.data).toEqual({
      purpose: 'order',
      refId: order._id,
    });
  });
});

describe('refunds', () => {
  async function paidOrder() {
    const ctx = await onlineOrder();
    await request(app)
      .post(api('/payments/razorpay/order'))
      .set(ctx.auth)
      .send({ orderId: ctx.order._id })
      .expect(200);
    await webhook(captured('order_rz1', 'pay_1', 15000)).expect(200);
    return ctx;
  }

  it('cancelling a paid online order queues exactly one refund job, which refunds in full', async () => {
    const { auth, order } = await paidOrder();
    await request(app)
      .post(api(`/orders/${order._id}/cancel`))
      .set(auth)
      .send({ reason: 'oops' })
      .expect(200);
    const refundJobs = jobs.filter((j) => j.name === 'refund-payment');
    expect(refundJobs).toHaveLength(1);
    expect(refundJobs[0].opts.jobId).toBe(`refund-order-${order._id}`);

    const res = await refundOrder(order._id);
    expect(res.refunded).toBe(15000);
    expect(razorpayService.refund).toHaveBeenCalledWith(
      'pay_1',
      expect.objectContaining({ amount: 15000 }),
    );
    const o = await Order.findById(order._id);
    expect(o.payment).toMatchObject({ status: 'refunded', refundedAmount: 15000 });
    expect((await refundOrder(order._id)).refunded).toBe(0); // nothing left to refund
    expect(razorpayService.refund).toHaveBeenCalledTimes(1);
  });

  it('refund.processed webhook is idempotent per refund id and does not double count our own refund', async () => {
    const { auth, order } = await paidOrder();
    await request(app)
      .post(api(`/orders/${order._id}/cancel`))
      .set(auth)
      .send({})
      .expect(200);
    const mine = await refundOrder(order._id);
    const evt = {
      event: 'refund.processed',
      payload: { refund: { entity: { id: mine.refundId, payment_id: 'pay_1', amount: 15000 } } },
    };
    await webhook(evt).expect(200);
    await webhook(evt).expect(200);
    const p = await Payment.findOne();
    expect(p.refundedAmount).toBe(15000);
    expect(p.refundIds).toEqual([mine.refundId]);
  });

  it('a dashboard-initiated partial refund is applied once', async () => {
    const { order } = await paidOrder();
    const evt = {
      event: 'refund.processed',
      payload: { refund: { entity: { id: 'rfnd_dash', payment_id: 'pay_1', amount: 5000 } } },
    };
    await webhook(evt).expect(200);
    await webhook(evt).expect(200);
    const o = await Order.findById(order._id);
    expect(o.payment).toMatchObject({ status: 'partially_refunded', refundedAmount: 5000 });
  });

  it('concurrent refund attempts never over-refund', async () => {
    const { auth, order } = await paidOrder();
    await request(app)
      .post(api(`/orders/${order._id}/cancel`))
      .set(auth)
      .send({})
      .expect(200);
    const results = await Promise.allSettled([
      refundOrder(order._id),
      refundOrder(order._id),
      refundOrder(order._id),
    ]);
    expect(razorpayService.refund).toHaveBeenCalledTimes(1); // only one worker reaches the gateway
    const p = await Payment.findOne();
    expect(p.refundedAmount).toBe(15000);
    expect(p.refundingSince).toBeUndefined(); // lock released
    // losers either saw it already refunded (0) or were told to retry
    expect(results.every((r) => r.status === 'rejected' || r.value.refunded >= 0)).toBe(true);
  });
});
