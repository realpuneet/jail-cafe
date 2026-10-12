import mongoose from 'mongoose';
import { Address } from '../../src/models/Address.js';
import { AnalyticsDaily } from '../../src/models/AnalyticsDaily.js';
import { Banner } from '../../src/models/Banner.js';
import { BookingSlot, SlotInventory } from '../../src/models/BookingSlot.js';
import { Cart } from '../../src/models/Cart.js';
import { Category } from '../../src/models/Category.js';
import { Coupon } from '../../src/models/Coupon.js';
import { DeliveryZone } from '../../src/models/DeliveryZone.js';
import { MenuItem } from '../../src/models/MenuItem.js';
import { Notification } from '../../src/models/Notification.js';
import { Order } from '../../src/models/Order.js';
import { PartyInquiry } from '../../src/models/PartyInquiry.js';
import { PartyPackage } from '../../src/models/PartyPackage.js';
import { Payment } from '../../src/models/Payment.js';
import { RefreshToken } from '../../src/models/RefreshToken.js';
import { Review } from '../../src/models/Review.js';
import { TableBooking } from '../../src/models/TableBooking.js';
import { User } from '../../src/models/User.js';
import { clearDb, startDb, stopDb } from '../helpers/db.js';

/**
 * Index audit. Every hot query pattern must be answered by an index (no COLLSCAN).
 * Mongo may legitimately COLLSCAN tiny collections, so we seed a few hundred rows first and
 * walk the winning plan (including sort and fetch stages) looking for COLLSCAN or an in-memory SORT.
 */
const stagesOf = (plan, out = []) => {
  if (!plan) return out;
  out.push(plan.stage);
  [plan.inputStage, ...(plan.inputStages ?? []), plan.shard].forEach((p) => p && stagesOf(p, out));
  return out;
};

async function plan(cursor) {
  const ex = await cursor.explain('queryPlanner');
  return stagesOf(ex.queryPlanner.winningPlan);
}

const oid = () => new mongoose.Types.ObjectId();
const many = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

