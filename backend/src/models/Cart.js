import mongoose from 'mongoose';
import { CART } from '../utils/constants.js';

const lineSchema = new mongoose.Schema({
  // Identity of the (item, variant, add-ons, note) combination; lets adds merge atomically.
  lineKey: { type: String, required: true },
  menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  variantId: { type: mongoose.Schema.Types.ObjectId },
  addOnIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  quantity: { type: Number, required: true, min: 1, max: CART.MAX_QTY_PER_LINE },
  note: { type: String, trim: true, maxlength: 140 },
});

const cartSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: {
      type: [lineSchema],
      default: [],
      validate: {
        validator: (v) => v.length <= CART.MAX_LINES,
        message: `At most ${CART.MAX_LINES} lines`,
      },
    },
    couponCode: { type: String, uppercase: true, trim: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// One cart per user.
cartSchema.index({ userId: 1 }, { unique: true });
// TTL: abandoned carts disappear 30 days after the last change.
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Cart = mongoose.models.Cart ?? mongoose.model('Cart', cartSchema);
