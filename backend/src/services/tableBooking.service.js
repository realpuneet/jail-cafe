import mongoose from 'mongoose';
import { BookingSlot, SlotInventory } from '../models/BookingSlot.js';
import { nextSeq } from '../models/Counter.js';
import { TableBooking } from '../models/TableBooking.js';
import { User } from '../models/User.js';
import { enqueue, getQueue } from '../jobs/queues.js';
import { realtime, rooms } from '../sockets/realtime.js';
import { ApiError } from '../utils/ApiError.js';
import {
  BOOKING,
  BOOKING_STATUS as B,
  DEPOSIT_STATUS as D,
  JOBS,
  PAYMENT_PURPOSE,
  QUEUES,
  ROLES,
  SOCKET_EVENTS,
} from '../utils/constants.js';
import { formatTime12, slotStartsAt } from '../utils/datetime.js';
import { paginate } from '../utils/pagination.js';
import { assertAcceptingBookings } from './settings.service.js';
import * as notifications from './notification.service.js';
import { assertBookableDate, isBookableNow } from './bookingSlot.service.js';
import { createGatewayPayment, queueRefund, registerPurpose } from './payment.service.js';

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const STAFF = [ROLES.ADMIN, ROLES.STAFF];
const LIVE = [B.HELD, B.CONFIRMED];

async function makeBookingNumber(now = new Date()) {
  const d = new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(2, 10).replaceAll('-', '');
  const seq = await nextSeq(`booking:${d}`, { ttlSeconds: 3 * 86400 });
  return `TB-${d}-${String(seq).padStart(4, '0')}`;
}

/** Create the day's inventory row if missing. Done outside any transaction (duplicate-key safe). */
async function ensureInventory(slot, date) {
  try {
    await SlotInventory.updateOne(
      { slotId: slot._id, date },
      {
        $setOnInsert: {
          capacity: slot.capacity,
          booked: 0,
          expiresAt: new Date(Date.parse(`${date}T00:00:00Z`) + 90 * 86_400_000),
        },
      },
      { upsert: true },
    );
  } catch (err) {
    if (err.code !== 11000) throw err; // a concurrent request created it: fine
  }
}

/**
 * Atomically take `guests` seats. The filter only matches while booked + guests <= capacity, so
 * two concurrent requests can never both pass: exactly one document update wins each seat.
 */
async function takeSeats(slotId, date, guests, session) {
  const inv = await SlotInventory.findOneAndUpdate(
    { slotId, date, $expr: { $lte: [{ $add: ['$booked', guests] }, '$capacity'] } },
    { $inc: { booked: guests } },
    { session, returnDocument: 'after' },
  );
  if (!inv) throw ApiError.conflict('Not enough seats left in this slot');
  return inv;
}

const releaseSeats = (slotId, date, guests, session) =>
  SlotInventory.updateOne(
    { slotId, date, booked: { $gte: guests } },
    { $inc: { booked: -guests } },
    { session },
  );

const toast = (b) =>
  `${b.guests} guest${b.guests > 1 ? 's' : ''} · ${b.date} at ${formatTime12(b.slot.startTime)}`;

function announce(booking) {
  realtime.emit(rooms.staff, SOCKET_EVENTS.BOOKING_UPDATE, {
    _id: String(booking._id),
    bookingNumber: booking.bookingNumber,
    status: booking.status,
    date: booking.date,
    guests: booking.guests,
    slot: booking.slot,
  });
}

/** Everything that should happen once a booking is confirmed: alert, notification, reminder. */
async function afterConfirmed(booking) {
  realtime.emit(rooms.staff, SOCKET_EVENTS.BOOKING_NEW, {
    _id: String(booking._id),
    bookingNumber: booking.bookingNumber,
    date: booking.date,
    guests: booking.guests,
    slot: booking.slot,
    name: booking.name,
  });
  announce(booking);
  await notifications.notify(
    booking.userId,
    {
      type: 'booking',
      title: 'Table confirmed',
      body: `${booking.bookingNumber}: ${toast(booking)}. See you soon!`,
      data: { bookingId: String(booking._id) },
    },
    { dedupeId: `booking-confirmed-${booking._id}` },
  );
  const delay = booking.startsAt.getTime() - BOOKING.REMINDER_HOURS_BEFORE * 3600_000 - Date.now();
  if (delay > 0) {
    await enqueue(
      QUEUES.REMINDERS,
      JOBS.BOOKING_REMINDER,
      { bookingId: String(booking._id) },
      { delay, jobId: `reminder-${booking._id}` },
    ).catch(() => {});
  }
}

