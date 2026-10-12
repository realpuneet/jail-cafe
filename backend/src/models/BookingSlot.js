import mongoose from 'mongoose';
import { BOOKING } from '../utils/constants.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A repeating time window (e.g. "Dinner 19:00-21:00") with a seat capacity per day. */
const bookingSlotSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 40 },
    startTime: { type: String, required: true, match: HHMM },
    endTime: { type: String, required: true, match: HHMM },
    capacity: { type: Number, required: true, min: 1 }, // total seats available in this slot each day
    maxPartySize: { type: Number, min: 1, default: BOOKING.DEFAULT_MAX_PARTY },
    daysOfWeek: { type: [{ type: Number, min: 0, max: 6 }], default: [0, 1, 2, 3, 4, 5, 6] },
    depositPerGuest: { type: Number, min: 0, default: 0 }, // paise; 0 = no deposit
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Availability list: active slots in time order.
bookingSlotSchema.index({ isActive: 1, startTime: 1 });

/**
 * Seats already booked for (slot, date). One small document per slot per day; the atomic
 * conditional $inc on it is what makes double booking impossible.
 */
const inventorySchema = new mongoose.Schema({
  slotId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookingSlot', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD (IST)
  capacity: { type: Number, required: true },
  booked: { type: Number, default: 0, min: 0 },
  expiresAt: { type: Date, required: true }, // housekeeping TTL (date + 90 days)
});
inventorySchema.index({ slotId: 1, date: 1 }, { unique: true });
// Availability for a whole day.
inventorySchema.index({ date: 1 });
inventorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const BookingSlot =
  mongoose.models.BookingSlot ?? mongoose.model('BookingSlot', bookingSlotSchema);
export const SlotInventory =
  mongoose.models.SlotInventory ?? mongoose.model('SlotInventory', inventorySchema);
