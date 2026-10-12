import mongoose from 'mongoose';
import { Address } from '../models/Address.js';
import { Cart } from '../models/Cart.js';
import { nextSeq } from '../models/Counter.js';
import { Order } from '../models/Order.js';
import { User } from '../models/User.js';
import { countEvent } from '../utils/metrics.js';
import { ApiError } from '../utils/ApiError.js';
import {
  ORDER_ACTIVE_STATUSES,
  ORDER_STATUS as S,
  ORDER_TYPE,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  ROLES,
} from '../utils/constants.js';
import { assertTransition } from '../utils/orderStateMachine.js';
import { paginate } from '../utils/pagination.js';
import { assertAcceptingOrders } from './settings.service.js';
import { queueRefund } from './payment.service.js';
import * as couponService from './coupon.service.js';
import * as deliveryZones from './deliveryZone.service.js';
import {
  announceAssignment,
  announceNewOrder,
  announceStatus,
  isKitchenVisible,
} from './orderEvents.js';
import { computeTotals, priceLines } from './pricing.service.js';

const STAFF = [ROLES.ADMIN, ROLES.STAFF];
const IST_OFFSET_MS = 5.5 * 3600 * 1000;

/** JKC-YYMMDD-0001 (date in IST, sequence resets daily). */
async function makeOrderNumber(now = new Date()) {
  const d = new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(2, 10).replaceAll('-', '');
  const seq = await nextSeq(`order:${d}`, { ttlSeconds: 3 * 86400 });
  return `JKC-${d}-${String(seq).padStart(4, '0')}`;
}

/**
 * Build everything needed to place (or preview) an order from the user's cart.
 * Prices are recomputed here from the menu, delivery rules and coupon rules.
 */
async function buildCheckout(userId, { type = ORDER_TYPE.DELIVERY, addressId }) {
  const cart = await Cart.findOne({ userId }).lean();
  if (!cart?.items?.length) throw ApiError.badRequest('Your cart is empty');

  const lines = await priceLines(cart.items, { strict: true });
  const subtotal = lines.reduce((n, l) => n + l.lineTotal, 0);

  let address;
  let delivery;
  let deliveryCharge = 0;
  if (type === ORDER_TYPE.DELIVERY) {
    if (!addressId) throw ApiError.validation('A delivery address is required');
    address = await Address.findOne({ _id: addressId, userId }).lean();
    if (!address) throw ApiError.notFound('Address not found');
    const [lng, lat] = address.location?.coordinates ?? [];
    const quote = await deliveryZones.quote({ pincode: address.pincode, lat, lng, subtotal });
    if (subtotal < quote.minOrderAmount) {
      throw ApiError.badRequest(`Minimum order for your area is Rs ${quote.minOrderAmount / 100}`);
    }
    deliveryCharge = quote.deliveryCharge;
    delivery = {
      zoneId: quote.zoneId,
      zoneName: quote.zoneName,
      estimatedMinutes: quote.estimatedMinutes,
      distanceKm: quote.distanceKm,
    };
  }

  let coupon;
  let discount = 0;
  if (cart.couponCode) {
    const { coupon: c, userUses } = await couponService.loadForUser(cart.couponCode, userId);
    discount = couponService.evaluateCoupon(c, { subtotal, userUses });
    coupon = { couponId: c._id, code: c.code, discount };
  }

  const pricing = computeTotals({ lines, discount, deliveryCharge });
  return { lines, address, delivery, coupon, pricing, type };
}

/** Checkout summary for the UI (no side effects). */
export async function preview(userId, input) {
  const { lines, delivery, coupon, pricing, type } = await buildCheckout(userId, input);
  return { type, items: lines, delivery, coupon, pricing };
}

const toSnapshot = (l) => ({
  menuItemId: l.menuItemId,
  name: l.name,
  isVeg: l.isVeg,
  variantId: l.variantId,
  variantName: l.variantName,
  addOns: l.addOns,
  unitPrice: l.unitPrice,
  quantity: l.quantity,
  lineTotal: l.lineTotal,
  taxPercent: l.taxPercent,
  note: l.note,
});

/**
 * Place an order from the cart. Atomic: order + coupon redemption + cart clear commit together.
 * Idempotent per (user, idempotencyKey).
 * @param {string} userId
 * @param {{type?: string, addressId?: string, paymentMethod: string, note?: string}} input
 * @param {string} [idempotencyKey]
 */
export async function placeOrder(userId, input, idempotencyKey) {
  await assertAcceptingOrders();
  if (idempotencyKey) {
    const existing = await Order.findOne({ userId, idempotencyKey }).lean();
    if (existing) return { order: existing, replayed: true };
  }

  const checkout = await buildCheckout(userId, input);
  const { lines, address, delivery, coupon, pricing, type } = checkout;
  const orderId = new mongoose.Types.ObjectId();
  const orderNumber = await makeOrderNumber();
  const online = input.paymentMethod === PAYMENT_METHOD.ONLINE;

  const doc = {
    _id: orderId,
    orderNumber,
    userId,
    type,
    items: lines.map(toSnapshot),
    address: address && {
      name: address.name,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      landmark: address.landmark,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      location: address.location,
    },
    pricing,
    coupon,
    delivery,
    payment: {
      method: input.paymentMethod,
      status: online ? PAYMENT_STATUS.PENDING : PAYMENT_STATUS.COD_PENDING,
    },
    status: S.PLACED,
    statusHistory: [{ status: S.PLACED, by: userId, role: ROLES.CUSTOMER }],
    note: input.note,
    idempotencyKey,
  };

  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      [order] = await Order.create([doc], { session });
      if (coupon) {
        await couponService.redeem({
          couponId: coupon.couponId,
          userId,
          orderId,
          discount: coupon.discount,
          session,
        });
      }
      await Cart.deleteOne({ userId }, { session });
    });
  } catch (err) {
    if (err.code === 11000 && idempotencyKey) {
      const existing = await Order.findOne({ userId, idempotencyKey }).lean();
      if (existing) return { order: existing, replayed: true };
    }
    throw err;
  } finally {
    await session.endSession();
  }

  countEvent('order_placed');
  const plain = order.toObject();
  if (isKitchenVisible(plain)) announceNewOrder(plain);
  announceStatus(plain);
  return { order: plain, replayed: false };
}

