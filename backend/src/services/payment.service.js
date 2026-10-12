import { env } from '../config/env.js';
import { razorpayService } from '../integrations/razorpay.service.js';
import { GATEWAY_STATUS, Payment, PaymentEvent } from '../models/Payment.js';
import { Order } from '../models/Order.js';
import { enqueue } from '../jobs/queues.js';
import { ApiError } from '../utils/ApiError.js';
import {
  JOBS,
  ORDER_STATUS as S,
  PAYMENT_METHOD,
  PAYMENT_PURPOSE,
  PAYMENT_STATUS,
  QUEUES,
} from '../utils/constants.js';
import { logger } from '../utils/logger.js';
import { verifyCheckoutSignature, verifyWebhookSignature } from '../utils/razorpaySignature.js';
import { announceNewOrder, announcePayment, isKitchenVisible } from './orderEvents.js';
import * as notifications from './notification.service.js';

/**
 * Create (or reuse) the Razorpay order for one of the user's unpaid online orders.
 * @param {string} userId
 * @param {string} orderId
 */
export async function createGatewayOrder(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, userId }).lean();
  if (!order) throw ApiError.notFound('Order not found');
  if (order.payment.method !== PAYMENT_METHOD.ONLINE)
    throw ApiError.badRequest('This order is not an online-payment order');
  if (order.status !== S.PLACED) throw ApiError.conflict(`Order is ${order.status.toLowerCase()}`);
  if (order.payment.status === PAYMENT_STATUS.PAID)
    throw ApiError.conflict('Order is already paid');

  let payment = await Payment.findOne({
    purpose: PAYMENT_PURPOSE.ORDER,
    refId: order._id,
    status: { $in: [GATEWAY_STATUS.CREATED, GATEWAY_STATUS.FAILED] },
  }).sort({ _id: -1 });
  if (!payment) {
    const rz = await razorpayService.createOrder({
      amount: order.pricing.total,
      receipt: order.orderNumber,
      notes: { orderId: String(order._id), purpose: PAYMENT_PURPOSE.ORDER },
    });
    payment = await Payment.create({
      purpose: PAYMENT_PURPOSE.ORDER,
      refId: order._id,
      userId,
      providerOrderId: rz.id,
      amount: order.pricing.total,
      currency: rz.currency ?? 'INR',
    });
  }
  return {
    keyId: razorpayService.keyId(),
    razorpayOrderId: payment.providerOrderId,
    amount: payment.amount,
    currency: payment.currency,
    orderNumber: order.orderNumber,
    name: env.CAFE_NAME,
  };
}

/**
 * Mark a gateway payment captured and the order paid. Safe to call many times
 * (checkout callback, webhook, retries): only the first call changes state.
 * @param {{providerOrderId: string, providerPaymentId: string, amount?: number}} p
 * @returns {Promise<{changed: boolean, order: object|null}>}
 */
export async function markCaptured({ providerOrderId, providerPaymentId, amount }) {
  const payment = await Payment.findOne({ providerOrderId }).lean();
  if (!payment) throw ApiError.notFound('Payment not found');
  if (amount !== undefined && amount !== payment.amount) {
    logger.error(
      { providerOrderId, expected: payment.amount, got: amount },
      'payment amount mismatch, ignoring capture',
    );
    throw ApiError.conflict('Payment amount mismatch');
  }

  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $ne: GATEWAY_STATUS.CAPTURED } },
    {
      $set: {
        status: GATEWAY_STATUS.CAPTURED,
        providerPaymentId,
        capturedAt: new Date(),
        failureReason: null,
      },
    },
    { returnDocument: 'after' },
  ).lean();
  if (!claimed) return { changed: false, order: await Order.findById(payment.refId).lean() };

  const order = await Order.findOneAndUpdate(
    {
      _id: payment.refId,
      'payment.status': { $in: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.FAILED] },
    },
    { $set: { 'payment.status': PAYMENT_STATUS.PAID, 'payment.paidAt': new Date() } },
    { returnDocument: 'after' },
  ).lean();
  if (!order) return { changed: true, order: await Order.findById(payment.refId).lean() };

  if (order.status === S.CANCELLED || order.status === S.REJECTED) {
    // Paid after the order was closed (e.g. expired): give the money back.
    await enqueue(
      QUEUES.PAYMENTS,
      JOBS.REFUND_ORDER,
      { orderId: String(order._id) },
      { jobId: `refund-${order._id}` },
    );
    return { changed: true, order };
  }
  announcePayment(order);
  if (isKitchenVisible(order)) announceNewOrder(order);
  await notifications.notify(
    order.userId,
    {
      type: 'payment',
      title: 'Payment received',
      body: `We received Rs ${order.pricing.total / 100} for order ${order.orderNumber}.`,
      data: { orderId: String(order._id) },
    },
    { dedupeId: `payment-${order._id}` },
  );
  return { changed: true, order };
}

