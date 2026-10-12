import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { nextSeq } from '../models/Counter.js';
import { PartyDay, PartyInquiry } from '../models/PartyInquiry.js';
import { PartyPackage } from '../models/PartyPackage.js';
import { User } from '../models/User.js';
import { realtime, rooms } from '../sockets/realtime.js';
import { ApiError } from '../utils/ApiError.js';
import {
  DEPOSIT_STATUS as D,
  PARTY,
  PARTY_STATUS as P,
  PAYMENT_PURPOSE,
  ROLES,
  SOCKET_EVENTS,
} from '../utils/constants.js';
import { addDays, istDate } from '../utils/datetime.js';
import { paginate } from '../utils/pagination.js';
import * as notifications from './notification.service.js';
import { createGatewayPayment, queueRefund, registerPurpose } from './payment.service.js';

const STAFF = [ROLES.ADMIN, ROLES.STAFF];
const OPEN = [P.SUBMITTED, P.QUOTED, P.ACCEPTED];
const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const inr = (paise) => `Rs ${(paise / 100).toLocaleString('en-IN')}`;

async function makeNumber(now = new Date()) {
  const d = new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(2, 10).replaceAll('-', '');
  return `PI-${d}-${String(await nextSeq(`party:${d}`, { ttlSeconds: 3 * 86400 })).padStart(4, '0')}`;
}

const summary = (i) => ({
  _id: String(i._id),
  inquiryNumber: i.inquiryNumber,
  status: i.status,
  eventDate: i.eventDate,
  guests: i.guests,
  eventType: i.eventType,
  name: i.name,
});
const announce = (i, event = SOCKET_EVENTS.PARTY_UPDATE) =>
  realtime.emit(rooms.staff, event, summary(i));
const tell = (i, title, body, key) =>
  notifications.notify(
    i.userId,
    { type: 'party', title, body, data: { inquiryId: String(i._id) } },
    { dedupeId: `party-${i._id}-${key}` },
  );