/** Load an order if the actor may see it. */
export async function getForActor(orderId, actor) {
  const order = await Order.findById(orderId).lean();
  const own = order && String(order.userId) === actor.id;
  const rider =
    order && order.riderId && String(order.riderId) === actor.id && actor.role === ROLES.RIDER;
  if (!order || !(own || rider || STAFF.includes(actor.role)))
    throw ApiError.notFound('Order not found');
  return order;
}

/** My orders, newest first. */
export const listMine = (userId, q) =>
  paginate(Order, {
    filter: { userId },
    projection: '-statusHistory',
    limit: q.limit,
    cursor: q.cursor,
  });

/**
 * Live board / history for staff. Hides unpaid online orders by default.
 * @param {{status?: string[], includeUnpaid?: boolean, active?: boolean, limit?: number, cursor?: string}} q
 */
export function listForStaff(q) {
  const filter = {};
  if (q.status?.length) filter.status = { $in: q.status };
  else if (q.active) filter.status = { $in: ORDER_ACTIVE_STATUSES };
  if (!q.includeUnpaid)
    filter.$or = [
      { 'payment.method': PAYMENT_METHOD.COD },
      { 'payment.status': PAYMENT_STATUS.PAID },
    ];
  return paginate(Order, { filter, limit: q.limit, cursor: q.cursor });
}

/** Rider's active deliveries. */
export const listForRider = (riderId) =>
  Order.find({ riderId, status: { $in: [S.READY, S.OUT_FOR_DELIVERY] } })
    .sort({ _id: -1 })
    .limit(50)
    .lean();

/**
 * Move an order through the state machine. Atomic compare-and-set on the current status.
 * @param {string} orderId
 * @param {string} to target status
 * @param {{id: string, role: string}} actor
 * @param {{note?: string}} [opts]
 */
export async function updateStatus(orderId, to, actor, { note } = {}) {
  const order = await getForActor(orderId, actor);
  assertTransition(order, to, actor.role);
  if (to === S.ACCEPTED && !isKitchenVisible(order)) {
    throw ApiError.conflict('Order is awaiting payment');
  }
  if (actor.role === ROLES.RIDER && String(order.riderId) !== actor.id) throw ApiError.forbidden();

  const set = { status: to };
  if (to === S.DELIVERED) {
    set.deliveredAt = new Date();
    if (order.payment.method === PAYMENT_METHOD.COD) {
      set['payment.status'] = PAYMENT_STATUS.PAID; // cash collected on delivery
      set['payment.paidAt'] = new Date();
    }
  }
  if ((to === S.CANCELLED || to === S.REJECTED) && note) set.cancelReason = note;

  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: order.status },
    {
      $set: set,
      $push: {
        statusHistory: { status: to, at: new Date(), by: actor.id, role: actor.role, note },
      },
    },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) throw ApiError.conflict('Order was updated by someone else, please refresh');

  if (to === S.CANCELLED || to === S.REJECTED) await onOrderClosed(updated);
  announceStatus(updated);
  return updated;
}

/** Give back the coupon and queue a refund for paid online orders. */
async function onOrderClosed(order) {
  if (order.coupon?.couponId) await couponService.release({ orderId: order._id });
  if (
    order.payment.method === PAYMENT_METHOD.ONLINE &&
    order.payment.status === PAYMENT_STATUS.PAID
  ) {
    await queueRefund('order', order._id);
  }
}

/** Assign a rider to a delivery order (staff). */
export async function assignRider(orderId, riderId) {
  const rider = await User.findOne(
    { _id: riderId, role: ROLES.RIDER, isActive: true },
    '_id',
  ).lean();
  if (!rider) throw ApiError.badRequest('Rider not found');
  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      type: ORDER_TYPE.DELIVERY,
      status: { $in: [S.ACCEPTED, S.PREPARING, S.READY, S.OUT_FOR_DELIVERY] },
    },
    { $set: { riderId } },
    { returnDocument: 'after' },
  ).lean();
  if (!order) throw ApiError.conflict('Order cannot be assigned right now');
  announceAssignment(order);
  announceStatus(order, { notifyCustomer: false });
  return order;
}

/**
 * Cancel unpaid online orders older than `olderThanMinutes` (called by the maintenance job).
 * @returns {Promise<number>} cancelled count
 */
export async function expireUnpaidOrders(olderThanMinutes, limit = 200) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const stale = await Order.find(
    { 'payment.status': PAYMENT_STATUS.PENDING, status: S.PLACED, createdAt: { $lt: cutoff } },
    '_id',
  )
    .limit(limit)
    .lean();
  let cancelled = 0;
  for (const { _id } of stale) {
    try {
      await updateStatus(
        _id,
        S.CANCELLED,
        { id: 'system', role: ROLES.ADMIN },
        { note: 'Payment not completed in time' },
      );
      cancelled += 1;
    } catch {
      // raced with a payment or another transition; skip
    }
  }
  return cancelled;
}
