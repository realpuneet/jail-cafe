import mongoose from 'mongoose';
import { DISCOUNT_TYPES } from '../utils/constants.js';

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: /^[A-Z0-9_-]{3,20}$/,
    },
    description: { type: String, trim: true, maxlength: 200 },
    type: { type: String, enum: Object.values(DISCOUNT_TYPES), required: true },
    value: { type: Number, required: true, min: 1 }, // percent (1-100) or flat paise
    maxDiscount: { type: Number, min: 0 }, // paise cap for percent coupons
    minOrderAmount: { type: Number, min: 0, default: 0 }, // paise
    startsAt: { type: Date },
    expiresAt: { type: Date },
    usageLimit: { type: Number, min: 1 }, // total redemptions
    perUserLimit: { type: Number, min: 1, default: 1 },
    usedCount: { type: Number, min: 0, default: 0 },
    isPublic: { type: Boolean, default: false }, // shown in "available offers"
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

couponSchema.index({ code: 1 }, { unique: true });
// "Available offers" list.
couponSchema.index({ isActive: 1, isPublic: 1, expiresAt: 1 });

/** One doc per successful use (audit trail + idempotent redemption per order). */
const redemptionSchema = new mongoose.Schema(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    discount: { type: Number, required: true, min: 0 }, // paise
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// A given order can redeem a coupon only once (idempotent retries).
redemptionSchema.index({ couponId: 1, orderId: 1 }, { unique: true });

/** Atomic per-user usage counter (upserted in the redeem transaction). */
const usageSchema = new mongoose.Schema({
  couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  count: { type: Number, default: 0, min: 0 },
});
// Also the guard: an upsert whose filter fails on `count` collides here => limit reached.
usageSchema.index({ couponId: 1, userId: 1 }, { unique: true });

export const Coupon = mongoose.models.Coupon ?? mongoose.model('Coupon', couponSchema);
export const CouponRedemption =
  mongoose.models.CouponRedemption ?? mongoose.model('CouponRedemption', redemptionSchema);
export const CouponUsage =
  mongoose.models.CouponUsage ?? mongoose.model('CouponUsage', usageSchema);
