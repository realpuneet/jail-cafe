import { BookingSlot, SlotInventory } from '../models/BookingSlot.js';
import { ApiError } from '../utils/ApiError.js';
import { BOOKING } from '../utils/constants.js';
import { addDays, istDate, slotStartsAt, weekday } from '../utils/datetime.js';

/** Validate that a date is bookable (today .. today + MAX_ADVANCE_DAYS, IST). */
export function assertBookableDate(date, now = new Date()) {
  const today = istDate(now);
  if (date < today) throw ApiError.badRequest('Date is in the past');
  if (date > addDays(today, BOOKING.MAX_ADVANCE_DAYS)) {
    throw ApiError.badRequest(`Bookings open ${BOOKING.MAX_ADVANCE_DAYS} days ahead`);
  }
}

/** A slot can still be booked if it starts at least MIN_LEAD_MINUTES from now. */
export const isBookableNow = (slot, date, now = new Date()) =>
  slotStartsAt(date, slot.startTime).getTime() - now.getTime() >= BOOKING.MIN_LEAD_MINUTES * 60_000;

/**
 * Slots offered on a date with live seat counts.
 * @param {string} date YYYY-MM-DD (IST)
 * @param {Date} [now]
 */
export async function availability(date, now = new Date()) {
  assertBookableDate(date, now);
  const dow = weekday(date);
  const slots = await BookingSlot.find({ isActive: true, daysOfWeek: dow })
    .sort({ startTime: 1 })
    .lean();
  if (!slots.length) return [];
  const inventories = await SlotInventory.find(
    { date, slotId: { $in: slots.map((s) => s._id) } },
    'slotId capacity booked',
  ).lean();
  const byId = new Map(inventories.map((i) => [String(i.slotId), i]));

  return slots.map((s) => {
    const inv = byId.get(String(s._id));
    const capacity = inv?.capacity ?? s.capacity;
    const remaining = Math.max(capacity - (inv?.booked ?? 0), 0);
    return {
      slotId: String(s._id),
      label: s.label,
      startTime: s.startTime,
      endTime: s.endTime,
      capacity,
      remaining,
      maxPartySize: s.maxPartySize,
      depositPerGuest: s.depositPerGuest,
      bookable: remaining > 0 && isBookableNow(s, date, now),
    };
  });
}

export const listAdmin = () => BookingSlot.find().sort({ startTime: 1 }).limit(100).lean();

function assertWindow(s) {
  if (s.startTime && s.endTime && s.startTime >= s.endTime) {
    throw ApiError.validation('endTime must be after startTime');
  }
}

export async function create(input) {
  assertWindow(input);
  return (await BookingSlot.create(input)).toObject();
}

/** Update a slot; a capacity change is pushed to today's and future inventories. */
export async function update(id, patch) {
  const current = await BookingSlot.findById(id).lean();
  if (!current) throw ApiError.notFound('Slot not found');
  assertWindow({ ...current, ...patch });
  const slot = await BookingSlot.findByIdAndUpdate(
    id,
    { $set: patch },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (patch.capacity !== undefined) {
    await SlotInventory.updateMany(
      { slotId: id, date: { $gte: istDate() } },
      { $set: { capacity: patch.capacity } },
    );
  }
  return slot;
}

/** Soft-disable: existing bookings stay valid, no new ones can be made. */
export async function remove(id) {
  const slot = await BookingSlot.findByIdAndUpdate(id, { $set: { isActive: false } }).lean();
  if (!slot) throw ApiError.notFound('Slot not found');
}
