import { jest } from '@jest/globals';
import { setRedisClient } from '../../src/config/redis.js';
import { computeQuote, haversineKm } from '../../src/services/deliveryZone.service.js';
import { evaluateCoupon } from '../../src/services/coupon.service.js';
import { cached, invalidate } from '../../src/utils/cache.js';
import { slugify } from '../../src/utils/slugify.js';
import { FakeRedis } from '../helpers/fakeRedis.js';

const now = new Date('2026-01-10T12:00:00Z');
const base = {
  isActive: true,
  type: 'percent',
  value: 20,
  minOrderAmount: 30000,
  usedCount: 0,
  perUserLimit: 1,
};

describe('evaluateCoupon', () => {
  it('percent coupon is floored and capped by maxDiscount', () => {
    expect(evaluateCoupon({ ...base, maxDiscount: 10000 }, { subtotal: 99999, now })).toBe(10000);
    expect(evaluateCoupon({ ...base }, { subtotal: 33333, now })).toBe(6666);
  });
  it('flat coupon never exceeds the subtotal', () => {
    expect(
      evaluateCoupon(
        { ...base, type: 'flat', value: 50000, minOrderAmount: 0 },
        { subtotal: 20000, now },
      ),
    ).toBe(20000);
  });
  it.each([
    ['inactive', { isActive: false }, {}, /Invalid coupon/],
    ['not started', { startsAt: '2026-02-01' }, {}, /not active yet/],
    ['expired', { expiresAt: '2026-01-10T12:00:00Z' }, {}, /expired/],
    ['exhausted', { usageLimit: 5, usedCount: 5 }, {}, /fully redeemed/],
    ['per-user limit', {}, { userUses: 1 }, /already used/],
    ['below minimum', {}, { subtotal: 10000 }, /Add items worth Rs 200 more/],
  ])('rejects: %s', (_n, patch, ctx, msg) => {
    expect(() => evaluateCoupon({ ...base, ...patch }, { subtotal: 50000, now, ...ctx })).toThrow(
      msg,
    );
  });
  it('rejects a missing coupon', () => {
    expect(() => evaluateCoupon(null, { subtotal: 1, now })).toThrow(/Invalid coupon/);
  });
});

describe('delivery quote', () => {
  const zones = [
    {
      _id: 'a',
      kind: 'pincode',
      name: 'Core',
      pincodes: ['452001'],
      deliveryCharge: 3000,
      freeDeliveryAbove: 40000,
      estimatedMinutes: 30,
    },
    {
      _id: 'b',
      kind: 'distance',
      name: '0-3km',
      minKm: 0,
      maxKm: 3,
      deliveryCharge: 2000,
      estimatedMinutes: 35,
    },
    {
      _id: 'c',
      kind: 'distance',
      name: '3-7km',
      minKm: 3,
      maxKm: 7,
      deliveryCharge: 5000,
      minOrderAmount: 30000,
      estimatedMinutes: 50,
    },
  ];
  const origin = { lat: 22.7196, lng: 75.8577 };

  it('matches pincode zones and applies free delivery above the threshold', () => {
    expect(computeQuote(zones, { pincode: '452001', subtotal: 10000 }, origin)).toMatchObject({
      zoneId: 'a',
      deliveryCharge: 3000,
      freeDeliveryApplied: false,
    });
    expect(computeQuote(zones, { pincode: '452001', subtotal: 40000 }, origin)).toMatchObject({
      deliveryCharge: 0,
      freeDeliveryApplied: true,
    });
  });
  it('falls back to distance tiers and reports distance', () => {
    const q = computeQuote(
      zones,
      { pincode: '999999', lat: 22.7396, lng: 75.8577, subtotal: 10000 },
      origin,
    );
    expect(q.zoneId).toBe('b');
    expect(q.distanceKm).toBeCloseTo(2.2, 1);
    const far = computeQuote(zones, { lat: 22.7196 + 0.045, lng: 75.8577, subtotal: 1 }, origin); // ~5 km
    expect(far).toMatchObject({ zoneId: 'c', minOrderAmount: 30000 });
  });
  it('refuses unserviceable locations (beyond radius or unknown pincode)', () => {
    expect(() => computeQuote(zones, { lat: 23.5, lng: 75.8577, subtotal: 1 }, origin)).toThrow(
      /do not deliver/,
    );
    expect(() => computeQuote(zones, { pincode: '111111', subtotal: 1 }, origin)).toThrow(
      /do not deliver/,
    );
  });
  it('haversine is sane', () => {
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.2, 0);
  });
});

describe('slugify', () => {
  it('normalizes text', () => {
    expect(slugify('  Masala Chai (Kulhad)!  ')).toBe('masala-chai-kulhad');
    expect(slugify('Café Crème')).toBe('cafe-creme');
    expect(slugify('!!!')).toBe('item');
  });
});

describe('cache', () => {
  let redis;
  beforeEach(() => {
    redis = new FakeRedis();
    setRedisClient(redis);
  });

  it('loads once, serves hits, and refreshes after invalidate', async () => {
    const loader = jest.fn().mockResolvedValueOnce({ n: 1 }).mockResolvedValueOnce({ n: 2 });
    expect(await cached('menu', ['a'], 60, loader)).toEqual({ n: 1 });
    expect(await cached('menu', ['a'], 60, loader)).toEqual({ n: 1 });
    expect(loader).toHaveBeenCalledTimes(1);
    await invalidate('menu');
    expect(await cached('menu', ['a'], 60, loader)).toEqual({ n: 2 });
  });

  it('single-flights concurrent misses', async () => {
    const loader = jest.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return 'x';
    });
    await Promise.all([1, 2, 3, 4].map(() => cached('menu', ['sf'], 60, loader)));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('keeps namespaces independent and caches null', async () => {
    const l1 = jest.fn(async () => null);
    await cached('coupons', ['x'], 60, l1);
    await cached('coupons', ['x'], 60, l1);
    expect(l1).toHaveBeenCalledTimes(1);
    await invalidate('menu');
    await cached('coupons', ['x'], 60, l1);
    expect(l1).toHaveBeenCalledTimes(1);
  });

  it('fails open when Redis is down', async () => {
    redis.get = async () => {
      throw new Error('ECONNREFUSED');
    };
    expect(await cached('menu', ['z'], 60, async () => 'db')).toBe('db');
  });
});