/**
 * Reserve seats and create a booking. Seats + booking are written in one transaction.
 * Without a deposit the booking is CONFIRMED immediately; with one it is HELD for
 * HOLD_MINUTES and confirmed when the payment is captured.
 * @param {string} userId
 * @param {{slotId: string, date: string, guests: number, name?: string, phone?: string, note?: string}} input
 * @param {string} [idempotencyKey]
 */
export async function createBooking(userId, input, idempotencyKey, now = new Date()) {
  await assertAcceptingBookings();
  if (idempotencyKey) {
    const existing = await TableBooking.findOne({ userId, idempotencyKey }).lean();
    if (existing) return { booking: existing, replayed: true };
  }
  assertBookableDate(input.date, now);
  const slot = await BookingSlot.findOne({ _id: input.slotId, isActive: true }).lean();
  if (!slot) throw ApiError.notFound('Slot not found');
  if (!slot.daysOfWeek.includes(new Date(`${input.date}T12:00:00Z`).getUTCDay())) {
    throw ApiError.badRequest('This slot is not offered on that day');
  }
  if (!isBookableNow(slot, input.date, now))
    throw ApiError.badRequest('This slot is no longer open for booking');
  if (input.guests > slot.maxPartySize)
    throw ApiError.badRequest(
      `Maximum ${slot.maxPartySize} guests per booking. Please enquire about a party booking.`,
    );

  const user = await User.findById(userId, 'name phone').lean();
  const deposit = slot.depositPerGuest * input.guests;
  const bookingId = new mongoose.Types.ObjectId();
  const bookingNumber = await makeBookingNumber(now);
  await ensureInventory(slot, input.date);

  const doc = {
    _id: bookingId,
    bookingNumber,
    userId,
    slotId: slot._id,
    slot: { label: slot.label, startTime: slot.startTime, endTime: slot.endTime },
    date: input.date,
    startsAt: slotStartsAt(input.date, slot.startTime),
    guests: input.guests,
    name: input.name ?? user?.name ?? 'Guest',
    phone: input.phone ?? user?.phone,
    note: input.note,
    status: deposit > 0 ? B.HELD : B.CONFIRMED,
    deposit: { amount: deposit, status: deposit > 0 ? D.PENDING : D.NONE },
    holdExpiresAt:
      deposit > 0 ? new Date(now.getTime() + BOOKING.HOLD_MINUTES * 60_000) : undefined,
    statusHistory: [{ status: deposit > 0 ? B.HELD : B.CONFIRMED, by: String(userId) }],
    idempotencyKey,
  };

  const session = await mongoose.startSession();
  let booking;
  try {
    await session.withTransaction(async () => {
      await takeSeats(slot._id, input.date, input.guests, session);
      [booking] = await TableBooking.create([doc], { session });
    });
  } catch (err) {
    if (err.code === 11000) {
      if (idempotencyKey) {
        const existing = await TableBooking.findOne({ userId, idempotencyKey }).lean();
        if (existing) return { booking: existing, replayed: true };
      }
      throw ApiError.conflict('You already have a booking for this slot on that day');
    }
    throw err;
  } finally {
    await session.endSession();
  }

  const plain = booking.toObject();
  if (plain.status === B.CONFIRMED) await afterConfirmed(plain);
  else announce(plain);
  return { booking: plain, replayed: false };
}

/** Load a booking for its owner or staff. */
export async function getForActor(id, actor) {
  const booking = await TableBooking.findById(id).lean();
  if (!booking || !(String(booking.userId) === actor.id || STAFF.includes(actor.role))) {
    throw ApiError.notFound('Booking not found');
  }
  return booking;
}