beforeAll(async () => {
  await startDb();
  await clearDb();
  const userId = oid();
  const cat = oid();
  await User.insertMany(
    many(300, (i) => ({
      phone: `+91900000${String(i).padStart(4, '0')}`,
      email: i % 10 === 0 ? `u${i}@x.in` : undefined,
      role: i % 50 === 0 ? 'staff' : 'customer',
    })),
  );
  await Category.insertMany(many(10, (i) => ({ name: `C${i}`, slug: `c${i}`, sortOrder: i })));
  await MenuItem.insertMany(
    many(300, (i) => ({
      name: `Item ${i}`,
      slug: `item-${i}`,
      categoryId: i % 2 ? cat : oid(),
      isVeg: i % 2 === 0,
      price: 1000 + i,
      tags: ['hot'],
    })),
  );
  await Order.collection.insertMany(
    many(400, (i) => ({
      orderNumber: `O-${i}`,
      userId: i % 7 === 0 ? userId : oid(),
      type: 'delivery',
      items: [],
      pricing: { subtotal: 1, total: 1 },
      payment: { method: i % 2 ? 'cod' : 'online', status: i % 3 ? 'paid' : 'pending' },
      status: ['PLACED', 'DELIVERED', 'PREPARING'][i % 3],
      createdAt: new Date(Date.now() - i * 60_000),
      riderId: i % 5 === 0 ? oid() : undefined,
    })),
  );
  await TableBooking.collection.insertMany(
    many(300, (i) => ({
      bookingNumber: `T-${i}`,
      userId: i % 5 ? oid() : userId,
      slotId: oid(),
      date: `2026-10-${String(10 + (i % 20)).padStart(2, '0')}`,
      startsAt: new Date(),
      guests: 2,
      name: 'n',
      phone: 'p',
      status: i % 4 ? 'CONFIRMED' : 'HELD',
      holdExpiresAt: i % 4 ? undefined : new Date(),
    })),
  );
  await PartyInquiry.collection.insertMany(
    many(300, (i) => ({
      inquiryNumber: `P-${i}`,
      userId: oid(),
      eventType: 'birthday',
      eventDate: `2026-11-${String(1 + (i % 28)).padStart(2, '0')}`,
      guests: 20,
      name: 'n',
      phone: 'p',
      status: ['SUBMITTED', 'QUOTED', 'ACCEPTED'][i % 3],
      'quote.validUntil': new Date(),
      'token.dueAt': new Date(),
      createdAt: new Date(),
    })),
  );
  await Notification.collection.insertMany(
    many(300, (i) => ({
      userId: i % 3 ? oid() : userId,
      type: 't',
      title: 't',
      body: 'b',
      createdAt: new Date(),
    })),
  );
  await Payment.collection.insertMany(
    many(200, (i) => ({
      purpose: 'order',
      refId: oid(),
      userId,
      providerOrderId: `o${i}`,
      providerPaymentId: `p${i}`,
      amount: 1,
      status: 'created',
    })),
  );
  await Address.collection.insertMany(
    many(200, (i) => ({
      userId: i % 4 ? oid() : userId,
      name: 'n',
      phone: 'p',
      line1: 'l',
      city: 'c',
      state: 's',
      pincode: '452001',
      isDefault: false,
    })),
  );
  await Coupon.insertMany(
    many(100, (i) => ({ code: `CODE${i}`, type: 'flat', value: 100, isPublic: i % 2 === 0 })),
  );
  await Review.collection.insertMany(
    many(300, (i) => ({
      orderId: oid(),
      userId: oid(),
      rating: 5,
      status: i % 5 ? 'published' : 'hidden',
    })),
  );
  await Banner.insertMany(
    many(50, (i) => ({
      title: `B${i}`,
      image: { fileId: 'f', url: 'u', filePath: 'p' },
      position: 'home_hero',
      sortOrder: i,
    })),
  );
  await DeliveryZone.insertMany(
    many(50, (i) => ({
      name: `Z${i}`,
      kind: 'pincode',
      pincodes: [`4520${String(i).padStart(2, '0')}`],
      deliveryCharge: 1,
    })),
  );
  await RefreshToken.collection.insertMany(
    many(300, (i) => ({
      jti: `j${i}`,
      family: `f${i % 20}`,
      userId: i % 3 ? oid() : userId,
      expiresAt: new Date(Date.now() + 1e9),
    })),
  );
  await BookingSlot.insertMany(
    many(10, (i) => ({ label: `S${i}`, startTime: '19:00', endTime: '20:00', capacity: 10 })),
  );
  await SlotInventory.collection.insertMany(
    many(200, (i) => ({
      slotId: oid(),
      date: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`,
      capacity: 10,
      booked: 0,
      expiresAt: new Date(Date.now() + 1e10),
    })),
  );
  await Cart.collection.insertMany(
    many(200, () => ({ userId: oid(), items: [], expiresAt: new Date(Date.now() + 1e10) })),
  );
  await PartyPackage.insertMany(
    many(20, (i) => ({ name: `P${i}`, slug: `p${i}`, pricePerGuest: 1, sortOrder: i })),
  );
  await AnalyticsDaily.collection.insertMany(many(100, (i) => ({ _id: `2026-01-${i}` })));
  globalThis.__uid = userId;
  globalThis.__cat = cat;
});
afterAll(stopDb);

const uid = () => globalThis.__uid;

const QUERIES = {
  'user by phone (OTP login)': () => User.find({ phone: '+919000000010' }),
  'staff login by email': () => User.find({ email: 'u10@x.in' }),
  'admin users by role, cursor': () => User.find({ role: 'staff' }).sort({ _id: -1 }).limit(20),
  'refresh token by jti': () => RefreshToken.find({ jti: 'j10' }),
  'revoke token family': () => RefreshToken.find({ family: 'f3' }),
  'my addresses': () => Address.find({ userId: uid() }).sort({ isDefault: -1, _id: -1 }),
  'category list (public)': () => Category.find({ isActive: true }).sort({ sortOrder: 1 }),
  'menu by category': () =>
    MenuItem.find({ categoryId: globalThis.__cat, isActive: true }).sort({ sortOrder: 1 }),
  'menu veg filter': () => MenuItem.find({ isActive: true, isVeg: true }).sort({ sortOrder: 1 }),
  'menu item by slug': () => MenuItem.find({ slug: 'item-5' }),
  'menu text search': () => MenuItem.find({ $text: { $search: 'hot' } }),
  'banners (public)': () => Banner.find({ isActive: true }).sort({ position: 1, sortOrder: 1 }),
  'delivery zone by pincode': () => DeliveryZone.find({ pincodes: '452003', isActive: true }),
  'coupon by code': () => Coupon.find({ code: 'CODE7' }),
  'public coupons': () => Coupon.find({ isActive: true, isPublic: true }),
  'cart by user': () => Cart.find({ userId: uid() }),
  'my orders (cursor)': () => Order.find({ userId: uid() }).sort({ _id: -1 }).limit(20),
  'order by number': () => Order.find({ orderNumber: 'O-10' }),
  'kitchen board by status': () => Order.find({ status: 'PLACED' }).sort({ createdAt: 1 }),
  'rider deliveries': () =>
    Order.find({ riderId: oid(), status: { $in: ['READY', 'OUT_FOR_DELIVERY'] } }),
  'unpaid-order expiry job': () =>
    Order.find({ 'payment.status': 'pending', status: 'PLACED', createdAt: { $lt: new Date() } }),
  'analytics orders by day': () =>
    Order.find({ createdAt: { $gte: new Date(Date.now() - 864e5), $lt: new Date() } }),
  'payment by gateway order id': () => Payment.find({ providerOrderId: 'o5' }),
  'payment by gateway payment id': () => Payment.find({ providerPaymentId: 'p5' }),
  'payments for an order': () => Payment.find({ purpose: 'order', refId: oid() }).sort({ _id: -1 }),
  'notifications inbox': () => Notification.find({ userId: uid() }).sort({ _id: -1 }).limit(20),
  'unread count': () => Notification.find({ userId: uid(), readAt: { $exists: false } }),
  'slot availability for a day': () => SlotInventory.find({ date: '2026-10-05' }),
  'seat counter (unique)': () => SlotInventory.find({ slotId: oid(), date: '2026-10-05' }),
  'my bookings': () => TableBooking.find({ userId: uid() }).sort({ _id: -1 }).limit(20),
  'staff booking day view': () => TableBooking.find({ date: '2026-10-12' }).sort({ startsAt: 1 }),
  'booking hold expiry job': () =>
    TableBooking.find({ status: 'HELD', holdExpiresAt: { $lt: new Date() } }),
  'party inbox by status': () =>
    PartyInquiry.find({ status: 'SUBMITTED' }).sort({ _id: -1 }).limit(30),
  'party by event date': () =>
    PartyInquiry.find({
      eventDate: { $gte: '2026-11-01', $lte: '2026-11-30' },
      status: 'CONFIRMED',
    }),
  'party token expiry job': () =>
    PartyInquiry.find({ status: 'ACCEPTED', 'token.dueAt': { $lt: new Date() } }),
  'party quote expiry job': () =>
    PartyInquiry.find({ status: 'QUOTED', 'quote.validUntil': { $lt: new Date() } }),
  'public party packages': () => PartyPackage.find({ isActive: true }).sort({ sortOrder: 1 }),
  'public reviews': () => Review.find({ status: 'published' }).sort({ _id: -1 }).limit(20),
};

describe('every hot query is index-backed', () => {
  it.each(Object.entries(QUERIES))('%s', async (_name, build) => {
    const stages = await plan(build());
    expect(stages).not.toContain('COLLSCAN');
    expect(stages).not.toContain('SORT'); // an in-memory SORT stage means the sort is not covered by the index
  });
});

describe('index definitions', () => {
  it('has TTL indexes for temporary data', async () => {
    const ttl = async (m) =>
      (await m.collection.indexes())
        .filter((i) => i.expireAfterSeconds !== undefined)
        .map((i) => Object.keys(i.key)[0]);
    expect(await ttl(RefreshToken)).toContain('expiresAt');
    expect(await ttl(Cart)).toContain('expiresAt');
    expect(await ttl(Notification)).toContain('createdAt');
    expect(await ttl(SlotInventory)).toContain('expiresAt');
  });
});
