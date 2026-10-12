import { PartyPackage } from '../models/PartyPackage.js';
import { ApiError } from '../utils/ApiError.js';
import { cached, invalidate } from '../utils/cache.js';
import { CACHE_TTL } from '../utils/constants.js';
import { paginate } from '../utils/pagination.js';
import { createWithSlug } from '../utils/slugify.js';
import { sanitizeImages } from './catalog.helpers.js';

const PUBLIC =
  'name slug type tagline description image pricePerGuest minGuests maxGuests durationHours inclusions';

/** Public: active packages in display order (cached under the catalog namespace). */
export const listPublic = (type) =>
  cached('catalog', ['party', type ?? '*'], CACHE_TTL.CATALOG, () =>
    PartyPackage.find({ isActive: true, ...(type ? { type } : {}) }, PUBLIC)
      .sort({ sortOrder: 1, pricePerGuest: 1 })
      .lean(),
  );

export const getPublic = async (slug) => {
  const pkg = await cached('catalog', ['party-item', slug], CACHE_TTL.CATALOG, () =>
    PartyPackage.findOne({ slug, isActive: true }, PUBLIC).lean(),
  );
  if (!pkg) throw ApiError.notFound('Package not found');
  return pkg;
};

export const listAdmin = (q) => paginate(PartyPackage, { limit: q.limit, cursor: q.cursor });

export async function create(input) {
  const data = sanitizeImages(input);
  if (data.minGuests > data.maxGuests)
    throw ApiError.validation('minGuests cannot exceed maxGuests');
  const doc = await createWithSlug((slug) => PartyPackage.create({ ...data, slug }), data.name);
  await invalidate('catalog');
  return doc.toObject();
}

export async function update(id, patch) {
  const current = await PartyPackage.findById(id).lean();
  if (!current) throw ApiError.notFound('Package not found');
  const next = { ...current, ...patch };
  if (next.minGuests > next.maxGuests)
    throw ApiError.validation('minGuests cannot exceed maxGuests');
  const doc = await PartyPackage.findByIdAndUpdate(
    id,
    { $set: sanitizeImages(patch) },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  await invalidate('catalog');
  return doc;
}

export async function remove(id) {
  const doc = await PartyPackage.findByIdAndUpdate(id, { $set: { isActive: false } }).lean();
  if (!doc) throw ApiError.notFound('Package not found');
  await invalidate('catalog');
}
