import mongoose from 'mongoose';
import { Coupon, CouponRedemption, CouponUsage } from '../models/Coupon.js';
import { ApiError } from '../utils/ApiError.js';
import { cached, invalidate } from '../utils/cache.js';
import { CACHE_TTL, DISCOUNT_TYPES } from '../utils/constants.js';
import { paginate } from '../utils/pagination.js';

const inr = (paise) => `Rs ${(paise / 100).toFixed(0)}`;

/**
 * Pure rule engine. Throws a 400 with a user-facing reason, or returns the discount in paise.
 * @param {object} coupon
 * @param {{subtotal: number, userUses?: number, now?: Date}} ctx subtotal in paise
 * @returns {number} discount in paise (never more than subtotal)
 */
export function evaluateCoupon(coupon, { subtotal, userUses = 0, now = new Date() }) {
  const fail = (msg) => {
    throw ApiError.badRequest(msg);
  };
  if (!coupon || !coupon.isActive) fail('Invalid coupon code');
  if (coupon.startsAt && now < new Date(coupon.startsAt)) fail('This coupon is not active yet');
  if (coupon.expiresAt && now >= new Date(coupon.expiresAt)) fail('This coupon has expired');
  if (coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit) {
    fail('This coupon has been fully redeemed');
  }
  if (userUses >= (coupon.perUserLimit ?? 1)) fail('You have already used this coupon');
  if (subtotal < (coupon.minOrderAmount ?? 0)) {
    fail(`Add items worth ${inr(coupon.minOrderAmount - subtotal)} more to use this coupon`);
  }

  let discount =
    coupon.type === DISCOUNT_TYPES.PERCENT
      ? Math.floor((subtotal * coupon.value) / 100)
      : coupon.value;
  if (coupon.type === DISCOUNT_TYPES.PERCENT && coupon.maxDiscount !== undefined) {
    discount = Math.min(discount, coupon.maxDiscount);
  }
  return Math.min(discount, subtotal);
}

/** Cached lookup by code (short TTL: usedCount changes). @param {string} code */
const findByCode = (code) =>
  cached('coupons', ['code', code], CACHE_TTL.COUPONS, () => Coupon.findOne({ code }).lean());

/**
 * Validate a code for a cart. Authoritative `usedCount` is re-read from the DB.
 * @param {string} userId
 * @param {string} code uppercase code
 * @param {number} subtotal paise
 */
export async function validate(userId, code, subtotal) {
  const cachedCoupon = await findByCode(code);
  if (!cachedCoupon) throw ApiError.badRequest('Invalid coupon code');
  const [fresh, usage] = await Promise.all([
    Coupon.findById(cachedCoupon._id).lean(),
    CouponUsage.findOne({ couponId: cachedCoupon._id, userId }, 'count').lean(),
  ]);
  const discount = evaluateCoupon(fresh, { subtotal, userUses: usage?.count ?? 0 });
  return { code: fresh.code, description: fresh.description, discount, couponId: fresh._id };
}

/**
 * Atomically redeem a coupon for an order (call from the order transaction flow in Phase 3).
 * Idempotent per (coupon, order). Enforces total and per-user limits under concurrency.
 * @param {{couponId: string, userId: string, orderId: string, discount: number}} p
 */
export async function redeem({ couponId, userId, orderId, discount }) {
  const existing = await CouponRedemption.findOne({ couponId, orderId }).lean();
  if (existing) return existing;

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const coupon = await Coupon.findOneAndUpdate(
        {
          _id: couponId,
          isActive: true,
          $or: [
            { usageLimit: { $exists: false } },
            { $expr: { $lt: ['$usedCount', '$usageLimit'] } },
          ],
        },
        { $inc: { usedCount: 1 } },
        { session, returnDocument: 'after', projection: 'perUserLimit' },
      );
      if (!coupon) throw ApiError.badRequest('This coupon has been fully redeemed');

      try {
        await CouponUsage.findOneAndUpdate(
          { couponId, userId, count: { $lt: coupon.perUserLimit ?? 1 } },
          { $inc: { count: 1 } },
          { session, upsert: true },
        );
      } catch (err) {
        if (err.code === 11000) throw ApiError.badRequest('You have already used this coupon');
        throw err;
      }
      [result] = await CouponRedemption.create([{ couponId, userId, orderId, discount }], {
        session,
      });
    });
    await invalidate('coupons');
    return result.toObject();
  } finally {
    await session.endSession();
  }
}

/** Public "available offers". */
export const listPublic = () =>
  cached('coupons', ['public'], CACHE_TTL.COUPONS, async () => {
    const now = new Date();
    return Coupon.find(
      {
        isActive: true,
        isPublic: true,
        $and: [
          { $or: [{ startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
          { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] },
        ],
      },
      'code description type value maxDiscount minOrderAmount expiresAt',
    ).lean();
  });

export const listAdmin = (q) => paginate(Coupon, { limit: q.limit, cursor: q.cursor });

function assertValue(c) {
  if (c.type === DISCOUNT_TYPES.PERCENT && c.value > 100) {
    throw ApiError.validation('Percent coupons cannot exceed 100');
  }
  if (c.startsAt && c.expiresAt && new Date(c.startsAt) >= new Date(c.expiresAt)) {
    throw ApiError.validation('expiresAt must be after startsAt');
  }
}

export async function create(input) {
  assertValue(input);
  const doc = await Coupon.create(input);
  await invalidate('coupons');
  return doc.toObject();
}

export async function update(id, patch) {
  const current = await Coupon.findById(id).lean();
  if (!current) throw ApiError.notFound('Coupon not found');
  assertValue({ ...current, ...patch });
  const doc = await Coupon.findByIdAndUpdate(
    id,
    { $set: patch },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  await invalidate('coupons');
  return doc;
}

export async function remove(id) {
  const doc = await Coupon.findByIdAndUpdate(id, { $set: { isActive: false } }).lean();
  if (!doc) throw ApiError.notFound('Coupon not found');
  await invalidate('coupons');
}
