import { Setting } from '../models/Setting.js';
import { cached, invalidate } from '../utils/cache.js';
import { CACHE_TTL } from '../utils/constants.js';
import { ApiError } from '../utils/ApiError.js';

export const DEFAULT_SETTINGS = Object.freeze({
  acceptingOrders: true,
  acceptingBookings: true,
  announcement: '',
  openingHours: '',
  contactPhone: '',
  address: '',
});

/** Settings merged over defaults (cached 60 s; admin writes invalidate immediately). */
export const getAll = () =>
  cached('settings', ['all'], CACHE_TTL.SETTINGS, async () => {
    const rows = await Setting.find({}, 'key value').lean();
    return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  });

/** Same data, safe for anyone (no secrets live here). */
export const getPublic = getAll;

/**
 * Update known keys only.
 * @param {Partial<typeof DEFAULT_SETTINGS>} patch
 */
export async function update(patch) {
  const entries = Object.entries(patch).filter(([k]) => k in DEFAULT_SETTINGS);
  await Promise.all(
    entries.map(([key, value]) =>
      Setting.updateOne({ key }, { $set: { value } }, { upsert: true }),
    ),
  );
  await invalidate('settings');
  return getAll();
}

export async function assertAcceptingOrders() {
  if (!(await getAll()).acceptingOrders) {
    throw ApiError.conflict("We're not taking orders right now. Please check back soon.");
  }
}
export async function assertAcceptingBookings() {
  if (!(await getAll()).acceptingBookings) {
    throw ApiError.conflict("We're not taking table bookings right now.");
  }
}
