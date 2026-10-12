import { AnalyticsDaily } from '../models/AnalyticsDaily.js';
import { Order } from '../models/Order.js';
import { PartyInquiry } from '../models/PartyInquiry.js';
import { TableBooking } from '../models/TableBooking.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { cached } from '../utils/cache.js';
import {
  ANALYTICS,
  BOOKING_STATUS,
  ORDER_ACTIVE_STATUSES,
  ORDER_STATUS as S,
} from '../utils/constants.js';
import { addDays, istDate } from '../utils/datetime.js';

const CLOSED = [S.CANCELLED, S.REJECTED];
const dayRange = (date) => ({
  start: new Date(`${date}T00:00:00+05:30`),
  end: new Date(`${addDays(date, 1)}T00:00:00+05:30`),
});

/**
 * Aggregate one IST day into an AnalyticsDaily document (idempotent upsert).
 * @param {string} date YYYY-MM-DD
 */
export async function rollupDay(date) {
  const { start, end } = dayRange(date);
  const created = { createdAt: { $gte: start, $lt: end } };

  const [orderFacets] = await Order.aggregate([
    { $match: created },
    {
      $facet: {
        statuses: [
          { $group: { _id: '$status', n: { $sum: 1 }, total: { $sum: '$pricing.total' } } },
        ],
        hours: [
          {
            $group: {
              _id: { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
              n: { $sum: 1 },
            },
          },
        ],
        discounts: [
          { $match: { status: { $nin: CLOSED } } },
          { $group: { _id: null, d: { $sum: '$pricing.discount' } } },
        ],
        items: [
          { $match: { status: { $nin: CLOSED } } },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.menuItemId',
              name: { $first: '$items.name' },
              quantity: { $sum: '$items.quantity' },
              revenue: { $sum: '$items.lineTotal' },
            },
          },
          { $sort: { quantity: -1, revenue: -1 } },
          { $limit: ANALYTICS.TOP_ITEMS },
        ],
      },
    },
  ]);

  const byStatus = Object.fromEntries(orderFacets.statuses.map((r) => [r._id, r.n]));
  const sum = (pred, key) =>
    orderFacets.statuses.filter((r) => pred(r._id)).reduce((n, r) => n + r[key], 0);
  const byHour = Array(24).fill(0);
  for (const h of orderFacets.hours) byHour[h._id] = h.n;

  const [bk] = await TableBooking.aggregate([
    {
      $match: {
        date,
        status: {
          $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED, BOOKING_STATUS.NO_SHOW],
        },
      },
    },
    { $group: { _id: null, n: { $sum: 1 }, guests: { $sum: '$guests' } } },
  ]);

  const doc = {
    orders: sum(() => true, 'n'),
    delivered: byStatus[S.DELIVERED] ?? 0,
    cancelled: (byStatus[S.CANCELLED] ?? 0) + (byStatus[S.REJECTED] ?? 0),
    grossSales: sum((s) => !CLOSED.includes(s), 'total'),
    revenue: sum((s) => s === S.DELIVERED, 'total'),
    discounts: orderFacets.discounts[0]?.d ?? 0,
    byStatus,
    byHour,
    topItems: orderFacets.items.map((i) => ({
      menuItemId: String(i._id),
      name: i.name,
      quantity: i.quantity,
      revenue: i.revenue,
    })),
    bookings: bk?.n ?? 0,
    bookingGuests: bk?.guests ?? 0,
    partyInquiries: await PartyInquiry.countDocuments(created),
    newUsers: await User.countDocuments(created),
    computedAt: new Date(),
  };
  await AnalyticsDaily.replaceOne({ _id: date }, { _id: date, ...doc }, { upsert: true });
  return { _id: date, ...doc };
}

/** Maintenance job: refresh today and yesterday (late status changes land on the order's creation day). */
export async function rollupRecent(now = new Date()) {
  const today = istDate(now);
  await rollupDay(addDays(today, -1));
  await rollupDay(today);
}

