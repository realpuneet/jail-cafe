import { Category } from '../models/Category.js';
import { MenuItem } from '../models/MenuItem.js';
import { ApiError } from '../utils/ApiError.js';
import { cached, invalidate } from '../utils/cache.js';
import { CACHE_TTL } from '../utils/constants.js';
import { paginate } from '../utils/pagination.js';
import { createWithSlug } from '../utils/slugify.js';
import { sanitizeImages } from './catalog.helpers.js';

const PUBLIC = 'name slug description image sortOrder';

/** Public: active categories in display order (cached). */
export const listPublic = () =>
  cached('catalog', ['categories'], CACHE_TTL.CATALOG, () =>
    Category.find({ isActive: true }, PUBLIC).sort({ sortOrder: 1, name: 1 }).lean(),
  );

/** Admin/staff: all categories, cursor paginated. */
export const listAdmin = (q) => paginate(Category, { limit: q.limit, cursor: q.cursor });

/** @param {object} input validated payload */
export async function create(input) {
  const data = sanitizeImages(input);
  const doc = await createWithSlug((slug) => Category.create({ ...data, slug }), data.name);
  await invalidate('catalog');
  return doc.toObject();
}

/**
 * @param {string} id
 * @param {object} patch
 */
export async function update(id, patch) {
  const doc = await Category.findByIdAndUpdate(
    id,
    { $set: sanitizeImages(patch) },
    {
      returnDocument: 'after',
      runValidators: true,
    },
  ).lean();
  if (!doc) throw ApiError.notFound('Category not found');
  await invalidate('catalog');
  return doc;
}

/** Soft delete; refused while active menu items still use the category. */
export async function remove(id) {
  const inUse = await MenuItem.exists({ categoryId: id, isActive: true });
  if (inUse) throw ApiError.conflict('Category still has active menu items');
  const doc = await Category.findByIdAndUpdate(id, { $set: { isActive: false } }).lean();
  if (!doc) throw ApiError.notFound('Category not found');
  await invalidate('catalog');
}