export const listMine = (userId, q) =>
  paginate(TableBooking, { filter: { userId }, limit: q.limit, cursor: q.cursor });

/**
 * Staff list. With a date: that day's bookings in time order (bounded by capacity).
 * Without: newest first, cursor paginated.
 */
export async function listForStaff({ date, status, limit, cursor }) {
  const filter = {};
  if (status) filter.status = status;
  if (date) {
    filter.date = date;
    const items = await TableBooking.find(filter).sort({ startsAt: 1, _id: 1 }).limit(500).lean();
    return { items, meta: { count: items.length } };
  }
  return paginate(TableBooking, { filter, limit, cursor });
}

/**
 * Month overview for the calendar: per day, live booking count and guests.
 * @param {string} month YYYY-MM
 */
export async function calendar(month) {
  const rows = await TableBooking.aggregate([
    {
      $match: {
        date: { $gte: `${month}-01`, $lte: `${month}-31` },
        status: { $in: [...LIVE, B.COMPLETED] },
      },
    },
    { $group: { _id: '$date', bookings: { $sum: 1 }, guests: { $sum: '$guests' } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ date: r._id, bookings: r.bookings, guests: r.guests }));
}

/** Start a deposit payment for a HELD booking. */
export async function createDepositPayment(userId, bookingId, now = new Date()) {
  const booking = await TableBooking.findOne({ _id: bookingId, userId }).lean();
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.status !== B.HELD)
    throw ApiError.conflict(`Booking is ${booking.status.toLowerCase()}`);
  if (booking.holdExpiresAt <= now)
    throw ApiError.conflict('This hold has expired, please book again');
  return createGatewayPayment({
    purpose: PAYMENT_PURPOSE.BOOKING,
    refId: booking._id,
    userId,
    amount: booking.deposit.amount,
    receipt: booking.bookingNumber,
  });
}

/**
 * Close a booking and give the seats back, atomically. Returns null if it was not in `from`.
 */
async function closeAndRelease(booking, to, { by, note, from = LIVE }) {
  const session = await mongoose.startSession();
  let updated = null;
  try {
    await session.withTransaction(async () => {
      updated = await TableBooking.findOneAndUpdate(
        { _id: booking._id, status: { $in: from } },
        {
          $set: { status: to, cancelledAt: new Date(), cancelReason: note, holdExpiresAt: null },
          $push: { statusHistory: { status: to, by, note } },
        },
        { session, returnDocument: 'after' },
      ).lean();
      if (updated) await releaseSeats(booking.slotId, booking.date, booking.guests, session);
    });
  } finally {
    await session.endSession();
  }
  return updated;
}

/**
 * Cancel. Customers: own booking, and a confirmed one only until CANCEL_CUTOFF_HOURS before start.
 * Staff: any time. A paid deposit is refunded.
 */
export async function cancel(id, actor, { reason } = {}, now = new Date()) {
  const booking = await getForActor(id, actor);
  if (!LIVE.includes(booking.status))
    throw ApiError.conflict(`Booking is already ${booking.status.toLowerCase()}`);
  if (!STAFF.includes(actor.role) && booking.status === B.CONFIRMED) {
    const cutoff = booking.startsAt.getTime() - BOOKING.CANCEL_CUTOFF_HOURS * 3600_000;
    if (now.getTime() > cutoff)
      throw ApiError.conflict(
        `Bookings can be cancelled up to ${BOOKING.CANCEL_CUTOFF_HOURS} hours before the start. Please call us.`,
      );
  }
  const updated = await closeAndRelease(booking, B.CANCELLED, { by: actor.id, note: reason });
  if (!updated) throw ApiError.conflict('Booking was just updated, please refresh');
  if (updated.deposit.status === D.PAID) await queueRefund(PAYMENT_PURPOSE.BOOKING, updated._id);
  await removeReminder(updated._id);
  announce(updated);
  await notifications.notify(
    updated.userId,
    {
      type: 'booking',
      title: 'Booking cancelled',
      body: `${updated.bookingNumber} (${toast(updated)}) was cancelled.${updated.deposit.status === D.PAID ? ' Your deposit will be refunded.' : ''}`,
      data: { bookingId: String(updated._id) },
    },
    { dedupeId: `booking-cancelled-${updated._id}` },
  );
  return updated;
}