const emptyDay = (date) => ({
  _id: date,
  orders: 0,
  delivered: 0,
  cancelled: 0,
  grossSales: 0,
  revenue: 0,
  discounts: 0,
  byStatus: {},
  byHour: Array(24).fill(0),
  topItems: [],
  bookings: 0,
  bookingGuests: 0,
  partyInquiries: 0,
  newUsers: 0,
});

/** Rollups for [from, to]; missing past days are computed once, today is always refreshed (30 s cache). */
async function loadRange(from, to, now) {
  const today = istDate(now);
  const existing = await AnalyticsDaily.find({ _id: { $gte: from, $lte: to } }).lean();
  const have = new Map(existing.map((d) => [d._id, d]));
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (d === today) days.push(await cached('analytics', ['today', d], 30, () => rollupDay(d)));
    else if (have.has(d)) days.push(have.get(d));
    else days.push(d > today ? emptyDay(d) : await rollupDay(d)); // backfill history lazily, once
  }
  return days;
}

const totals = (days) => ({
  orders: days.reduce((n, d) => n + d.orders, 0),
  delivered: days.reduce((n, d) => n + d.delivered, 0),
  cancelled: days.reduce((n, d) => n + d.cancelled, 0),
  grossSales: days.reduce((n, d) => n + d.grossSales, 0),
  revenue: days.reduce((n, d) => n + d.revenue, 0),
  discounts: days.reduce((n, d) => n + d.discounts, 0),
  bookings: days.reduce((n, d) => n + d.bookings, 0),
  bookingGuests: days.reduce((n, d) => n + d.bookingGuests, 0),
  partyInquiries: days.reduce((n, d) => n + d.partyInquiries, 0),
  newUsers: days.reduce((n, d) => n + d.newUsers, 0),
});

/**
 * Dashboard payload for the last `days` days vs the previous period.
 * @param {number} days 1..92
 */
export async function dashboard(days = 7, now = new Date()) {
  if (!Number.isInteger(days) || days < 1 || days > ANALYTICS.MAX_DAYS)
    throw ApiError.badRequest(`days must be 1-${ANALYTICS.MAX_DAYS}`);
  const today = istDate(now);
  const from = addDays(today, -(days - 1));
  const prevFrom = addDays(from, -days);
  const [series, prev] = await Promise.all([
    loadRange(from, today, now),
    loadRange(prevFrom, addDays(from, -1), now),
  ]);

  const current = totals(series);
  const previous = totals(prev);
  const items = new Map();
  for (const d of series)
    for (const i of d.topItems) {
      const cur = items.get(i.menuItemId) ?? { ...i, quantity: 0, revenue: 0 };
      cur.quantity += i.quantity;
      cur.revenue += i.revenue;
      items.set(i.menuItemId, cur);
    }
  const byHour = Array(24).fill(0);
  for (const d of series) d.byHour.forEach((n, h) => (byHour[h] += n));

  const [activeOrders, upcomingBookings, openParty] = await Promise.all([
    Order.countDocuments({
      status: { $in: ORDER_ACTIVE_STATUSES },
      $or: [{ 'payment.method': 'cod' }, { 'payment.status': 'paid' }],
    }),
    TableBooking.countDocuments({ date: { $gte: today }, status: BOOKING_STATUS.CONFIRMED }),
    PartyInquiry.countDocuments({ status: { $in: ['SUBMITTED', 'QUOTED', 'ACCEPTED'] } }),
  ]);

  return {
    range: { from, to: today, days },
    totals: current,
    previous,
    averageOrderValue: current.delivered ? Math.round(current.revenue / current.delivered) : 0,
    series: series.map((d) => ({
      date: d._id,
      orders: d.orders,
      revenue: d.revenue,
      grossSales: d.grossSales,
      bookings: d.bookings,
    })),
    byHour,
    topItems: [...items.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, ANALYTICS.TOP_ITEMS),
    live: { activeOrders, upcomingBookings, openPartyInquiries: openParty },
  };
}
