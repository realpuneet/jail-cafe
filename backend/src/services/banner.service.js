import { Banner } from '../models/Banner.js';
import { ApiError } from '../utils/ApiError.js';
import { cached, invalidate } from '../utils/cache.js';
import { CACHE_TTL } from '../utils/constants.js';
import { paginate } from '../utils/pagination.js';
import { sanitizeImages } from './catalog.helpers.js';

/**
 * Public banners that are live now. The active list is cached; the schedule window is
 * applied at serve time so a banner starts/stops exactly on time without invalidation.
 * @param {string} [position]
 * @param {Date} [now]
 */
export async function listPublic(position, now = new Date()) {
  const all = await cached('banners', ['active'], CACHE_TTL.BANNERS, () =>
    Banner.find(
      { isActive: true },
      'title subtitle image linkUrl position sortOrder startsAt endsAt',
    )
      .sort({ position: 1, sortOrder: 1 })
      .lean(),
  );
  return all.filter(
    (b) =>
      (!position || b.position === position) &&
      (!b.startsAt || new Date(b.startsAt) <= now) &&
      (!b.endsAt || new Date(b.endsAt) > now),
  );
}

export const listAdmin = (q) => paginate(Banner, { limit: q.limit, cursor: q.cursor });

export async function create(input) {
  const doc = await Banner.create(sanitizeImages(input));
  await invalidate('banners');
  return doc.toObject();
}

export async function update(id, patch) {
  const doc = await Banner.findByIdAndUpdate(
    id,
    { $set: sanitizeImages(patch) },
    {
      returnDocument: 'after',
      runValidators: true,
    },
  ).lean();
  if (!doc) throw ApiError.notFound('Banner not found');
  await invalidate('banners');
  return doc;
}

export async function remove(id) {
  const doc = await Banner.findByIdAndDelete(id).lean();
  if (!doc) throw ApiError.notFound('Banner not found');
  await invalidate('banners');
}
