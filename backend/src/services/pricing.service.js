import { MenuItem } from '../models/MenuItem.js';
import { ApiError } from '../utils/ApiError.js';

const ISSUES = Object.freeze({
  REMOVED: 'removed',
  OUT_OF_STOCK: 'out_of_stock',
  INVALID_OPTION: 'invalid_option',
});

/** GST is included in menu prices; this extracts the tax part for invoices. */
export const taxIncluded = (amount, percent) => Math.round((amount * percent) / (100 + percent));

/**
 * Price cart-like lines from the CURRENT menu. Client-supplied prices are never read.
 * @param {Array<{menuItemId: any, variantId?: any, addOnIds?: any[], quantity: number, note?: string, _id?: any}>} lines
 * @param {{strict?: boolean}} [opts] strict => throw 409 listing every problem
 */
export async function priceLines(lines, { strict = false } = {}) {
  const ids = [...new Set(lines.map((l) => String(l.menuItemId)))];
  const items = await MenuItem.find(
    { _id: { $in: ids } },
    'name isVeg price taxPercent image variants addOns isAvailable isActive',
  ).lean();
  const byId = new Map(items.map((i) => [String(i._id), i]));

  const priced = lines.map((line) => {
    const item = byId.get(String(line.menuItemId));
    const base = {
      lineId: line._id ? String(line._id) : undefined,
      menuItemId: String(line.menuItemId),
      quantity: line.quantity,
      note: line.note,
    };
    if (!item || !item.isActive)
      return { ...base, name: item?.name ?? 'Unavailable item', issue: ISSUES.REMOVED };

    let unitPrice = item.price;
    let variant;
    if (item.variants?.length) {
      variant = item.variants.find((v) => String(v._id) === String(line.variantId));
      if (!variant) return { ...base, name: item.name, issue: ISSUES.INVALID_OPTION };
      unitPrice = variant.price;
    } else if (line.variantId) {
      return { ...base, name: item.name, issue: ISSUES.INVALID_OPTION };
    }

    const wantedAddOns = [...new Set((line.addOnIds ?? []).map(String))];
    const addOns = [];
    for (const id of wantedAddOns) {
      const a = item.addOns?.find((x) => String(x._id) === id);
      if (!a) return { ...base, name: item.name, issue: ISSUES.INVALID_OPTION };
      addOns.push({
        addOnId: String(a._id),
        name: a.name,
        price: a.price,
        isAvailable: a.isAvailable !== false,
      });
    }
    unitPrice += addOns.reduce((n, a) => n + a.price, 0);

    const lineTotal = unitPrice * line.quantity;
    const outOfStock =
      !item.isAvailable || variant?.isAvailable === false || addOns.some((a) => !a.isAvailable);
    return {
      ...base,
      name: item.name,
      isVeg: item.isVeg,
      image: item.image?.thumbnailUrl ?? item.image?.url,
      variantId: variant ? String(variant._id) : undefined,
      variantName: variant?.name,
      addOns: addOns.map(({ isAvailable: _a, ...rest }) => rest),
      unitPrice,
      lineTotal,
      taxPercent: item.taxPercent ?? 0,
      taxIncluded: taxIncluded(lineTotal, item.taxPercent ?? 0),
      ...(outOfStock ? { issue: ISSUES.OUT_OF_STOCK } : {}),
    };
  });

  if (strict) {
    const problems = priced
      .filter((l) => l.issue)
      .map((l) => ({ menuItemId: l.menuItemId, name: l.name, issue: l.issue }));
    if (problems.length)
      throw ApiError.conflict('Some items in your cart are no longer available', problems);
  }
  return priced;
}

/**
 * Pure totals. All values in paise.
 * @param {{lines: Array<{lineTotal: number, taxIncluded: number}>, discount?: number, deliveryCharge?: number}} p
 */
export function computeTotals({ lines, discount = 0, deliveryCharge = 0 }) {
  const subtotal = lines.reduce((n, l) => n + (l.lineTotal ?? 0), 0);
  const tax = lines.reduce((n, l) => n + (l.taxIncluded ?? 0), 0);
  const appliedDiscount = Math.min(discount, subtotal);
  // Tax is already inside line totals; scale it down proportionally when a discount applies.
  const taxIncludedAfterDiscount = subtotal
    ? Math.round(tax * (1 - appliedDiscount / subtotal))
    : 0;
  return {
    subtotal,
    discount: appliedDiscount,
    deliveryCharge,
    taxIncluded: taxIncludedAfterDiscount,
    total: subtotal - appliedDiscount + deliveryCharge,
  };
}
