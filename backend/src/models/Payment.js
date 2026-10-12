import mongoose from 'mongoose';
import { PAYMENT_PURPOSE } from '../utils/constants.js';

export const GATEWAY_STATUS = Object.freeze({
  CREATED: 'created',
  CAPTURED: 'captured',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
});

const paymentSchema = new mongoose.Schema(
  {
    purpose: { type: String, enum: Object.values(PAYMENT_PURPOSE), default: PAYMENT_PURPOSE.ORDER },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true }, // orderId / bookingId / inquiryId
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, default: 'razorpay' },
    providerOrderId: { type: String, required: true },
    providerPaymentId: { type: String },
    amount: { type: Number, required: true, min: 1 }, // paise
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: Object.values(GATEWAY_STATUS), default: GATEWAY_STATUS.CREATED },
    refundedAmount: { type: Number, default: 0 },
    refundIds: { type: [String], default: [] }, // gateway refund ids already applied (idempotency)
    refundingSince: { type: Date }, // short lock so two workers never call the gateway for one payment
    failureReason: { type: String, maxlength: 300 },
    capturedAt: Date,
  },
  { timestamps: true },
);

// Webhook/verify lookup by gateway order id.
paymentSchema.index({ providerOrderId: 1 }, { unique: true });
// Gateway payment id (refund/webhook lookups). Sparse: only set after capture, and unlike a
// partial `$type` index it is usable by plain equality queries (partial would force a scan).
paymentSchema.index({ providerPaymentId: 1 }, { unique: true, sparse: true });
// All payments for an order/booking, newest first.
paymentSchema.index({ purpose: 1, refId: 1, _id: -1 });

/** Processed webhook events (idempotency). Auto-deleted after 90 days. */
const eventSchema = new mongoose.Schema({
  eventId: { type: String, required: true },
  type: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
eventSchema.index({ eventId: 1 }, { unique: true });
eventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export const Payment = mongoose.models.Payment ?? mongoose.model('Payment', paymentSchema);
export const PaymentEvent =
  mongoose.models.PaymentEvent ?? mongoose.model('PaymentEvent', eventSchema);
