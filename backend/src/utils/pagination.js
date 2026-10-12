import { Types } from 'mongoose';
import { PAGINATION } from './constants.js';
import { ApiError } from './ApiError.js';

/** @param {unknown} v */
export const parseLimit = (v) =>
  Math.min(Math.max(Number.parseInt(v, 10) || PAGINATION.DEFAULT_LIMIT, 1), PAGINATION.MAX_LIMIT);

/** Opaque cursor <-> ObjectId. Cursors are `_id`-based so pagination never uses skip. */
export const encodeCursor = (id) => Buffer.from(String(id)).toString('base64url');
export function decodeCursor(cursor) {
  if (!cursor) return null;
  const id = Buffer.from(cursor, 'base64url').toString();
  if (!Types.ObjectId.isValid(id)) throw ApiError.badRequest('Invalid cursor');
  return new Types.ObjectId(id);
}

/**
 * Run a newest-first cursor-paginated query.
 * @param {import('mongoose').Model} model
 * @param {{filter?: object, projection?: object|string, limit?: number, cursor?: string}} opts
 * @returns {Promise<{items: object[], meta: {limit: number, nextCursor: string|null, hasMore: boolean}}>}
 */
export async function paginate(model, { filter = {}, projection, limit, cursor }) {
  const size = parseLimit(limit);
  const after = decodeCursor(cursor);
  const query = after ? { ...filter, _id: { $lt: after } } : filter;
  const rows = await model
    .find(query, projection)
    .sort({ _id: -1 })
    .limit(size + 1)
    .lean();
  const hasMore = rows.length > size;
  const items = hasMore ? rows.slice(0, size) : rows;
  return {
    items,
    meta: { limit: size, hasMore, nextCursor: hasMore ? encodeCursor(items.at(-1)._id) : null },
  };
}
