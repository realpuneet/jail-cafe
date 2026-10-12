import { createHash } from 'node:crypto';
import { Cart } from '../models/Cart.js';
import { ApiError } from '../utils/ApiError.js';
import { CART } from '../utils/constants.js';
import * as couponService from './coupon.service.js';
import { computeTotals, priceLines } from './pricing.service.js';

const expiry = () => new Date(Date.now() + CART.TTL_DAYS * 86_400_000);

/** Stable identity of a cart line, independent of add-on order. */
const lineKeyOf = ({ menuItemId, variantId, addOnIds = [], note }) =>
  createHash('sha1')
    .update(
      [menuItemId, variantId ?? '', [...new Set(addOnIds.map(String))].sort().join(','), note ?? '']
        .map(String)
        .join('|'),
    )
    .digest('hex');

/**
 * Priced view of the cart. Prices come from the current menu; coupon discount is previewed.
 * @param {string} userId
 */
export async function getCart(userId) {
  const cart = await Cart.findOne({ userId }).lean();
  const lines = cart?.items?.length ? await priceLines(cart.items) : [];
  const valid = lines.filter((l) => !l.issue);

  let coupon = null;
  let discount = 0;
  if (cart?.couponCode) {
    try {
      const { coupon: c, userUses } = await couponService.loadForUser(cart.couponCode, userId);
      const subtotal = valid.reduce((n, l) => n + l.lineTotal, 0);
      discount = couponService.evaluateCoupon(c, { subtotal, userUses });
      coupon = { code: cart.couponCode, discount };
    } catch (err) {
      coupon = { code: cart.couponCode, error: err.message };
    }
  }
  return {
    items: lines,
    coupon,
    summary: {
      itemCount: lines.reduce((n, l) => n + l.quantity, 0),
      ...computeTotals({ lines: valid, discount }),
    },
    hasIssues: lines.some((l) => l.issue),
  };
}

/**
 * Add an item (merges with an identical line). Every write is a single atomic Mongo update,
 * so concurrent taps never lose quantity.
 * @param {string} userId
 * @param {{menuItemId: string, variantId?: string, addOnIds?: string[], quantity: number, note?: string}} input
 */
export async function addItem(userId, input) {
  await priceLines([input], { strict: true }); // validates item, variant, add-ons, stock
  const lineKey = lineKeyOf(input);
  const line = { ...input, lineKey, addOnIds: [...new Set(input.addOnIds ?? [])] };

  for (let attempt = 0; attempt < 3; attempt++) {
    // 1) merge into an existing identical line
    const inc = await Cart.updateOne(
      { userId, 'items.lineKey': lineKey },
      { $inc: { 'items.$.quantity': input.quantity }, $set: { expiresAt: expiry() } },
    );
    if (inc.matchedCount) {
      await Cart.updateOne(
        { userId, items: { $elemMatch: { lineKey, quantity: { $gt: CART.MAX_QTY_PER_LINE } } } },
        { $set: { 'items.$.quantity': CART.MAX_QTY_PER_LINE } },
      );
      return getCart(userId);
    }
    // 2) append a new line (only if the cart has room and no one added the same line meanwhile)
    try {
      await Cart.updateOne(
        {
          userId,
          'items.lineKey': { $ne: lineKey },
          [`items.${CART.MAX_LINES - 1}`]: { $exists: false },
        },
        { $push: { items: line }, $set: { expiresAt: expiry() }, $setOnInsert: { userId } },
        { upsert: true },
      );
      return getCart(userId);
    } catch (err) {
      if (err.code !== 11000) throw err;
      // Either the cart is full, or a concurrent request created the same line: loop and re-check.
    }
  }
  throw ApiError.badRequest(`Cart can hold at most ${CART.MAX_LINES} different items`);
}

/** Set a line's quantity; 0 removes it. */
export async function setQuantity(userId, lineId, quantity) {
  const res =
    quantity === 0
      ? await Cart.updateOne(
          { userId, 'items._id': lineId },
          { $pull: { items: { _id: lineId } }, $set: { expiresAt: expiry() } },
        )
      : await Cart.updateOne(
          { userId, 'items._id': lineId },
          { $set: { 'items.$.quantity': quantity, expiresAt: expiry() } },
        );
  if (!res.matchedCount) throw ApiError.notFound('Cart item not found');
  return getCart(userId);
}

export async function clear(userId) {
  await Cart.deleteOne({ userId });
  return getCart(userId);
}

/** Attach a coupon code if it is valid for the current cart. */
export async function setCoupon(userId, code) {
  const view = await getCart(userId);
  if (!view.items.length) throw ApiError.badRequest('Your cart is empty');
  await couponService.validate(userId, code, view.summary.subtotal); // throws a friendly 400
  await Cart.updateOne({ userId }, { $set: { couponCode: code, expiresAt: expiry() } });
  return getCart(userId);
}

export async function clearCoupon(userId) {
  await Cart.updateOne({ userId }, { $unset: { couponCode: 1 } });
  return getCart(userId);
}