/* ---- party-day capacity (same atomic-counter idea as table seats) ---- */
async function ensureDay(date) {
  try {
    await PartyDay.updateOne(
      { date },
      {
        $setOnInsert: {
          capacity: env.PARTY_MAX_PER_DAY,
          booked: 0,
          expiresAt: new Date(Date.parse(`${date}T00:00:00Z`) + 30 * 86_400_000),
        },
      },
      { upsert: true },
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
}
async function takeDay(date, session) {
  const day = await PartyDay.findOneAndUpdate(
    { date, $expr: { $lt: ['$booked', '$capacity'] } },
    { $inc: { booked: 1 } },
    { session, returnDocument: 'after' },
  );
  if (!day)
    throw ApiError.conflict(
      'Sorry, that date is fully booked for parties. Please choose another date.',
    );
}
const releaseDay = (date, session) =>
  PartyDay.updateOne({ date, booked: { $gt: 0 } }, { $inc: { booked: -1 } }, { session });

/** Compare-and-set status change (+ date release) in one transaction. Returns null if `from` did not match. */
async function transition(inquiry, to, { from, by, note, set = {} }) {
  const session = await mongoose.startSession();
  let updated = null;
  try {
    await session.withTransaction(async () => {
      updated = await PartyInquiry.findOneAndUpdate(
        { _id: inquiry._id, status: { $in: from } },
        {
          $set: { status: to, ...(inquiry.dateReserved ? { dateReserved: false } : {}), ...set },
          $push: { statusHistory: { status: to, by, note } },
        },
        { session, returnDocument: 'after' },
      ).lean();
      if (updated && inquiry.dateReserved) await releaseDay(inquiry.eventDate, session);
    });
  } finally {
    await session.endSession();
  }
  return updated;
}

/**
 * Customer submits an inquiry.
 * @param {string} userId
 * @param {object} input validated body
 * @param {string} [idempotencyKey]
 */
export async function createInquiry(userId, input, idempotencyKey, now = new Date()) {
  if (idempotencyKey) {
    const existing = await PartyInquiry.findOne({ userId, idempotencyKey }).lean();
    if (existing) return { inquiry: existing, replayed: true };
  }
  const today = istDate(now);
  if (input.eventDate < addDays(today, PARTY.MIN_LEAD_DAYS)) {
    throw ApiError.badRequest(`Parties need at least ${PARTY.MIN_LEAD_DAYS} days notice`);
  }
  if (input.eventDate > addDays(today, PARTY.MAX_ADVANCE_DAYS))
    throw ApiError.badRequest('That date is too far ahead');

  let pkg;
  if (input.packageId) {
    pkg = await PartyPackage.findOne({ _id: input.packageId, isActive: true }).lean();
    if (!pkg) throw ApiError.notFound('Package not found');
    if (input.guests < pkg.minGuests || input.guests > pkg.maxGuests) {
      throw ApiError.badRequest(`This package is for ${pkg.minGuests}-${pkg.maxGuests} guests`);
    }
  }
  if (
    (await PartyInquiry.countDocuments({ userId, status: { $in: OPEN } })) >=
    PARTY.MAX_OPEN_PER_USER
  ) {
    throw ApiError.badRequest(
      'You already have several open inquiries. Please wait for our replies.',
    );
  }

  const user = await User.findById(userId, 'name phone email').lean();
  try {
    const doc = await PartyInquiry.create({
      inquiryNumber: await makeNumber(now),
      userId,
      packageId: pkg?._id,
      package: pkg && { name: pkg.name, type: pkg.type, pricePerGuest: pkg.pricePerGuest },
      eventType: input.eventType ?? pkg?.type ?? 'other',
      eventDate: input.eventDate,
      startTime: input.startTime,
      guests: input.guests,
      name: input.name ?? user?.name ?? 'Guest',
      phone: input.phone ?? user?.phone,
      email: input.email ?? user?.email,
      requirements: input.requirements,
      statusHistory: [{ status: P.SUBMITTED, by: String(userId) }],
      idempotencyKey,
    });
    const plain = doc.toObject();
    announce(plain, SOCKET_EVENTS.PARTY_NEW);
    await tell(
      plain,
      'Inquiry received',
      `${plain.inquiryNumber}: we'll send you a quote shortly.`,
      'submitted',
    );
    return { inquiry: plain, replayed: false };
  } catch (err) {
    if (err.code === 11000 && idempotencyKey) {
      const existing = await PartyInquiry.findOne({ userId, idempotencyKey }).lean();
      if (existing) return { inquiry: existing, replayed: true };
    }
    throw err;
  }
}

export async function getForActor(id, actor) {
  const inquiry = await PartyInquiry.findById(id).lean();
  if (!inquiry || !(String(inquiry.userId) === actor.id || STAFF.includes(actor.role)))
    throw ApiError.notFound('Inquiry not found');
  return inquiry;
}

export const listMine = (userId, q) =>
  paginate(PartyInquiry, { filter: { userId }, limit: q.limit, cursor: q.cursor });

/** Admin inbox. @param {{status?: string, from?: string, to?: string, limit?: number, cursor?: string}} q */
export function listForStaff({ status, from, to, limit, cursor }) {
  const filter = {};
  if (status) filter.status = status;
  if (from || to)
    filter.eventDate = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  return paginate(PartyInquiry, { filter, limit, cursor });
}

/**
 * Admin sends (or revises) a quote.
 * @param {string} id
 * @param {{amount: number, tokenAmount?: number, validDays?: number, notes?: string}} input paise
 */
export async function sendQuote(id, input, actor, now = new Date()) {
  const inquiry = await PartyInquiry.findById(id).lean();
  if (!inquiry) throw ApiError.notFound('Inquiry not found');
  const tokenAmount =
    input.tokenAmount ??
    Math.max(100, Math.round((input.amount * PARTY.DEFAULT_TOKEN_PERCENT) / 100));
  if (tokenAmount > input.amount) throw ApiError.validation('Token cannot exceed the quote amount');
  const validUntil = new Date(
    now.getTime() + (input.validDays ?? PARTY.QUOTE_VALID_DAYS) * 86_400_000,
  );

  const updated = await PartyInquiry.findOneAndUpdate(
    { _id: id, status: { $in: [P.SUBMITTED, P.QUOTED] } },
    {
      $set: {
        status: P.QUOTED,
        quote: {
          amount: input.amount,
          tokenAmount,
          validUntil,
          notes: input.notes,
          quotedBy: actor.id,
          quotedAt: now,
          version: (inquiry.quote?.version ?? 0) + 1,
        },
      },
      $push: {
        statusHistory: { status: P.QUOTED, by: actor.id, note: `Quote ${inr(input.amount)}` },
      },
    },
    { returnDocument: 'after' },
  ).lean();
  if (!updated)
    throw ApiError.conflict(`Cannot quote an inquiry that is ${inquiry.status.toLowerCase()}`);
  announce(updated);
  await tell(
    updated,
    'Your party quote is ready',
    `${updated.inquiryNumber}: ${inr(input.amount)} total, token ${inr(tokenAmount)}. Valid until ${istDate(validUntil)}.`,
    `quote-${updated.quote.version}`,
  );
  return updated;
}

/** Customer accepts the quote: reserves the date atomically and starts the token window. */
export async function accept(id, userId, now = new Date()) {
  const inquiry = await PartyInquiry.findOne({ _id: id, userId }).lean();
  if (!inquiry) throw ApiError.notFound('Inquiry not found');
  if (inquiry.status !== P.QUOTED)
    throw ApiError.conflict(`Inquiry is ${inquiry.status.toLowerCase()}`);
  if (inquiry.quote.validUntil <= now)
    throw ApiError.conflict('This quote has expired. Please ask for a new one.');
  await ensureDay(inquiry.eventDate);

  const session = await mongoose.startSession();
  let updated = null;
  try {
    await session.withTransaction(async () => {
      updated = await PartyInquiry.findOneAndUpdate(
        { _id: id, userId, status: P.QUOTED },
        {
          $set: {
            status: P.ACCEPTED,
            dateReserved: true,
            token: {
              amount: inquiry.quote.tokenAmount,
              status: D.PENDING,
              dueAt: new Date(now.getTime() + PARTY.TOKEN_DUE_HOURS * 3600_000),
            },
          },
          $push: { statusHistory: { status: P.ACCEPTED, by: String(userId) } },
        },
        { session, returnDocument: 'after' },
      ).lean();
      if (!updated) throw ApiError.conflict('Inquiry was just updated, please refresh');
      await takeDay(inquiry.eventDate, session); // throws 409 when the day is full => whole txn rolls back
    });
  } finally {
    await session.endSession();
  }
  announce(updated);
  await tell(
    updated,
    'Date reserved',
    `${updated.inquiryNumber}: pay the ${inr(updated.token.amount)} token within ${PARTY.TOKEN_DUE_HOURS} hours to confirm ${updated.eventDate}.`,
    'accepted',
  );
  return updated;
}

export async function decline(id, userId) {
  const inquiry = await PartyInquiry.findOne({ _id: id, userId }).lean();
  if (!inquiry) throw ApiError.notFound('Inquiry not found');
  const updated = await transition(inquiry, P.DECLINED, {
    from: [P.QUOTED],
    by: String(userId),
    note: 'Declined by customer',
  });
  if (!updated) throw ApiError.conflict(`Inquiry is ${inquiry.status.toLowerCase()}`);
  announce(updated);
  return updated;
}

/** Admin cannot take this event (any open state). */
export async function close(id, reason, actor) {
  const inquiry = await PartyInquiry.findById(id).lean();
  if (!inquiry) throw ApiError.notFound('Inquiry not found');
  const updated = await transition(inquiry, P.CLOSED, {
    from: OPEN,
    by: actor.id,
    note: reason,
    set: { closeReason: reason },
  });
  if (!updated) throw ApiError.conflict(`Inquiry is ${inquiry.status.toLowerCase()}`);
  announce(updated);
  await tell(
    updated,
    'About your party inquiry',
    `${updated.inquiryNumber}: sorry, we can't host this one.${reason ? ` ${reason}` : ''}`,
    'closed',
  );
  return updated;
}

/**
 * Cancel. Customers: any open inquiry; a confirmed party only until FULL_REFUND_DAYS before the event
 * (token refunded). Staff: any time, choosing whether to refund.
 */
export async function cancel(id, actor, { reason, refund } = {}, now = new Date()) {
  const inquiry = await getForActor(id, actor);
  const isStaff = STAFF.includes(actor.role);
  if (![...OPEN, P.CONFIRMED].includes(inquiry.status))
    throw ApiError.conflict(`Inquiry is already ${inquiry.status.toLowerCase()}`);
  let doRefund = true;
  if (inquiry.status === P.CONFIRMED) {
    const daysLeft =
      (Date.parse(`${inquiry.eventDate}T00:00:00+05:30`) - now.getTime()) / 86_400_000;
    if (!isStaff && daysLeft < PARTY.FULL_REFUND_DAYS) {
      throw ApiError.conflict(
        `Confirmed parties can be cancelled online until ${PARTY.FULL_REFUND_DAYS} days before the event. Please call us.`,
      );
    }
    doRefund = isStaff ? refund !== false : true;
  }
  const updated = await transition(inquiry, P.CANCELLED, {
    from: [...OPEN, P.CONFIRMED],
    by: actor.id,
    note: reason,
    set: { closeReason: reason },
  });
  if (!updated) throw ApiError.conflict('Inquiry was just updated, please refresh');
  if (updated.token.status === D.PAID && doRefund)
    await queueRefund(PAYMENT_PURPOSE.PARTY, updated._id);
  announce(updated);
  await tell(
    updated,
    'Party cancelled',
    `${updated.inquiryNumber} was cancelled.${updated.token.status === D.PAID && doRefund ? ' Your token will be refunded.' : ''}`,
    'cancelled',
  );
  return updated;
}

export async function complete(id, actor) {
  const updated = await PartyInquiry.findOneAndUpdate(
    { _id: id, status: P.CONFIRMED },
    {
      $set: { status: P.COMPLETED },
      $push: { statusHistory: { status: P.COMPLETED, by: actor.id } },
    },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) throw ApiError.conflict('Only confirmed parties can be completed');
  announce(updated);
  return updated;
}

/** Start the token payment for an ACCEPTED inquiry. */
export async function createTokenPayment(userId, id, now = new Date()) {
  const inquiry = await PartyInquiry.findOne({ _id: id, userId }).lean();
  if (!inquiry) throw ApiError.notFound('Inquiry not found');
  if (inquiry.status !== P.ACCEPTED)
    throw ApiError.conflict(`Inquiry is ${inquiry.status.toLowerCase()}`);
  if (inquiry.token.dueAt <= now)
    throw ApiError.conflict('The token window has expired. Please ask for a new quote.');
  return createGatewayPayment({
    purpose: PAYMENT_PURPOSE.PARTY,
    refId: inquiry._id,
    userId,
    amount: inquiry.token.amount,
    receipt: inquiry.inquiryNumber,
  });
}

/** Maintenance: lapse unpaid tokens (releases the date) and expired quotes. */
export async function expireOverdue(now = new Date(), limit = 200) {
  let n = 0;
  const unpaid = await PartyInquiry.find({ status: P.ACCEPTED, 'token.dueAt': { $lt: now } })
    .limit(limit)
    .lean();
  for (const i of unpaid) {
    const u = await transition(i, P.EXPIRED, {
      from: [P.ACCEPTED],
      by: 'system',
      note: 'Token not paid in time',
    });
    if (u) {
      n += 1;
      announce(u);
      await tell(
        u,
        'Date released',
        `${u.inquiryNumber}: the token wasn't paid in time, so ${u.eventDate} was released.`,
        'expired',
      );
    }
  }
  const stale = await PartyInquiry.find({ status: P.QUOTED, 'quote.validUntil': { $lt: now } })
    .limit(limit)
    .lean();
  for (const i of stale) {
    if (await transition(i, P.EXPIRED, { from: [P.QUOTED], by: 'system', note: 'Quote expired' }))
      n += 1;
  }
  return n;
}

registerPurpose(PAYMENT_PURPOSE.PARTY, {
  snapshot: async (payment) => ({ inquiry: await PartyInquiry.findById(payment.refId).lean() }),

  async onCaptured(payment) {
    const inquiry = await PartyInquiry.findOneAndUpdate(
      { _id: payment.refId, status: P.ACCEPTED },
      {
        $set: { status: P.CONFIRMED, 'token.status': D.PAID },
        $push: { statusHistory: { status: P.CONFIRMED, by: 'payment', note: 'Token received' } },
      },
      { returnDocument: 'after' },
    ).lean();
    if (!inquiry) {
      await queueRefund(PAYMENT_PURPOSE.PARTY, payment.refId); // window lapsed: the date may be gone
      return { inquiry: await PartyInquiry.findById(payment.refId).lean() };
    }
    announce(inquiry);
    await tell(
      inquiry,
      'Party confirmed!',
      `${inquiry.inquiryNumber}: ${inquiry.eventDate}, ${inquiry.guests} guests. We've got your token. See you there!`,
      'confirmed',
    );
    return { inquiry };
  },

  async onRefund(payment, { full }) {
    const inquiry = await PartyInquiry.findByIdAndUpdate(
      payment.refId,
      { $set: { 'token.status': full ? D.REFUNDED : D.PARTIALLY_REFUNDED } },
      { returnDocument: 'after' },
    ).lean();
    if (inquiry) announce(inquiry);
  },
});