/** Staff: mark a confirmed booking COMPLETED or NO_SHOW (seats are not released: the day has passed). */
export async function setOutcome(id, status, actor) {
  const updated = await TableBooking.findOneAndUpdate(
    { _id: id, status: B.CONFIRMED },
    { $set: { status }, $push: { statusHistory: { status, by: actor.id } } },
    { returnDocument: 'after' },
  ).lean();
  if (!updated)
    throw ApiError.conflict('Only confirmed bookings can be completed or marked no-show');
  announce(updated);
  return updated;
}

/** Hold expired without payment: free the seats. Idempotent. */
export async function expireHold(bookingId) {
  const booking = await TableBooking.findById(bookingId).lean();
  if (!booking) return false;
  const updated = await closeAndRelease(booking, B.EXPIRED, {
    by: 'system',
    note: 'Deposit not paid in time',
    from: [B.HELD],
  });
  if (updated) announce(updated);
  return Boolean(updated);
}

/** Maintenance job: expire up to `limit` overdue holds. */
export async function expireOverdueHolds(now = new Date(), limit = 200) {
  const overdue = await TableBooking.find({ status: B.HELD, holdExpiresAt: { $lt: now } }, '_id')
    .limit(limit)
    .lean();
  let n = 0;
  for (const { _id } of overdue) if (await expireHold(_id)) n += 1;
  return n;
}

/** Reminder job handler: only reminds if the booking is still confirmed. */
export async function sendReminder(bookingId) {
  const booking = await TableBooking.findById(bookingId).lean();
  if (!booking || booking.status !== B.CONFIRMED) return { sent: false };
  await notifications.notify(
    booking.userId,
    {
      type: 'booking_reminder',
      title: 'Table reminder',
      body: `Your table for ${booking.guests} is booked today at ${formatTime12(booking.slot.startTime)} (${booking.bookingNumber}). See you!`,
      data: { bookingId: String(booking._id) },
    },
    { dedupeId: `booking-reminder-${booking._id}` },
  );
  return { sent: true };
}

/** Drop the queued reminder when a booking is cancelled (best effort; the handler also re-checks). */
export async function removeReminder(bookingId) {
  try {
    await (await getQueue(QUEUES.REMINDERS).getJob(`reminder-${bookingId}`))?.remove();
  } catch {
    // already running or gone
  }
}

/* ---- payment purpose hooks (deposit) ---- */
registerPurpose(PAYMENT_PURPOSE.BOOKING, {
  snapshot: async (payment) => ({ booking: await TableBooking.findById(payment.refId).lean() }),

  async onCaptured(payment) {
    const booking = await TableBooking.findOneAndUpdate(
      { _id: payment.refId, status: B.HELD },
      {
        $set: { status: B.CONFIRMED, 'deposit.status': D.PAID },
        $unset: { holdExpiresAt: 1 },
        $push: { statusHistory: { status: B.CONFIRMED, by: 'payment' } },
      },
      { returnDocument: 'after' },
    ).lean();
    if (!booking) {
      // Hold already expired or cancelled: the seats may be gone, so return the money.
      await queueRefund(PAYMENT_PURPOSE.BOOKING, payment.refId);
      return { booking: await TableBooking.findById(payment.refId).lean() };
    }
    await afterConfirmed(booking);
    return { booking };
  },

  async onRefund(payment, { full }) {
    const booking = await TableBooking.findByIdAndUpdate(
      payment.refId,
      { $set: { 'deposit.status': full ? D.REFUNDED : D.PARTIALLY_REFUNDED } },
      { returnDocument: 'after' },
    ).lean();
    if (booking) announce(booking);
  },
});
