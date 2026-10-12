import mongoose from 'mongoose';
import { BOOKING_STATUS, BOOKING_STATUS_VALUES, DEPOSIT_STATUS } from '../utils/constants.js';

const tableBookingSchema = new mongoose.Schema(
  {
    bookingNumber: { type: String, required: true }, // TB-YYMMDD-0001
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    slotId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookingSlot', required: true },
    slot: { _id: false, label: String, startTime: String, endTime: String }, // snapshot
    date: { type: String, required: true }, // YYYY-MM-DD (IST)
    startsAt: { type: Date, required: true },
    guests: { type: Number, required: true, min: 1 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true },
    note: { type: String, trim: true, maxlength: 300 },
    status: { type: String, enum: BOOKING_STATUS_VALUES, default: BOOKING_STATUS.CONFIRMED },
    deposit: {
      amount: { type: Number, default: 0 }, // paise
      status: { type: String, enum: Object.values(DEPOSIT_STATUS), default: DEPOSIT_STATUS.NONE },
    },
    holdExpiresAt: { type: Date },
    idempotencyKey: { type: String, maxlength: 80 },
    cancelledAt: Date,
    cancelReason: String,
    statusHistory: {
      type: [
        {
          _id: false,
          status: String,
          at: { type: Date, default: Date.now },
          by: String,
          note: String,
        },
      ],
      default: [],
    }, // <= 4 entries by construction
  },
  { timestamps: true },
);

tableBookingSchema.index({ bookingNumber: 1 }, { unique: true });
// "My bookings", newest first.
tableBookingSchema.index({ userId: 1, _id: -1 });
// Staff day view / calendar: a date's bookings by slot and status.
tableBookingSchema.index({ date: 1, slotId: 1, status: 1 });
// Hold-expiry job.
tableBookingSchema.index(
  { holdExpiresAt: 1 },
  { partialFilterExpression: { status: BOOKING_STATUS.HELD } },
);
// Idempotent creation backstop.
tableBookingSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
// One live booking per user per slot per day (stops accidental/abusive duplicates).
tableBookingSchema.index(
  { userId: 1, slotId: 1, date: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: [BOOKING_STATUS.HELD, BOOKING_STATUS.CONFIRMED] } },
  },
);

export const TableBooking =
  mongoose.models.TableBooking ?? mongoose.model('TableBooking', tableBookingSchema);
