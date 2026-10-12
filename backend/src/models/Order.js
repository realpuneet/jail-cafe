import mongoose from 'mongoose';
import {
  ORDER,
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  ORDER_TYPE,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
} from '../utils/constants.js';

const itemSchema = new mongoose.Schema(
  {
    menuItemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true }, // snapshot
    isVeg: { type: Boolean, required: true },
    variantId: mongoose.Schema.Types.ObjectId,
    variantName: String,
    addOns: [{ _id: false, addOnId: mongoose.Schema.Types.ObjectId, name: String, price: Number }],
    unitPrice: { type: Number, required: true }, // paise, includes variant + add-ons
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true },
    taxPercent: { type: Number, default: 0 },
    note: String,
  },
  { _id: false },
);

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUS_VALUES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: String }, // user id, or 'system' for automated transitions
    role: String,
    note: String,
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true }, // JKC-YYMMDD-0001
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(ORDER_TYPE), required: true },
    items: { type: [itemSchema], required: true },
    address: {
      type: new mongoose.Schema(
        {
          name: String,
          phone: String,
          line1: String,
          line2: String,
          landmark: String,
          city: String,
          state: String,
          pincode: String,
          location: { type: { type: String, enum: ['Point'] }, coordinates: [Number] },
        },
        { _id: false },
      ),
      default: undefined,
    },
    pricing: {
      subtotal: { type: Number, required: true },
      discount: { type: Number, default: 0 },
      deliveryCharge: { type: Number, default: 0 },
      taxIncluded: { type: Number, default: 0 }, // informational (prices are GST-inclusive)
      total: { type: Number, required: true },
    },
    coupon: {
      _id: false,
      couponId: mongoose.Schema.Types.ObjectId,
      code: String,
      discount: Number,
    },
    delivery: {
      _id: false,
      zoneId: String,
      zoneName: String,
      estimatedMinutes: Number,
      distanceKm: Number,
    },
    payment: {
      method: { type: String, enum: Object.values(PAYMENT_METHOD), required: true },
      status: { type: String, enum: Object.values(PAYMENT_STATUS), required: true },
      paidAt: Date,
      refundedAmount: { type: Number, default: 0 },
    },
    status: { type: String, enum: ORDER_STATUS_VALUES, default: ORDER_STATUS.PLACED },
    statusHistory: { type: [historySchema], default: [] }, // bounded by the state machine (<= 8 entries)
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, trim: true, maxlength: ORDER.MAX_NOTE_LENGTH },
    idempotencyKey: { type: String, maxlength: 80 },
    cancelReason: String,
    deliveredAt: Date,
  },
  { timestamps: true },
);

// Human lookup / uniqueness.
orderSchema.index({ orderNumber: 1 }, { unique: true });
// "My orders", newest first (cursor on _id).
orderSchema.index({ userId: 1, _id: -1 });
// Live board: active orders by status, oldest first.
orderSchema.index({ status: 1, createdAt: 1 });
// Rider app: my active deliveries.
orderSchema.index(
  { riderId: 1, status: 1 },
  { partialFilterExpression: { riderId: { $exists: true } } },
);
// Idempotent creation backstop (same user + key => same order).
orderSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
// Cleanup job: unpaid online orders by age.
orderSchema.index(
  { 'payment.status': 1, createdAt: 1 },
  { partialFilterExpression: { 'payment.status': PAYMENT_STATUS.PENDING } },
);
// Analytics / daily rollups.
orderSchema.index({ createdAt: -1, status: 1 });

export const Order = mongoose.models.Order ?? mongoose.model('Order', orderSchema);
