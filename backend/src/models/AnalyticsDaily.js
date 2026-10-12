import mongoose from 'mongoose';

/**
 * One pre-aggregated document per IST day. Written by the rollup job; the dashboard reads
 * these instead of scanning orders, so it stays fast with hundreds of millions of orders.
 */
const analyticsDailySchema = new mongoose.Schema(
  {
    _id: { type: String }, // YYYY-MM-DD
    orders: { type: Number, default: 0 }, // created that day
    delivered: { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 }, // cancelled + rejected
    grossSales: { type: Number, default: 0 }, // paise, orders that were not cancelled/rejected
    revenue: { type: Number, default: 0 }, // paise, delivered orders
    discounts: { type: Number, default: 0 },
    byStatus: { type: Map, of: Number, default: {} },
    byHour: { type: [Number], default: () => Array(24).fill(0) }, // order count per IST hour
    topItems: {
      type: [{ _id: false, menuItemId: String, name: String, quantity: Number, revenue: Number }],
      default: [],
    }, // <= 10
    bookings: { type: Number, default: 0 },
    bookingGuests: { type: Number, default: 0 },
    partyInquiries: { type: Number, default: 0 },
    newUsers: { type: Number, default: 0 },
    computedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

export const AnalyticsDaily =
  mongoose.models.AnalyticsDaily ?? mongoose.model('AnalyticsDaily', analyticsDailySchema);