/**
 * Checkout callback verification (frontend posts the three Razorpay fields).
 * @param {string} userId
 * @param {{razorpay_order_id: string, razorpay_payment_id: string, razorpay_signature: string}} body
 */
export async function verifyCheckout(userId, body) {
  const payment = await Payment.findOne({ providerOrderId: body.razorpay_order_id, userId }).lean();
  if (!payment) throw ApiError.notFound('Payment not found');
  const ok = verifyCheckoutSignature(
    {
      orderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
    },
    env.RAZORPAY_KEY_SECRET,
  );
  if (!ok) throw ApiError.badRequest('Payment signature verification failed');
  const { order } = await markCaptured({
    providerOrderId: body.razorpay_order_id,
    providerPaymentId: body.razorpay_payment_id,
  });
  return { status: 'paid', orderId: String(order._id), orderNumber: order.orderNumber };
}

async function markFailed({ providerOrderId, reason }) {
  const payment = await Payment.findOneAndUpdate(
    { providerOrderId, status: { $in: [GATEWAY_STATUS.CREATED, GATEWAY_STATUS.FAILED] } },
    { $set: { status: GATEWAY_STATUS.FAILED, failureReason: reason?.slice(0, 300) } },
    { returnDocument: 'after' },
  ).lean();
  if (!payment) return; // already captured (or unknown): never downgrade
  const order = await Order.findById(payment.refId, 'userId orderNumber').lean();
  if (order) {
    await notifications.notify(
      order.userId,
      {
        type: 'payment',
        title: 'Payment failed',
        body: `Your payment for order ${order.orderNumber} did not go through. You can retry from My Orders.`,
        data: { orderId: String(order._id) },
      },
      { dedupeId: `payfail-${payment._id}` },
    );
  }
}

/**
 * Record one gateway refund exactly once (webhook and our own refund call may both report it).
 * @param {{providerPaymentId: string, refundId: string, amount: number}} p
 */
async function recordRefund({ providerPaymentId, refundId, amount }) {
  const payment = await Payment.findOneAndUpdate(
    { providerPaymentId, refundIds: { $ne: refundId } },
    { $addToSet: { refundIds: refundId }, $inc: { refundedAmount: amount } },
    { returnDocument: 'after' },
  ).lean();
  if (!payment) return; // already recorded
  const full = payment.refundedAmount >= payment.amount;
  await Payment.updateOne(
    { _id: payment._id },
    { $set: { status: full ? GATEWAY_STATUS.REFUNDED : GATEWAY_STATUS.PARTIALLY_REFUNDED } },
  );
  const order = await Order.findByIdAndUpdate(
    payment.refId,
    {
      $set: {
        'payment.refundedAmount': payment.refundedAmount,
        'payment.status': full ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.PARTIALLY_REFUNDED,
      },
    },
    { returnDocument: 'after' },
  ).lean();
  if (order) {
    announcePayment(order);
    await notifications.notify(
      order.userId,
      {
        type: 'payment',
        title: 'Refund processed',
        body: `Rs ${amount / 100} for order ${order.orderNumber} is on its way back to you.`,
        data: { orderId: String(order._id) },
      },
      { dedupeId: `refund-notice-${refundId}` },
    );
  }
}

