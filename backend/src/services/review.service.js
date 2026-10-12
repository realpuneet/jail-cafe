import { Order } from '../models/Order.js';
import { Review } from '../models/Review.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { cached, invalidate } from '../utils/cache.js';
import { CACHE_TTL, ORDER_STATUS, REVIEW_STATUS } from '../utils/constants.js';
import { paginate } from '../utils/pagination.js';

/**
 * Review a delivered order (once).
 * @param {string} userId
 * @param {{orderId: string, rating: number, comment?: string}} input
 */
export async function create(userId, { orderId, rating, comment }) {
  const order = await Order.findOne({ _id: orderId, userId }, 'status items.name').lean();
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status !== ORDER_STATUS.DELIVERED)
    throw ApiError.conflict('You can review an order once it is delivered');
  const user = await User.findById(userId, 'name').lean();
  try {
    const review = await Review.create({
      orderId,
      userId,
      reviewer: (user?.name ?? '').split(' ')[0] || 'Customer',
      rating,
      comment,
      items: [...new Set(order.items.map((i) => i.name))].slice(0, 5),
    });
    await invalidate('reviews');
    return review.toObject();
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('You already reviewed this order');
    throw err;
  }
}

export const getForOrder = (userId, orderId) => Review.findOne({ orderId, userId }).lean();

/** Public list of published reviews (cursor) + overall stats (cached). */
export const listPublic = (q) =>
  paginate(Review, {
    filter: { status: REVIEW_STATUS.PUBLISHED },
    projection: 'reviewer rating comment items createdAt',
    limit: q.limit,
    cursor: q.cursor,
  });

export const summary = () =>
  cached('reviews', ['summary'], CACHE_TTL.REVIEWS, async () => {
    const [row] = await Review.aggregate([
      { $match: { status: REVIEW_STATUS.PUBLISHED } },
      { $group: { _id: null, count: { $sum: 1 }, average: { $avg: '$rating' } } },
    ]);
    return { count: row?.count ?? 0, average: row ? Math.round(row.average * 10) / 10 : 0 };
  });

export const listAdmin = (q) =>
  paginate(Review, {
    filter: q.status ? { status: q.status } : {},
    limit: q.limit,
    cursor: q.cursor,
  });

export async function setStatus(id, status) {
  const review = await Review.findByIdAndUpdate(
    id,
    { $set: { status } },
    { returnDocument: 'after' },
  ).lean();
  if (!review) throw ApiError.notFound('Review not found');
  await invalidate('reviews');
  return review;
}
