import { Category } from '../models/Category.js';
import { MenuItem } from '../models/MenuItem.js';
import { ApiError } from '../utils/ApiError.js';
import { cached, invalidate } from '../utils/cache.js';
import { CACHE_TTL, MAX_PUBLIC_MENU_ITEMS } from '../utils/constants.js';
import { paginate } from '../utils/pagination.js';
import { createWithSlug } from '../utils/slugify.js';
import { Types } from 'mongoose';
import { sanitizeImages } from './catalog.helpers.js';

const LIST_FIELDS =
  'name slug description categoryId isVeg price mrp taxPercent image variants addOns tags prepTimeMinutes isAvailable sortOrder';

async function assertCategory(categoryId) {
  if (!(await Category.exists({ _id: categoryId, isActive: true }))) {
    throw ApiError.badRequest('Category does not exist');
  }
}

/**
 * Public menu. Results are cached per query (free-text searches are not cached: unbounded keys).
 * @param {{category?: string, veg?: boolean, q?: string, available?: boolean}} q
 */
export function listPublic({ category, veg, q, available }) {
  const filter = { isActive: true };
  if (category) filter.categoryId = new Types.ObjectId(category);
  if (typeof veg === 'boolean') filter.isVeg = veg;
  if (available) filter.isAvailable = true;

  if (q) {
    return MenuItem.find(
      { ...filter, $text: { $search: q } },
      { score: { $meta: 'textScore' }, ...project() },
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(50)
      .lean();
  }
  const parts = ['list', category ?? '*', veg ?? '*', available ?? '*'];
  return cached('catalog', parts, CACHE_TTL.CATALOG, () =>
    MenuItem.find(filter, LIST_FIELDS)
      .sort({ sortOrder: 1, name: 1 })
      .limit(MAX_PUBLIC_MENU_ITEMS)
      .lean(),
  );
}

const project = () => Object.fromEntries(LIST_FIELDS.split(' ').map((f) => [f, 1]));

/** Public detail by id or slug (cached). @param {string} idOrSlug */
export async function getPublic(idOrSlug) {
  const item = await cached('catalog', ['item', idOrSlug], CACHE_TTL.CATALOG, () => {
    const by = Types.ObjectId.isValid(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
    return MenuItem.findOne({ ...by, isActive: true }, `${LIST_FIELDS} gallery`).lean();
  });
  if (!item) throw ApiError.notFound('Menu item not found');
  return item;
}

/** Admin/staff list including inactive items. */
export function listAdmin({ category, limit, cursor }) {
  const filter = category ? { categoryId: category } : {};
  return paginate(MenuItem, { filter, limit, cursor });
}

/** @param {object} input */
export async function create(input) {
  await assertCategory(input.categoryId);
  const data = sanitizeImages(input);
  const doc = await createWithSlug((slug) => MenuItem.create({ ...data, slug }), data.name);
  await invalidate('catalog');
  return doc.toObject();
}

/**
 * @param {string} id
 * @param {object} patch
 */
export async function update(id, patch) {
  if (patch.categoryId) await assertCategory(patch.categoryId);
  const doc = await MenuItem.findByIdAndUpdate(
    id,
    { $set: sanitizeImages(patch) },
    {
      returnDocument: 'after',
      runValidators: true,
    },
  ).lean();
  if (!doc) throw ApiError.notFound('Menu item not found');
  await invalidate('catalog');
  return doc;
}

/** Stock on/off toggle (staff). */
export async function setAvailability(id, isAvailable) {
  const doc = await MenuItem.findByIdAndUpdate(
    id,
    { $set: { isAvailable } },
    { returnDocument: 'after', projection: 'name isAvailable' },
  ).lean();
  if (!doc) throw ApiError.notFound('Menu item not found');
  await invalidate('catalog');
  return doc;
}

/** Soft delete. */
export async function remove(id) {
  const doc = await MenuItem.findByIdAndUpdate(id, { $set: { isActive: false } }).lean();
  if (!doc) throw ApiError.notFound('Menu item not found');
  await invalidate('catalog');
}