/**
 * Razorpay webhook. Authenticity: HMAC over the RAW body. Idempotency: event id stored once.
 * Duplicate deliveries are acknowledged without side effects.
 * @param {Buffer} rawBody
 * @param {{signature?: string, eventId?: string}} headers
 * @returns {Promise<{duplicate: boolean}>}
 */
export async function handleWebhook(rawBody, { signature, eventId }) {
  if (!verifyWebhookSignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET)) {
    throw ApiError.unauthorized('Invalid webhook signature');
  }
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw ApiError.badRequest('Malformed webhook body');
  }
  const id =
    eventId ??
    `${event.event}:${event.payload?.payment?.entity?.id ?? event.payload?.refund?.entity?.id ?? event.created_at}`;

  try {
    await PaymentEvent.create({ eventId: id, type: event.event });
  } catch (err) {
    if (err.code === 11000) return { duplicate: true };
    throw err;
  }

  try {
    const pay = event.payload?.payment?.entity;
    switch (event.event) {
      case 'payment.captured':
      case 'order.paid':
        if (pay)
          await markCaptured({
            providerOrderId: pay.order_id,
            providerPaymentId: pay.id,
            amount: pay.amount,
          });
        break;
      case 'payment.failed':
        if (pay) await markFailed({ providerOrderId: pay.order_id, reason: pay.error_description });
        break;
      case 'refund.processed': {
        const refund = event.payload?.refund?.entity;
        if (refund)
          await recordRefund({
            providerPaymentId: refund.payment_id,
            refundId: refund.id,
            amount: refund.amount,
          });
        break;
      }
      default:
        logger.debug({ type: event.event }, 'ignored razorpay event');
    }
  } catch (err) {
    // Let Razorpay retry: forget the event so the next delivery is processed.
    await PaymentEvent.deleteOne({ eventId: id });
    throw err;
  }
  return { duplicate: false };
}

const REFUND_LOCK_MS = 2 * 60 * 1000;

/**
 * Refund the remaining amount of an order's captured payment (job handler; retried on failure).
 * @param {string} orderId
 */
export async function refundOrder(orderId) {
  const staleLock = new Date(Date.now() - REFUND_LOCK_MS);
  // Claim: only one worker at a time may call the gateway for a given payment.
  const payment = await Payment.findOneAndUpdate(
    {
      purpose: PAYMENT_PURPOSE.ORDER,
      refId: orderId,
      status: { $in: [GATEWAY_STATUS.CAPTURED, GATEWAY_STATUS.PARTIALLY_REFUNDED] },
      $or: [
        { refundingSince: { $exists: false } },
        { refundingSince: null },
        { refundingSince: { $lt: staleLock } },
      ],
    },
    { $set: { refundingSince: new Date() } },
    { returnDocument: 'after' },
  ).lean();

  if (!payment) {
    const busy = await Payment.exists({
      purpose: PAYMENT_PURPOSE.ORDER,
      refId: orderId,
      refundingSince: { $gte: staleLock },
    });
    if (busy) throw new Error('refund already in progress, will retry'); // BullMQ retries with backoff
    return { refunded: 0 };
  }

  try {
    const remaining = payment.amount - payment.refundedAmount;
    if (remaining <= 0) return { refunded: 0 };
    const refund = await razorpayService.refund(payment.providerPaymentId, {
      amount: remaining,
      notes: { orderId: String(orderId) },
    });
    await recordRefund({
      providerPaymentId: payment.providerPaymentId,
      refundId: refund.id,
      amount: refund.amount ?? remaining,
    });
    return { refunded: refund.amount ?? remaining, refundId: refund.id };
  } finally {
    await Payment.updateOne({ _id: payment._id }, { $unset: { refundingSince: 1 } });
  }
}
